import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type LoginResponse,
  type SessionDto,
} from '@nosion/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser, Public, RateLimit, type AuthUser } from '../common/decorators';
import { zodBody } from '../common/zod-validation.pipe';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { AuthService } from './auth.service';
import type { IssuedTokens } from './auth.types';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { SessionRevocationService } from './session-revocation.service';
import { TokenService } from './token.service';

export const REFRESH_COOKIE = 'nosion_rt';
/** จำกัด path ให้แคบที่สุด — cookie นี้ไม่ควรถูกส่งไปกับทุก request */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@ApiTags('auth')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly revocations: SessionRevocationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('register')
  @RateLimit({ limit: 5, windowSeconds: 3600 })
  async register(
    @Body(zodBody(registerSchema)) dto: import('@nosion/contracts').RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const issued = await this.auth.register(dto, metaFrom(req));
    return this.respondWithTokens(res, issued);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 900, by: 'ip+body.email' })
  async login(
    @Body(zodBody(loginSchema)) dto: import('@nosion/contracts').LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const issued = await this.auth.login(dto, metaFrom(req));
    return this.respondWithTokens(res, issued);
  }

  /** เข้าใช้ทันทีโดยไม่ต้องสมัคร — จุดที่ทำให้ recruiter กดดูได้ใน 1 คลิก */
  @Public()
  @Post('demo')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 3600 })
  async demo(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const issued = await this.auth.loginAsDemo(metaFrom(req));
    return this.respondWithTokens(res, issued);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 60, windowSeconds: 300 })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<LoginResponse, 'user'>> {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!raw) throw new UnauthorizedException('ไม่พบ refresh token');
    const issued = await this.auth.refresh(raw, metaFrom(req));
    this.setRefreshCookie(res, issued);
    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user.sessionId);
    await this.revocations.revoke(user.sessionId, this.tokens.accessTtlSeconds());
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const sessions = await this.auth.listSessions(user.userId, user.sessionId);
    await this.auth.logoutAll(user.userId);
    await this.revocations.revokeMany(
      sessions.map((s) => s.id),
      this.tokens.accessTtlSeconds(),
    );
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Get('sessions')
  async sessions(@CurrentUser() user: AuthUser): Promise<SessionDto[]> {
    return this.auth.listSessions(user.userId, user.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.auth.revokeSession(user.userId, id);
    await this.revocations.revoke(id, this.tokens.accessTtlSeconds());
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ limit: 20, windowSeconds: 3600 })
  async verifyEmail(@Body(zodBody(verifyEmailSchema)) dto: { token: string }): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 3, windowSeconds: 3600, by: 'ip+body.email' })
  async forgotPassword(
    @Body(zodBody(forgotPasswordSchema)) dto: { email: string },
  ): Promise<{ message: string }> {
    await this.auth.forgotPassword(dto.email);
    // ตอบเหมือนกันเสมอ ไม่ว่าอีเมลจะมีจริงหรือไม่
    return { message: 'หากอีเมลนี้อยู่ในระบบ เราได้ส่งลิงก์รีเซ็ตรหัสผ่านให้แล้ว' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ limit: 5, windowSeconds: 3600 })
  async resetPassword(
    @Body(zodBody(resetPasswordSchema)) dto: { token: string; password: string },
  ): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  // ── ภายใน ────────────────────────────────────────────

  private respondWithTokens(
    res: Response,
    issued: IssuedTokens & { user: LoginResponse['user'] },
  ): LoginResponse {
    this.setRefreshCookie(res, issued);
    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn, user: issued.user };
  }

  private setRefreshCookie(res: Response, issued: IssuedTokens): void {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, this.cookieOptions(issued.refreshExpiresAt));
  }

  private cookieOptions(expires: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires,
    };
  }
}

function metaFrom(req: Request) {
  return { userAgent: req.header('user-agent'), ip: req.ip };
}
