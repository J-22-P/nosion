import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ProblemType,
  type AuthUserDto,
  type LoginInput,
  type RegisterInput,
  type SessionDto,
} from '@nosion/contracts';
import { TokenPurpose, type User } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { MailService } from '../infra/mail/mail.service';
import { PrismaService } from '../infra/prisma/prisma.service';
import { deviceLabelFrom, type IssuedTokens, type RequestMeta } from './auth.types';
import { PasswordService } from './password.service';
import { buildDemoDataset } from './demo/demo-dataset';
import { seedDemo } from './demo/seed-demo';
import { TokenService } from './token.service';

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

/** ใบที่เพิ่งถูกหมุนใช้ซ้ำได้ภายในเท่านี้ (ดู refresh) */
const ROTATION_GRACE_MS = 20_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ── สมัคร / เข้าสู่ระบบ ────────────────────────────────

  async register(
    input: RegisterInput,
    meta: RequestMeta,
  ): Promise<IssuedTokens & { user: AuthUserDto }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      // ไม่บอกตรง ๆ ว่าอีเมลนี้มีอยู่แล้ว — กัน user enumeration
      throw new ForbiddenException({
        type: ProblemType.conflict,
        title: 'Registration failed',
        message: 'ไม่สามารถสมัครด้วยอีเมลนี้ได้ หากเป็นของคุณลองเข้าสู่ระบบหรือรีเซ็ตรหัสผ่าน',
      });
    }

    if (await this.passwords.isPwned(input.password)) {
      throw new ForbiddenException({
        type: ProblemType.validationFailed,
        title: 'Weak password',
        message: 'รหัสผ่านนี้เคยปรากฏในข้อมูลที่รั่วไหล กรุณาใช้รหัสผ่านอื่น',
      });
    }

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        settings: { create: { timezone: input.timezone } },
      },
    });

    await this.sendVerificationEmail(user);
    const issued = await this.issueSession(user, meta);
    return { ...issued, user: toAuthUser(user) };
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<IssuedTokens & { user: AuthUserDto }> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
    });

    // เผาเวลาเท่ากันทั้งกรณีไม่มีผู้ใช้และรหัสผ่านผิด
    const ok = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.burnTime(input.password).then(() => false);

    if (!user || !ok) {
      throw new UnauthorizedException({
        type: ProblemType.unauthorized,
        title: 'Invalid credentials',
        message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      });
    }

    const issued = await this.issueSession(user, meta);
    return { ...issued, user: toAuthUser(user) };
  }

  /** เข้าใช้ demo ทันทีโดยไม่ต้องสมัคร — ผู้เข้าชมแต่ละคนได้ข้อมูลของตัวเอง ไม่แชร์กัน */
  async loginAsDemo(meta: RequestMeta): Promise<IssuedTokens & { user: AuthUserDto }> {
    if (!this.config.ENABLE_DEMO_ACCOUNT) {
      throw new ForbiddenException('ระบบปิดบัญชีทดลองอยู่');
    }
    const suffix = Math.random().toString(36).slice(2, 10);
    const user = await this.prisma.user.create({
      data: {
        email: `demo-${suffix}@nosion.local`,
        displayName: 'ผู้ใช้ทดลอง',
        isDemo: true,
        emailVerified: new Date(),
        expiresAt: new Date(Date.now() + DEMO_TTL_MS),
        settings: { create: {} },
      },
    });
    await this.seedDemoData(user.id);
    const issued = await this.issueSession(user, meta);
    return { ...issued, user: toAuthUser(user) };
  }

  /**
   * ข้อมูลตัวอย่างชุดเดียวกับ mockup (งาน · การเงิน · งบ · รอบโฟกัส) — วันเวลาสัมพันธ์กับตอนนี้ตามโซนของผู้ใช้
   * ชุดเดียวกับ `pnpm db:seed` (📁 auth/demo/)
   */
  private async seedDemoData(userId: string): Promise<void> {
    const settings = await this.prisma.userSettings.findUniqueOrThrow({ where: { userId } });
    await seedDemo(this.prisma, userId, buildDemoDataset(new Date(), settings.timezone));
  }

  /** ออก session ให้ผู้ใช้ที่ยืนยันตัวตนด้วยวิธีอื่นแล้ว (OAuth) */
  async startSession(user: User, meta: RequestMeta): Promise<IssuedTokens & { user: AuthUserDto }> {
    const issued = await this.issueSession(user, meta);
    return { ...issued, user: toAuthUser(user) };
  }

  // ── Refresh rotation + reuse detection (สเปกหัวข้อ 9.2) ──

  async refresh(rawToken: string, meta: RequestMeta, now = new Date()): Promise<IssuedTokens> {
    const hash = TokenService.hashToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException({
        type: ProblemType.unauthorized,
        title: 'Invalid refresh token',
        message: 'กรุณาเข้าสู่ระบบใหม่',
      });
    }

    /**
     * ช่วงผ่อนผัน: ใบที่เพิ่งถูกหมุนไม่เกิน 20 วิ ถูกส่งมาอีก = แทบทุกครั้งคือคำตอบรอบก่อนไปไม่ถึงเบราว์เซอร์
     * (เปิดสองแท็บพร้อมกัน · รีเฟรชหน้าระหว่างหมุน · เน็ตมือถือหลุดกลางคำขอ) ไม่ใช่การขโมย
     * → ออกใบใหม่ใน family เดิม แทนการเพิกถอนทุกอุปกรณ์ + ส่งอีเมลเตือนผิด ๆ (เจอจริงตอนวัด Lighthouse · Phase 8)
     * เกินช่วงนี้ยังถือเป็นการใช้ซ้ำตามเดิม
     */
    if (
      session.revokedReason === 'rotated' &&
      session.revokedAt &&
      now.getTime() - session.revokedAt.getTime() < ROTATION_GRACE_MS &&
      session.expiresAt > now
    ) {
      return this.issueSession(session.user, meta, session.familyId);
    }

    // ⚠ token ที่ถูกหมุนไปแล้วถูกนำมาใช้ซ้ำ = มีคนถือ token ที่ขโมยไป
    if (session.revokedAt || session.expiresAt < now) {
      if (session.revokedAt) {
        await this.revokeFamily(session.familyId, 'token_reuse_detected');
        this.logger.warn(
          `ตรวจพบการใช้ refresh token ซ้ำ — เพิกถอนทั้ง family ${session.familyId} ของผู้ใช้ ${session.userId}`,
        );
        void this.mail.sendSuspiciousActivity(session.user.email);
        throw new UnauthorizedException({
          type: ProblemType.tokenReuse,
          title: 'Token reuse detected',
          message: 'ตรวจพบการใช้ token ซ้ำ ระบบได้ออกจากระบบทุกอุปกรณ์เพื่อความปลอดภัย',
        });
      }
      throw new UnauthorizedException({
        type: ProblemType.unauthorized,
        title: 'Refresh token expired',
        message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
      });
    }

    // หมุน: เพิกถอนใบเดิม แล้วออกใบใหม่ใน family เดิม
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: now, revokedReason: 'rotated', lastUsedAt: now },
    });

    return this.issueSession(session.user, meta, session.familyId);
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout_all' },
    });
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      lastUsedAt: s.lastUsedAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrent: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'revoked_by_user' },
    });
    if (result.count === 0) throw new NotFoundException('ไม่พบเซสชันนี้');
  }

  // ── อีเมล / รหัสผ่าน ──────────────────────────────────

  async verifyEmail(rawToken: string): Promise<void> {
    const record = await this.consumeOneTimeToken(rawToken, TokenPurpose.emailVerification);
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    });
  }

  /** ตอบ 202 เสมอ ไม่ว่าอีเมลจะมีจริงหรือไม่ — ไม่เปิดเผยว่าใครเป็นสมาชิก */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user || user.isDemo) return;

    const { token, hash } = TokenService.createOneTimeToken();
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: TokenPurpose.passwordReset,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    await this.mail.sendPasswordReset(user.email, token);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.consumeOneTimeToken(rawToken, TokenPurpose.passwordReset);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      // เปลี่ยนรหัสผ่าน → เพิกถอนทุก session (สเปกหัวข้อ 9.3)
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      }),
    ]);
  }

  // ── ภายใน ────────────────────────────────────────────

  private async issueSession(
    user: User,
    meta: RequestMeta,
    familyId?: string,
  ): Promise<IssuedTokens> {
    const { token: refreshToken, hash } = this.tokens.createRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + this.tokens.refreshTtlSeconds() * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hash,
        familyId: familyId ?? crypto.randomUUID(),
        userAgent: meta.userAgent?.slice(0, 300),
        ipAddress: meta.ip,
        deviceLabel: deviceLabelFrom(meta.userAgent),
        expiresAt: refreshExpiresAt,
      },
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      sid: session.id,
      demo: user.isDemo,
    });

    return {
      accessToken,
      expiresIn: this.tokens.accessTtlSeconds(),
      refreshToken,
      refreshExpiresAt,
      sessionId: session.id,
    };
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    const { token, hash } = TokenService.createOneTimeToken();
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: TokenPurpose.emailVerification,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      },
    });
    await this.mail.sendVerifyEmail(user.email, token);
  }

  /** token ใช้ได้ครั้งเดียว — mark usedAt ใน transaction เดียวกับการตรวจ */
  private async consumeOneTimeToken(rawToken: string, purpose: TokenPurpose) {
    const tokenHash = TokenService.hashToken(rawToken);
    const record = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException({
        type: ProblemType.unauthorized,
        title: 'Invalid token',
        message: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว',
      });
    }
    const claimed = await this.prisma.verificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException('ลิงก์นี้ถูกใช้ไปแล้ว');
    }
    return record;
  }
}

export function toAuthUser(
  user: Pick<User, 'id' | 'email' | 'displayName' | 'avatarUrl' | 'emailVerified' | 'isDemo'>,
): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified?.toISOString() ?? null,
    isDemo: user.isDemo,
  };
}
