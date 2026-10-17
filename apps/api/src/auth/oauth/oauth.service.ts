import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  OAUTH_MISCONFIGURED_REASONS,
  OAUTH_PROVIDERS,
  ProblemType,
  type AuthUserDto,
  type OAuthAccountsDto,
  type OAuthErrorCode,
  type OAuthProvider,
  type OAuthProvidersDto,
} from '@nosion/contracts';
import type { User } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../infra/config/env';
import { SecretBox } from '../../infra/crypto/secret-box';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { isValidTimeZone } from '../../users/timezone';
import { AuthService } from '../auth.service';
import type { IssuedTokens, RequestMeta } from '../auth.types';
import {
  authorizationUrl,
  BASE_SCOPES,
  createPkce,
  fetchProfile,
  GITHUB_PRIVATE_REPO_SCOPE,
  OAuthExchangeError,
  type OAuthProfile,
  type ProviderCredentials,
} from './oauth-providers';

/** คุกกี้ที่ถือ state + PKCE verifier ระหว่างไปหน้าผู้ให้บริการแล้วกลับมา */
export const OAUTH_STATE_COOKIE = 'nosion_oauth';
export const OAUTH_STATE_TTL_MS = 10 * 60_000;
const LINK_INTENT_TTL_MS = 2 * 60_000;

/**
 * เชื่อม GitHub สำเร็จ (ล็อกอินหรือผูกจากหน้าตั้งค่า) — integrations/github ฟังแล้วดึง issue รอบแรก
 * ใช้ event แทนการเรียกตรง: auth ไม่ต้องรู้จัก integrations (ไม่งั้น module วนกัน)
 */
export const GITHUB_CONNECTED_EVENT = 'oauth.github.connected';
/** รอการดึงรอบแรกไม่เกินนี้ก่อน redirect — ไม่ทันก็ได้จาก cron/ปุ่มทีหลัง (ฟังก์ชันมีเวลารวม 10 วิ) */
const FIRST_SYNC_BUDGET_MS = 3_000;

/** ข้อมูลที่ต้องจำข้ามการ redirect — เข้ารหัสทั้งก้อนในคุกกี้ (ไม่ต้องพึ่ง Redis · serverless ไม่มี memory ร่วม) */
interface OAuthFlowState {
  state: string;
  verifier: string;
  provider: OAuthProvider;
  /** มี = ผูกเข้ากับบัญชีนี้ (เริ่มจากหน้าตั้งค่า) · ไม่มี = เข้าสู่ระบบ/สมัคร */
  linkUserId?: string;
  timezone?: string;
  expiresAt: number;
}

interface LinkIntent {
  userId: string;
  provider: OAuthProvider;
  includePrivateRepos: boolean;
  expiresAt: number;
}

export class OAuthFlowError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    /** ผูกบัญชีจากหน้าตั้งค่า → ส่งกลับหน้าตั้งค่า ไม่ใช่หน้า login */
    readonly linking = false,
    /** รหัสจากผู้ให้บริการ (ถ้ามี) — ส่งต่อเป็น `?oauth_reason=` */
    readonly reason?: string,
  ) {
    super(code);
    this.name = 'OAuthFlowError';
  }
}

export type OAuthCallbackResult =
  | { kind: 'login'; issued: IssuedTokens & { user: AuthUserDto } }
  | { kind: 'linked'; provider: OAuthProvider };

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly events: EventEmitter2,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.box = new SecretBox(config.ENCRYPTION_KEY);
    if (this.missingEncryptionKey()) {
      this.logger.error(
        'ENCRYPTION_KEY ยังเป็นค่าเริ่มต้น (ศูนย์ล้วน) — ปิดการเข้าสู่ระบบด้วย Google/GitHub จนกว่าจะตั้ง',
      );
    }
  }

  providers(): OAuthProvidersDto {
    return Object.fromEntries(
      OAUTH_PROVIDERS.map((p) => [p, this.credentials(p) !== null]),
    ) as OAuthProvidersDto;
  }

  redirectUri(provider: OAuthProvider): string {
    return `${this.config.API_URL}/api/v1/auth/oauth/${provider}/callback`;
  }

  // ── เริ่ม flow ───────────────────────────────────────

  /**
   * สร้าง URL ไปหน้าผู้ให้บริการ + คุกกี้ state ที่เข้ารหัสแล้ว
   * `intent` = token จาก createLinkIntent (ผูกบัญชีจากหน้าตั้งค่า) · ไม่มี = เข้าสู่ระบบ
   */
  begin(
    provider: OAuthProvider,
    options: { intent?: string; timezone?: string },
  ): { url: string; cookie: string } {
    const link = options.intent ? this.readLinkIntent(options.intent, provider) : null;
    const creds = this.credentials(provider);
    if (!creds) throw new OAuthFlowError('provider_disabled', Boolean(link));

    const { verifier, challenge } = createPkce();
    const flow: OAuthFlowState = {
      state: randomBytes(24).toString('base64url'),
      verifier,
      provider,
      linkUserId: link?.userId,
      timezone:
        options.timezone && isValidTimeZone(options.timezone) ? options.timezone : undefined,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    };
    const scopes = [...BASE_SCOPES[provider]];
    if (provider === 'github' && link?.includePrivateRepos) scopes.push(GITHUB_PRIVATE_REPO_SCOPE);

    return {
      url: authorizationUrl(provider, {
        clientId: creds.clientId,
        redirectUri: this.redirectUri(provider),
        state: flow.state,
        challenge,
        scopes,
      }),
      cookie: this.box.seal(JSON.stringify(flow), 'oauth-state'),
    };
  }

  /** ผู้ใช้ที่ล็อกอินอยู่ขอผูกบัญชี — การเริ่ม flow เป็นการเปิดหน้าใหม่ (ไม่มี access token) จึงพก token อายุสั้นไปแทน */
  createLinkIntent(userId: string, provider: OAuthProvider, includePrivateRepos: boolean): string {
    if (!this.credentials(provider)) {
      throw new NotFoundException({
        type: ProblemType.notFound,
        title: 'Provider disabled',
        message: 'เซิร์ฟเวอร์นี้ยังไม่ได้เปิดการเชื่อมบัญชีนี้',
      });
    }
    const intent: LinkIntent = {
      userId,
      provider,
      includePrivateRepos,
      expiresAt: Date.now() + LINK_INTENT_TTL_MS,
    };
    return this.box.seal(JSON.stringify(intent), 'oauth-link-intent');
  }

  // ── กลับจากผู้ให้บริการ ─────────────────────────────

  async complete(
    provider: OAuthProvider,
    query: { code?: string; state?: string; error?: string },
    sealedCookie: string | undefined,
    meta: RequestMeta,
  ): Promise<OAuthCallbackResult> {
    const flow = this.readFlow(sealedCookie, provider);
    const linking = Boolean(flow?.linkUserId);
    // state ต้องตรงกับคุกกี้ของเบราว์เซอร์นี้ — กัน login CSRF (มีคนส่งลิงก์ callback ของบัญชีเขามาให้เรากด)
    if (!flow || !query.state || !safeEqual(query.state, flow.state)) {
      throw new OAuthFlowError('state_mismatch', linking);
    }
    if (query.error || !query.code) throw new OAuthFlowError('denied', linking);

    const creds = this.credentials(provider);
    if (!creds) throw new OAuthFlowError('provider_disabled', linking);

    let profile: OAuthProfile;
    try {
      profile = await fetchProfile(provider, creds, {
        code: query.code,
        verifier: flow.verifier,
        redirectUri: this.redirectUri(provider),
      });
    } catch (err) {
      const reason = err instanceof OAuthExchangeError ? err.reason : 'network';
      this.logger.warn(
        `OAuth ${provider} แลก code ไม่สำเร็จ: ${err instanceof OAuthExchangeError ? err.message : String(err)}`,
      );
      const misconfigured = (OAUTH_MISCONFIGURED_REASONS as readonly string[]).includes(reason);
      throw new OAuthFlowError(
        misconfigured ? 'provider_misconfigured' : 'exchange_failed',
        linking,
        reason,
      );
    }

    if (flow.linkUserId) {
      await this.link(flow.linkUserId, provider, profile);
      await this.announceConnected(provider, flow.linkUserId);
      return { kind: 'linked', provider };
    }
    const user = await this.findOrCreateUser(provider, profile, flow.timezone);
    await this.announceConnected(provider, user.id);
    return { kind: 'login', issued: await this.auth.startSession(user, meta) };
  }

  // ── บัญชีที่ผูกไว้ (หน้าตั้งค่า) ──────────────────────

  async listAccounts(userId: string): Promise<OAuthAccountsDto> {
    const [accounts, user] = await Promise.all([
      this.prisma.oAuthAccount.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } }),
    ]);
    return {
      hasPassword: user.passwordHash !== null,
      accounts: accounts.map((a) => ({
        provider: a.provider as OAuthProvider,
        login: a.login,
        scopes: a.scopes?.split(' ').filter(Boolean) ?? [],
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async unlink(userId: string, provider: OAuthProvider): Promise<void> {
    const { accounts, hasPassword } = await this.listAccounts(userId);
    if (!accounts.some((a) => a.provider === provider)) {
      throw new NotFoundException('ยังไม่ได้เชื่อมบัญชีนี้');
    }
    if (!hasPassword && accounts.length === 1) {
      throw new ConflictException({
        type: ProblemType.conflict,
        title: 'Last sign-in method',
        message:
          'นี่คือทางเข้าระบบทางเดียวของบัญชีนี้ — ตั้งรหัสผ่าน (ลืมรหัสผ่าน) หรือเชื่อมบัญชีอื่นก่อน',
      });
    }
    await this.prisma.oAuthAccount.deleteMany({ where: { userId, provider } });
  }

  /** access token ของผู้ให้บริการ (ถอดรหัสแล้ว) — ใช้ดึงข้อมูลจาก GitHub (ขั้น 5) */
  async accessToken(
    userId: string,
    provider: OAuthProvider,
  ): Promise<{ token: string; scopes: string[] } | null> {
    const account = await this.prisma.oAuthAccount.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!account?.accessTokenEnc) return null;
    const token = this.box.open(account.accessTokenEnc, `oauth-token:${account.id}`);
    return token ? { token, scopes: account.scopes?.split(' ').filter(Boolean) ?? [] } : null;
  }

  // ── ภายใน ────────────────────────────────────────────

  private async announceConnected(provider: OAuthProvider, userId: string): Promise<void> {
    if (provider !== 'github') return;
    const work = this.events.emitAsync(GITHUB_CONNECTED_EVENT, { userId }).catch((err: unknown) => {
      this.logger.warn(`ดึง issue รอบแรกไม่สำเร็จ: ${(err as Error).message}`);
    });
    await Promise.race([work, new Promise((r) => setTimeout(r, FIRST_SYNC_BUDGET_MS))]);
  }

  /**
   * กติกาการจับคู่บัญชี (เรียงตามลำดับ):
   *  1. เคยผูกบัญชีภายนอกนี้แล้ว → ผู้ใช้คนนั้น
   *  2. มีผู้ใช้อีเมลเดียวกัน → ผูกให้อัตโนมัติ **เฉพาะเมื่อทั้งสองฝั่งยืนยันอีเมลแล้ว**
   *     (ไม่งั้นใครก็สมัครด้วยอีเมลของเหยื่อทิ้งไว้ แล้วรอให้เหยื่อมาล็อกอินด้วย Google เข้าบัญชีที่ผู้ร้ายรู้รหัสผ่าน)
   *  3. ไม่มี → สร้างผู้ใช้ใหม่ (อีเมลยืนยันแล้วโดยผู้ให้บริการ · ไม่มีรหัสผ่าน)
   */
  private async findOrCreateUser(
    provider: OAuthProvider,
    profile: OAuthProfile,
    timezone: string | undefined,
  ): Promise<User> {
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
      include: { user: true },
    });
    if (existing) {
      if (existing.user.deletedAt || existing.user.isDemo) {
        throw new OAuthFlowError('account_unavailable');
      }
      await this.saveToken(existing.id, provider, profile);
      return existing.user;
    }

    if (!profile.email || !profile.emailVerified) throw new OAuthFlowError('email_unverified');

    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      if (byEmail.deletedAt || byEmail.isDemo) throw new OAuthFlowError('account_unavailable');
      if (!byEmail.emailVerified) throw new OAuthFlowError('email_conflict');
      await this.link(byEmail.id, provider, profile);
      return byEmail;
    }

    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        emailVerified: new Date(),
        displayName: profile.displayName.slice(0, 80),
        avatarUrl: profile.avatarUrl,
        settings: { create: timezone ? { timezone } : {} },
      },
    });
    await this.link(user.id, provider, profile);
    return user;
  }

  private async link(
    userId: string,
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<void> {
    const taken = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
    });
    if (taken && taken.userId !== userId) throw new OAuthFlowError('already_linked', true);

    // ผู้ใช้หนึ่งคนผูก provider เดียวกันได้บัญชีเดียว — เชื่อมใหม่ด้วยบัญชีอื่น = แทนที่ของเดิม
    const account = await this.prisma.oAuthAccount.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
        provider,
        providerUserId: profile.providerUserId,
        login: profile.login,
        scopes: profile.scopes.join(' '),
      },
      update: {
        providerUserId: profile.providerUserId,
        login: profile.login,
        scopes: profile.scopes.join(' '),
      },
    });
    await this.saveToken(account.id, provider, profile);
  }

  /**
   * เก็บ token เฉพาะ GitHub (ใช้ดึง issue) — Google ใช้แค่ยืนยันตัวตน ไม่มีเหตุผลต้องเก็บ
   * เข้ารหัสโดยผูก aad กับ id ของแถว: ก๊อป ciphertext ไปใส่แถวของคนอื่นแล้วถอดไม่ได้
   */
  private async saveToken(
    accountId: string,
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<void> {
    await this.prisma.oAuthAccount.update({
      where: { id: accountId },
      data: {
        login: profile.login,
        scopes: profile.scopes.join(' '),
        accessTokenEnc:
          provider === 'github'
            ? this.box.seal(profile.accessToken, `oauth-token:${accountId}`)
            : null,
      },
    });
  }

  private readFlow(sealed: string | undefined, provider: OAuthProvider): OAuthFlowState | null {
    if (!sealed) return null;
    const raw = this.box.open(sealed, 'oauth-state');
    if (!raw) return null;
    const flow = JSON.parse(raw) as OAuthFlowState;
    return flow.provider === provider && flow.expiresAt > Date.now() ? flow : null;
  }

  private readLinkIntent(sealed: string, provider: OAuthProvider): LinkIntent {
    const raw = this.box.open(sealed, 'oauth-link-intent');
    const intent = raw ? (JSON.parse(raw) as LinkIntent) : null;
    if (!intent || intent.provider !== provider || intent.expiresAt <= Date.now()) {
      throw new OAuthFlowError('state_mismatch', true);
    }
    return intent;
  }

  private credentials(provider: OAuthProvider): ProviderCredentials | null {
    const c = this.config;
    const [clientId, clientSecret] =
      provider === 'google'
        ? [c.GOOGLE_CLIENT_ID, c.GOOGLE_CLIENT_SECRET]
        : [c.GITHUB_CLIENT_ID, c.GITHUB_CLIENT_SECRET];
    if (!clientId || !clientSecret || this.missingEncryptionKey()) return null;
    return { clientId, clientSecret };
  }

  /**
   * production ที่ลืมตั้ง ENCRYPTION_KEY จะได้กุญแจศูนย์ล้วนจากค่าเริ่มต้น — ใครก็ถอดคุกกี้ state/token GitHub ได้
   * ปิด OAuth ไปเลย (ปุ่มหาย) ดีกว่าทำงานด้วยกุญแจที่ทุกคนรู้ · เครื่อง dev/เทสต์ใช้ค่าเริ่มต้นได้ตามเดิม
   */
  private missingEncryptionKey(): boolean {
    return this.config.NODE_ENV === 'production' && /^0+$/.test(this.config.ENCRYPTION_KEY);
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
