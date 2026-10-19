import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  findNosionRefs,
  ProblemType,
  taskPayloadSchema,
  type GitHubIntegrationDto,
  type GitHubPersonalTokenInput,
  type GitHubSyncResultDto,
  type GitHubWebhookSecretDto,
} from '@nosion/contracts';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { GITHUB_CONNECTED_EVENT, OAuthService } from '../../auth/oauth/oauth.service';
import { EntriesService } from '../../entries/entries.service';
import { APP_CONFIG, type AppConfig } from '../../infra/config/env';
import { SecretBox } from '../../infra/crypto/secret-box';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserContextService } from '../../users/user-context.service';
import { fetchSearchPage, GitHubSyncError, searchQuery } from './github-search';
import {
  issueClientId,
  planIssue,
  type GitHubIssue,
  type IssuePlan,
  type SyncedTask,
} from './issue-plan';
import { fetchTokenOwner, isFineGrained } from './personal-token';
import { verifyGitHubSignature } from './signature';

/** ครั้งแรกดึงทุก issue/PR ที่มอบหมาย (รวมที่ปิดแล้ว) · ครั้งต่อไปเฉพาะที่เปลี่ยนหลังรอบก่อน (เผื่อ 1 ชม. กันนาฬิกาเหลื่อม) */
const SINCE_OVERLAP_MS = 60 * 60_000;
/**
 * เริ่มหน้าใหม่เฉพาะเมื่อเพิ่งใช้เวลาไปไม่ถึงนี้ — หน้าละ ~2 วิ (GraphQL + ช่องของ Project) + สร้างงาน ~40 รายการ
 * ไม่ให้เกิน 10 วิของ Vercel Function · ที่เหลือจำ cursor ไว้ ดึงต่อในคำขอถัดไป (เว็บเรียกต่อเองจน more = false)
 */
const SYNC_BUDGET_MS = 3_500;
const PROJECT_NAME = 'GitHub';
const PROJECT_COLOR = '#24292f';

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: OAuthService,
    private readonly entries: EntriesService,
    private readonly userContext: UserContextService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.box = new SecretBox(config.ENCRYPTION_KEY);
  }

  async status(userId: string): Promise<GitHubIntegrationDto> {
    const [credentials, integration] = await Promise.all([
      this.credentials(userId),
      this.prisma.gitHubIntegration.findUnique({ where: { userId } }),
    ]);
    return {
      connected: credentials !== null,
      tokenSource: credentials?.source ?? null,
      login: credentials?.login ?? null,
      privateRepos: credentials ? seesPrivateRepos(credentials) : false,
      projectDates: credentials ? hasProjectScope(credentials.scopes) : false,
      syncInProgress: Boolean(integration?.syncCursor),
      lastSyncAt: integration?.lastSyncAt?.toISOString() ?? null,
      lastSyncCount: integration?.lastSyncCount ?? null,
      lastSyncError: integration?.lastSyncError ?? null,
      webhook: {
        url: integration?.webhookSecretEnc ? this.webhookUrl(integration.id) : null,
        configured: Boolean(integration?.webhookSecretEnc),
        lastDeliveryAt: integration?.lastDeliveryAt?.toISOString() ?? null,
      },
    };
  }

  // ── ดึง issue ที่ได้รับมอบหมาย ──────────────────────────

  /**
   * ดึง issue/PR ที่มอบหมายให้ผู้ใช้ — ทีละหน้าจนหมดเวลาที่ให้ (budgetMs) แล้วจำ cursor ไว้ · `more` = ยังมีต่อ
   * รอบหนึ่ง (run) ใช้คำค้นเดียวกันทุกหน้า: `since` มาจาก lastSyncAt ซึ่งไม่เปลี่ยนจนกว่ารอบจะจบ
   * จบรอบ → lastSyncAt = เวลาที่รอบเริ่ม (issue ที่แก้ระหว่างรอบ ถูกดึงในรอบหน้า)
   */
  async sync(
    userId: string,
    now = new Date(),
    budgetMs = SYNC_BUDGET_MS,
  ): Promise<GitHubSyncResultDto> {
    const credentials = await this.credentials(userId);
    if (!credentials) {
      throw new ConflictException({
        type: ProblemType.conflict,
        title: 'GitHub not connected',
        message: 'ยังไม่ได้เชื่อม GitHub — เชื่อมจากหน้าตั้งค่าก่อน',
      });
    }
    const integration = await this.ensureIntegration(userId);
    const runStartedAt = integration.syncCursor ? (integration.syncRunStartedAt ?? now) : now;
    const since = integration.lastSyncAt
      ? new Date(integration.lastSyncAt.getTime() - SINCE_OVERLAP_MS)
      : null;
    const query = searchQuery(credentials.login, since);
    const withProjects = hasProjectScope(credentials.scopes);
    const { timezone } = await this.userContext.forUser(userId);

    const result: GitHubSyncResultDto = {
      created: 0,
      updated: 0,
      completed: 0,
      unchanged: 0,
      more: false,
    };
    let cursor = integration.syncCursor;
    const started = Date.now();
    try {
      do {
        const page = await fetchSearchPage(credentials.token, query, cursor, withProjects);
        for (const issue of page.issues) {
          const applied = await this.applyIssueSafely(userId, issue, timezone);
          if (applied.kind === 'create') result.created++;
          else if (applied.kind === 'update' && applied.completes) result.completed++;
          else if (applied.kind === 'update') result.updated++;
          else result.unchanged++;
        }
        cursor = page.hasNextPage ? page.endCursor : null;
        result.more = cursor !== null;
        // บันทึกทุกหน้า — function ถูกตัดกลางทางก็ดึงต่อจากหน้านี้ได้ (หน้าที่ทำค้างทำซ้ำได้: clientId กันซ้ำ)
        await this.prisma.gitHubIntegration.update({
          where: { userId },
          data: {
            syncCursor: cursor,
            syncRunStartedAt: result.more ? runStartedAt : null,
            ...(result.more ? {} : { lastSyncAt: runStartedAt }),
            lastSyncCount: result.created + result.updated + result.completed,
            lastSyncError: null,
          },
        });
      } while (result.more && Date.now() - started < budgetMs);
    } catch (err) {
      if (!(err instanceof GitHubSyncError)) throw err;
      this.logger.warn(`ดึง issue ของ ${userId} ไม่สำเร็จ: ${err.message}`);
      await this.prisma.gitHubIntegration.update({
        where: { userId },
        data: { lastSyncError: err.code },
      });
      throw new BadGatewayException({
        type: ProblemType.internal,
        title: 'GitHub sync failed',
        message:
          SYNC_ERROR_TEXT[err.code as keyof typeof SYNC_ERROR_TEXT] ??
          `GitHub ตอบผิดปกติ (${err.code})`,
      });
    }
    return result;
  }

  /** เพิ่งเชื่อม GitHub → ดึงรอบแรกเลย ไม่ต้องรอ cron (ผู้ใช้เห็นงานทันทีที่กลับเข้าแอป) */
  @OnEvent(GITHUB_CONNECTED_EVENT, { promisify: true })
  async onConnected({ userId }: { userId: string }): Promise<void> {
    await this.sync(userId, new Date(), 0).catch((err: unknown) => {
      this.logger.warn(`ดึง issue รอบแรกของ ${userId} ไม่สำเร็จ: ${(err as Error).message}`);
    });
  }

  /**
   * cron: ผู้ใช้ที่ดึงได้ (ผูก OAuth หรือใส่ personal token) เรียงจากที่ซิงก์นานที่สุดก่อน
   * — ทีละไม่กี่คน (ฟังก์ชันมีเวลา 10 วิ)
   */
  async syncDue(limit = 10): Promise<{ users: number; failed: number }> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { oauthAccounts: { some: { provider: 'github', accessTokenEnc: { not: null } } } },
          { githubIntegration: { personalTokenEnc: { not: null } } },
        ],
      },
      select: { id: true, githubIntegration: { select: { lastSyncAt: true } } },
    });
    const due = users
      .map((u) => ({ userId: u.id, lastSyncAt: u.githubIntegration?.lastSyncAt?.getTime() ?? 0 }))
      .sort((a, b) => a.lastSyncAt - b.lastSyncAt)
      .slice(0, limit);
    let failed = 0;
    for (const { userId } of due) {
      await this.sync(userId).catch(() => failed++);
    }
    return { users: due.length, failed };
  }

  /** ใช้ทั้งตอนดึงและตอน webhook ส่ง event `issues` มา */
  async applyIssue(userId: string, issue: GitHubIssue, timeZone?: string): Promise<IssuePlan> {
    const row = await this.prisma.entry.findFirst({
      where: { userId, clientId: issueClientId(issue) },
    });
    const existing: SyncedTask | null = row
      ? {
          id: row.id,
          version: row.version,
          title: row.title,
          status: row.status,
          deleted: row.deletedAt !== null,
          hasDate: row.occurredAt !== null,
          github: taskPayloadSchema.parse(row.payload ?? {}).github,
        }
      : null;

    const tz = timeZone ?? (await this.userContext.forUser(userId)).timezone;
    const plan = planIssue(issue, existing, tz);
    if (plan.kind === 'create') {
      const created = await this.entries.create(userId, {
        module: 'task',
        title: plan.fields.title,
        description: plan.fields.description,
        occurredAt: plan.fields.occurredAt,
        isAllDay: true,
        payload: { github: plan.fields.github, startDate: plan.fields.startDate },
        projectId: await this.githubProjectId(userId),
        clientId: issueClientId(issue),
      });
      if (plan.completes) await this.completeAt(userId, created.id, plan.fields.completedAt);
    } else if (plan.kind === 'update') {
      await this.entries.update(userId, plan.id, {
        version: plan.version,
        ...plan.patch,
        payload: {
          github: plan.github,
          ...(plan.startDate !== undefined ? { startDate: plan.startDate } : {}),
        },
      });
      if (plan.completes) await this.completeAt(userId, plan.id, plan.completedAt);
    }
    return plan;
  }

  /**
   * ดึงกับ webhook (หรือกด "ดึงตอนนี้" ระหว่างรอบแรกที่เริ่มเองตอนเชื่อม) ทำ issue เดียวกันพร้อมกันได้ →
   * ฝั่งที่ช้ากว่าชน unique(clientId) หรือ version — อีกฝั่งทำให้แล้ว ถือว่าไม่ต้องทำอะไร ไม่ให้ทั้งรอบล้ม
   */
  private async applyIssueSafely(
    userId: string,
    issue: GitHubIssue,
    timeZone: string,
  ): Promise<IssuePlan> {
    try {
      return await this.applyIssue(userId, issue, timeZone);
    } catch (err) {
      const raced =
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') ||
        err instanceof ConflictException;
      if (!raced) throw err;
      return { kind: 'skip', reason: 'unchanged' };
    }
  }

  /** ปิดงานผ่าน EntriesService (event/การเตือนครบ) แล้วตั้งวันที่เสร็จเป็นวันที่ปิดจริงบน GitHub — สถิติย้อนหลังถูกวัน */
  private async completeAt(userId: string, id: string, closedAt: string | null): Promise<void> {
    await this.entries.complete(userId, id);
    if (closedAt) {
      await this.prisma.entry.updateMany({
        where: { id, userId },
        data: { completedAt: new Date(closedAt) },
      });
    }
  }

  // ── personal access token ───────────────────────────

  /**
   * ใส่ token เอง — ทางออกเมื่อ org จำกัด OAuth app (GitHub ซ่อน issue จากแอปที่ยังไม่อนุมัติโดยไม่แจ้ง error)
   * ตรวจกับ GitHub ก่อนเก็บ · ล้างจุดเริ่มให้รอบหน้าดึงใหม่ทั้งหมด (token ใหม่อาจเห็น issue เก่าที่เคยมองไม่เห็น)
   */
  async setPersonalToken(
    userId: string,
    { token }: GitHubPersonalTokenInput,
  ): Promise<GitHubIntegrationDto> {
    const owner = await fetchTokenOwner(token).catch((err: unknown) => {
      if (!(err instanceof GitHubSyncError)) throw err;
      if (err.code === 'revoked') {
        throw new UnprocessableEntityException({
          type: ProblemType.validationFailed,
          title: 'Invalid GitHub token',
          message: 'GitHub ไม่รับ token นี้ — หมดอายุ ถูกเพิกถอน หรือคัดลอกไม่ครบ',
        });
      }
      throw new BadGatewayException({
        type: ProblemType.internal,
        title: 'GitHub token check failed',
        message:
          SYNC_ERROR_TEXT[err.code as keyof typeof SYNC_ERROR_TEXT] ??
          `GitHub ตอบผิดปกติ (${err.code})`,
      });
    });
    const integration = await this.ensureIntegration(userId);
    await this.prisma.gitHubIntegration.update({
      where: { id: integration.id },
      data: {
        personalTokenEnc: this.box.seal(token, `github-pat:${integration.id}`),
        personalTokenLogin: owner.login,
        personalTokenScopes: owner.scopes.join(' '),
        lastSyncAt: null,
        syncCursor: null,
        syncRunStartedAt: null,
        lastSyncError: null,
      },
    });
    return this.status(userId);
  }

  /** เอา token ออก → กลับไปใช้ token ของ OAuth (ถ้ามี) ดึงใหม่ทั้งหมดด้วยสิทธิ์ของ OAuth */
  async removePersonalToken(userId: string): Promise<void> {
    await this.prisma.gitHubIntegration.updateMany({
      where: { userId },
      data: {
        personalTokenEnc: null,
        personalTokenLogin: null,
        personalTokenScopes: null,
        lastSyncAt: null,
        syncCursor: null,
        syncRunStartedAt: null,
        lastSyncError: null,
      },
    });
  }

  // ── webhook ─────────────────────────────────────────

  /** สร้าง/หมุน secret — แสดงครั้งเดียว · secret เดิมใช้ไม่ได้ทันที */
  async rotateWebhookSecret(userId: string): Promise<GitHubWebhookSecretDto> {
    const integration = await this.ensureIntegration(userId);
    const secret = randomBytes(32).toString('base64url');
    await this.prisma.gitHubIntegration.update({
      where: { id: integration.id },
      data: { webhookSecretEnc: this.box.seal(secret, `github-webhook:${integration.id}`) },
    });
    return { url: this.webhookUrl(integration.id), secret };
  }

  async disableWebhook(userId: string): Promise<void> {
    await this.prisma.gitHubIntegration.updateMany({
      where: { userId },
      data: { webhookSecretEnc: null },
    });
  }

  /**
   * รับ event จาก GitHub — ตรวจลายเซ็น HMAC-SHA256 ของ body ดิบก่อนเชื่ออะไรทั้งนั้น
   * ไม่รู้จัก id / ยังไม่เปิด webhook / ลายเซ็นผิด → ตอบ 404 เหมือนกันหมด (ไม่บอกว่า id ไหนมีจริง)
   */
  async handleWebhook(
    integrationId: string,
    event: string | undefined,
    signature: string | undefined,
    rawBody: Buffer | undefined,
  ): Promise<{ handled: string }> {
    const integration = await this.prisma.gitHubIntegration.findUnique({
      where: { id: integrationId },
    });
    const secret = integration?.webhookSecretEnc
      ? this.box.open(integration.webhookSecretEnc, `github-webhook:${integration.id}`)
      : null;
    if (!integration || !secret || !rawBody || !verifyGitHubSignature(secret, rawBody, signature)) {
      throw new NotFoundException();
    }

    await this.prisma.gitHubIntegration.update({
      where: { id: integration.id },
      data: { lastDeliveryAt: new Date() },
    });
    const payload = JSON.parse(rawBody.toString('utf8')) as WebhookPayload;
    const userId = integration.userId;

    if (event === 'pull_request' && payload.action === 'closed' && payload.pull_request?.merged) {
      const closed = await this.completeReferencedTasks(userId, payload);
      return { handled: `pull_request.merged: ปิด ${closed} งาน` };
    }
    if (event === 'issues' && payload.issue && payload.repository) {
      const issue: GitHubIssue = {
        ...payload.issue,
        repository_url: `https://api.github.com/repos/${payload.repository.full_name}`,
      };
      if (await this.isMine(userId, issue)) {
        const plan = await this.applyIssue(userId, issue);
        return { handled: `issues.${payload.action}: ${plan.kind}` };
      }
      return { handled: `issues.${payload.action}: ไม่ใช่ issue ของผู้ใช้นี้` };
    }
    return { handled: event === 'ping' ? 'pong' : `ไม่ได้ใช้ event ${event ?? '?'}` };
  }

  /**
   * PR merged → ปิดงานที่ PR อ้างถึง:
   *  1) `nosion:<id>` ในชื่อ/คำอธิบาย/ชื่อ branch
   *  2) งานที่ดึงมาจาก PR ตัวนี้เอง (repo + เลข PR ตรงกัน) และไม่ได้ปิด auto-close ไว้
   * งานที่ผูกกับ issue ที่ PR "Closes #n" ปิดผ่าน event `issues.closed` ที่ GitHub ส่งตามมาเอง
   */
  private async completeReferencedTasks(userId: string, payload: WebhookPayload): Promise<number> {
    const pr = payload.pull_request!;
    const refIds = findNosionRefs(pr.title, pr.body, pr.head?.ref);
    const repo = payload.repository?.full_name;
    const fromThisPr = repo
      ? await this.prisma.entry.findMany({
          where: {
            userId,
            module: 'task',
            deletedAt: null,
            AND: [
              { payload: { path: ['github', 'repo'], equals: repo } },
              { payload: { path: ['github', 'prNumber'], equals: pr.number } },
            ],
          },
          select: { id: true, payload: true },
        })
      : [];
    const ids = new Set([
      ...refIds,
      ...fromThisPr
        .filter((e) => taskPayloadSchema.parse(e.payload ?? {}).github?.autoCloseOnMerge !== false)
        .map((e) => e.id),
    ]);

    let closed = 0;
    for (const id of ids) {
      // อ้างถึงงานของคนอื่น/งานที่ไม่มีอยู่ → ข้ามเงียบ ๆ (findFirst กรอง userId แล้ว)
      const entry = await this.prisma.entry.findFirst({
        where: { id, userId, deletedAt: null, module: 'task' },
        select: { status: true },
      });
      if (!entry || entry.status === 'done') continue;
      await this.entries.complete(userId, id);
      closed++;
    }
    return closed;
  }

  /** webhook ระดับ repo ส่ง issue ของทุกคน — สนใจเฉพาะที่เคยดึงมาแล้ว หรือมอบหมายให้เจ้าของ webhook */
  private async isMine(userId: string, issue: GitHubIssue): Promise<boolean> {
    const known = await this.prisma.entry.count({
      where: { userId, clientId: issueClientId(issue) },
    });
    if (known > 0) return true;
    const login = (await this.credentials(userId))?.login.toLowerCase();
    return Boolean(login && issue.assignees?.some((a) => a.login.toLowerCase() === login));
  }

  // ── ภายใน ────────────────────────────────────────────

  /** token ที่ใช้ดึง — personal token ก่อน (ผู้ใช้ตั้งใจใส่เพื่อเลี่ยงข้อจำกัดของ OAuth) แล้วค่อย OAuth */
  private async credentials(userId: string): Promise<GitHubCredentials | null> {
    const integration = await this.prisma.gitHubIntegration.findUnique({
      where: { userId },
      select: {
        id: true,
        personalTokenEnc: true,
        personalTokenLogin: true,
        personalTokenScopes: true,
      },
    });
    if (integration?.personalTokenEnc && integration.personalTokenLogin) {
      const token = this.box.open(integration.personalTokenEnc, `github-pat:${integration.id}`);
      if (token) {
        return {
          source: 'personal',
          token,
          login: integration.personalTokenLogin,
          scopes: integration.personalTokenScopes?.split(' ').filter(Boolean) ?? [],
        };
      }
    }
    const [oauth, account] = await Promise.all([
      this.oauth.accessToken(userId, 'github'),
      this.prisma.oAuthAccount.findUnique({
        where: { userId_provider: { userId, provider: 'github' } },
        select: { login: true },
      }),
    ]);
    if (!oauth || !account?.login) return null;
    return { source: 'oauth', token: oauth.token, login: account.login, scopes: oauth.scopes };
  }

  private async ensureIntegration(userId: string) {
    return this.prisma.gitHubIntegration.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  /** งานจาก GitHub รวมไว้ในโปรเจกต์ "GitHub" — กรองดูทีเดียวได้ · ผู้ใช้ลบโปรเจกต์ทิ้ง = สร้างใหม่ตอนดึงครั้งหน้า */
  private async githubProjectId(userId: string): Promise<string> {
    const existing = await this.prisma.project.findFirst({
      where: { userId, name: PROJECT_NAME, deletedAt: null },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.project.create({
      data: { userId, name: PROJECT_NAME, color: PROJECT_COLOR, icon: 'github' },
    });
    return created.id;
  }

  private webhookUrl(integrationId: string): string {
    return `${this.config.API_URL}/api/v1/webhooks/github/${integrationId}`;
  }
}

interface GitHubCredentials {
  source: 'oauth' | 'personal';
  token: string;
  login: string;
  scopes: string[];
}

/** `repo` = เห็น repo ส่วนตัว · token fine-grained ไม่มี scope แต่ผู้ใช้เลือก repo (รวมส่วนตัว) ไว้ตอนสร้าง */
function seesPrivateRepos({ source, token, scopes }: GitHubCredentials): boolean {
  return scopes.includes('repo') || (source === 'personal' && isFineGrained(token));
}

interface WebhookPayload {
  action?: string;
  repository?: { full_name: string };
  issue?: Omit<GitHubIssue, 'repository_url'> & { repository_url?: string };
  pull_request?: {
    number: number;
    merged: boolean;
    title: string;
    body: string | null;
    head?: { ref: string };
  };
}

/** `read:project` (หรือ `project` ที่ครอบคลุม) — อ่านช่องวันที่ของ GitHub Project ได้ */
function hasProjectScope(scopes: string[]): boolean {
  return scopes.includes('read:project') || scopes.includes('project');
}

/** ข้อความ (ไทย) ของ error จากการดึง — เว็บภาษาอังกฤษแปลจาก lastSyncError (รหัส) เอง */
const SYNC_ERROR_TEXT = {
  revoked: 'สิทธิ์เข้าถึง GitHub ถูกเพิกถอนหรือหมดอายุ — กดเชื่อม GitHub ใหม่',
  forbidden: 'GitHub ไม่อนุญาตให้อ่านข้อมูลนี้ — org อาจยังไม่อนุมัติแอป NOSION',
  rate_limited: 'เรียก GitHub ถี่เกินไป — รอสักครู่แล้วลองใหม่',
  unreachable: 'ติดต่อ GitHub ไม่สำเร็จ — ลองใหม่อีกครั้ง',
} as const;
