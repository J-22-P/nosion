import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  findNosionRefs,
  ProblemType,
  taskPayloadSchema,
  type GitHubIntegrationDto,
  type GitHubSyncResultDto,
  type GitHubWebhookSecretDto,
} from '@nosion/contracts';
import { OnEvent } from '@nestjs/event-emitter';
import { randomBytes } from 'node:crypto';
import { GITHUB_CONNECTED_EVENT, OAuthService } from '../../auth/oauth/oauth.service';
import { EntriesService } from '../../entries/entries.service';
import { APP_CONFIG, type AppConfig } from '../../infra/config/env';
import { SecretBox } from '../../infra/crypto/secret-box';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  issueClientId,
  planIssue,
  type GitHubIssue,
  type IssuePlan,
  type SyncedTask,
} from './issue-plan';
import { verifyGitHubSignature } from './signature';

/** ดึงครั้งแรกเอาเฉพาะ issue ที่เปิดอยู่ · ครั้งต่อไปดึงทุกสถานะที่เปลี่ยนหลังรอบก่อน (เผื่อ 1 ชม. กันนาฬิกาเหลื่อม) */
const SINCE_OVERLAP_MS = 60 * 60_000;
/** 3 หน้า × 100 — ผู้ใช้ทั่วไปมี issue ที่ได้รับมอบหมายไม่ถึงนี้ · กันวนดึงไม่จบในฟังก์ชันที่มีเวลา 10 วิ */
const MAX_PAGES = 3;
const PROJECT_NAME = 'GitHub';
const PROJECT_COLOR = '#24292f';

export class GitHubTokenError extends Error {}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: OAuthService,
    private readonly entries: EntriesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.box = new SecretBox(config.ENCRYPTION_KEY);
  }

  async status(userId: string): Promise<GitHubIntegrationDto> {
    const [account, integration] = await Promise.all([
      this.prisma.oAuthAccount.findUnique({
        where: { userId_provider: { userId, provider: 'github' } },
      }),
      this.prisma.gitHubIntegration.findUnique({ where: { userId } }),
    ]);
    const scopes = account?.scopes?.split(' ') ?? [];
    return {
      connected: Boolean(account?.accessTokenEnc),
      login: account?.login ?? null,
      privateRepos: scopes.includes('repo'),
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

  async sync(userId: string, now = new Date()): Promise<GitHubSyncResultDto> {
    const credentials = await this.oauth.accessToken(userId, 'github');
    if (!credentials) {
      throw new ConflictException({
        type: ProblemType.conflict,
        title: 'GitHub not connected',
        message: 'ยังไม่ได้เชื่อม GitHub — เชื่อมจากหน้าตั้งค่าก่อน',
      });
    }
    const integration = await this.ensureIntegration(userId);
    const since = integration.lastSyncAt
      ? new Date(integration.lastSyncAt.getTime() - SINCE_OVERLAP_MS)
      : null;

    let issues: GitHubIssue[];
    try {
      issues = await this.fetchAssignedIssues(credentials.token, since);
    } catch (err) {
      const message = err instanceof GitHubTokenError ? err.message : 'ติดต่อ GitHub ไม่สำเร็จ';
      await this.prisma.gitHubIntegration.update({
        where: { userId },
        data: { lastSyncError: message },
      });
      throw new ConflictException({
        type: ProblemType.conflict,
        title: 'GitHub sync failed',
        message,
      });
    }

    const result: GitHubSyncResultDto = { created: 0, updated: 0, completed: 0, unchanged: 0 };
    for (const issue of issues) {
      const applied = await this.applyIssue(userId, issue);
      if (applied.kind === 'create') result.created++;
      else if (applied.kind === 'update' && applied.completes) result.completed++;
      else if (applied.kind === 'update') result.updated++;
      else result.unchanged++;
    }

    await this.prisma.gitHubIntegration.update({
      where: { userId },
      data: {
        lastSyncAt: now,
        lastSyncCount: result.created + result.updated + result.completed,
        lastSyncError: null,
      },
    });
    return result;
  }

  /** เพิ่งเชื่อม GitHub → ดึงรอบแรกเลย ไม่ต้องรอ cron (ผู้ใช้เห็นงานทันทีที่กลับเข้าแอป) */
  @OnEvent(GITHUB_CONNECTED_EVENT, { promisify: true })
  async onConnected({ userId }: { userId: string }): Promise<void> {
    await this.sync(userId).catch((err: unknown) => {
      this.logger.warn(`ดึง issue รอบแรกของ ${userId} ไม่สำเร็จ: ${(err as Error).message}`);
    });
  }

  /** cron: ผู้ใช้ที่เชื่อม GitHub แล้ว เรียงจากที่ซิงก์นานที่สุดก่อน — ทีละไม่กี่คน (ฟังก์ชันมีเวลา 10 วิ) */
  async syncDue(limit = 10): Promise<{ users: number; failed: number }> {
    const accounts = await this.prisma.oAuthAccount.findMany({
      where: { provider: 'github', accessTokenEnc: { not: null }, user: { deletedAt: null } },
      select: { userId: true, user: { select: { githubIntegration: true } } },
    });
    const due = accounts
      .sort(
        (a, b) =>
          (a.user.githubIntegration?.lastSyncAt?.getTime() ?? 0) -
          (b.user.githubIntegration?.lastSyncAt?.getTime() ?? 0),
      )
      .slice(0, limit);
    let failed = 0;
    for (const { userId } of due) {
      await this.sync(userId).catch(() => failed++);
    }
    return { users: due.length, failed };
  }

  /** ใช้ทั้งตอนดึงและตอน webhook ส่ง event `issues` มา */
  async applyIssue(userId: string, issue: GitHubIssue): Promise<IssuePlan> {
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
          github: taskPayloadSchema.parse(row.payload ?? {}).github,
        }
      : null;

    const plan = planIssue(issue, existing);
    if (plan.kind === 'create') {
      await this.entries.create(userId, {
        module: 'task',
        title: plan.fields.title,
        description: plan.fields.description,
        occurredAt: plan.fields.occurredAt,
        isAllDay: true,
        payload: { github: plan.fields.github },
        projectId: await this.githubProjectId(userId),
        clientId: issueClientId(issue),
      });
    } else if (plan.kind === 'update') {
      await this.entries.update(userId, plan.id, {
        version: plan.version,
        ...plan.patch,
        payload: { github: plan.github },
      });
      if (plan.completes) await this.entries.complete(userId, plan.id);
    }
    return plan;
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
    const account = await this.prisma.oAuthAccount.findUnique({
      where: { userId_provider: { userId, provider: 'github' } },
      select: { login: true },
    });
    const login = account?.login?.toLowerCase();
    return Boolean(login && issue.assignees?.some((a) => a.login.toLowerCase() === login));
  }

  // ── ภายใน ────────────────────────────────────────────

  private async fetchAssignedIssues(token: string, since: Date | null): Promise<GitHubIssue[]> {
    const all: GitHubIssue[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const q = new URLSearchParams({
        filter: 'assigned',
        state: since ? 'all' : 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: '100',
        page: String(page),
        ...(since ? { since: since.toISOString() } : {}),
      });
      const res = await fetch(`https://api.github.com/issues?${q}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'NOSION',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 401) {
        throw new GitHubTokenError(
          'สิทธิ์เข้าถึง GitHub ถูกเพิกถอนหรือหมดอายุ — กดเชื่อม GitHub ใหม่',
        );
      }
      if (!res.ok) throw new Error(`GitHub ตอบ ${res.status}`);
      const batch = (await res.json()) as GitHubIssue[];
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
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
