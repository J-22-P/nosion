import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  oauthLinkSchema,
  oauthProviderSchema,
  type OAuthAccountsDto,
  type OAuthLinkDto,
  type OAuthLinkInput,
  type OAuthProvider,
  type OAuthProvidersDto,
} from '@nosion/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser, DemoForbidden, Public, RateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { APP_CONFIG, type AppConfig } from '../../infra/config/env';
import { metaFrom, REFRESH_COOKIE, refreshCookieOptions } from '../auth.controller';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  OAuthFlowError,
  OAuthService,
} from './oauth.service';

/** คุกกี้ state ส่งกลับมาเฉพาะ path ของ OAuth */
const STATE_COOKIE_PATH = '/api/v1/auth/oauth';

/**
 * เข้าสู่ระบบ/ผูกบัญชีด้วย Google · GitHub (สเปก 7.3) — ทุกอย่างเป็นการเปิดหน้า (redirect) ไม่ใช่ fetch
 * ผลลัพธ์ส่งกลับเว็บทาง redirect: สำเร็จ → หน้าแอป (refresh cookie ถูกตั้งแล้ว) · ล้ม → `?oauth_error=<code>`
 */
@ApiTags('auth')
@Controller('auth/oauth')
@UseGuards(RateLimitGuard)
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** เว็บถามว่าผู้ให้บริการไหนเปิดอยู่ — ซ่อนปุ่มที่ใช้ไม่ได้ */
  @Public()
  @Get('providers')
  providers(): OAuthProvidersDto {
    return this.oauth.providers();
  }

  /** ผูกบัญชีจากหน้าตั้งค่า — คืน URL ให้เว็บเปิดต่อ (ใช้ได้ 2 นาที) */
  @Post(':provider/link')
  @HttpCode(HttpStatus.OK)
  @DemoForbidden()
  @RateLimit({ limit: 20, windowSeconds: 600, by: 'user' })
  link(
    @CurrentUser('userId') userId: string,
    @Param('provider') rawProvider: string,
    @Body(zodBody(oauthLinkSchema)) dto: OAuthLinkInput,
  ): OAuthLinkDto {
    const provider = parseProvider(rawProvider);
    const intent = this.oauth.createLinkIntent(userId, provider, dto.includePrivateRepos);
    const q = new URLSearchParams({ intent });
    return { url: `${this.config.API_URL}/api/v1/auth/oauth/${provider}?${q}` };
  }

  @Public()
  @Get(':provider')
  @RateLimit({ limit: 30, windowSeconds: 600 })
  begin(
    @Param('provider') rawProvider: string,
    @Query('intent') intent: string | undefined,
    @Query('tz') timezone: string | undefined,
    @Res() res: Response,
  ): void {
    const provider = parseProvider(rawProvider);
    try {
      const { url, cookie } = this.oauth.begin(provider, { intent, timezone });
      res.cookie(OAUTH_STATE_COOKIE, cookie, this.stateCookieOptions());
      res.redirect(HttpStatus.FOUND, url);
    } catch (err) {
      this.redirectWithError(res, err);
    }
  }

  @Public()
  @Get(':provider/callback')
  @RateLimit({ limit: 30, windowSeconds: 600 })
  async callback(
    @Param('provider') rawProvider: string,
    @Query() query: { code?: string; state?: string; error?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const provider = parseProvider(rawProvider);
    const sealed = (req.cookies as Record<string, string> | undefined)?.[OAUTH_STATE_COOKIE];
    // state ใช้ได้ครั้งเดียว — ลบทิ้งไม่ว่าผลจะเป็นอย่างไร
    res.clearCookie(OAUTH_STATE_COOKIE, { path: STATE_COOKIE_PATH });
    try {
      const result = await this.oauth.complete(provider, query, sealed, metaFrom(req));
      if (result.kind === 'linked') {
        res.redirect(HttpStatus.FOUND, `${this.config.APP_URL}/settings?connected=${provider}`);
        return;
      }
      res.cookie(
        REFRESH_COOKIE,
        result.issued.refreshToken,
        refreshCookieOptions(this.config, result.issued.refreshExpiresAt),
      );
      // เว็บขอ access token เองจาก refresh cookie ตอนเปิดหน้า (useSession) — ไม่ต้องส่ง token ทาง URL
      res.redirect(HttpStatus.FOUND, `${this.config.APP_URL}/today`);
    } catch (err) {
      this.redirectWithError(res, err);
    }
  }

  private redirectWithError(res: Response, err: unknown): void {
    if (!(err instanceof OAuthFlowError)) throw err;
    const page = err.linking ? 'settings' : 'login';
    const query = new URLSearchParams({ oauth_error: err.code });
    // รหัสมาตรฐานของผู้ให้บริการเท่านั้น (ตัวอักษร/ตัวเลข/_) — ไม่ส่งข้อความดิบ
    if (err.reason && /^[a-z0-9_]{1,64}$/i.test(err.reason)) query.set('oauth_reason', err.reason);
    res.redirect(HttpStatus.FOUND, `${this.config.APP_URL}/${page}?${query}`);
  }

  /**
   * SameSite=Lax ไม่ใช่ Strict — callback คือการเปิดหน้าที่มาจากโดเมนของ Google/GitHub (cross-site)
   * Strict จะไม่ส่งคุกกี้นี้มา → state ไม่ตรงทุกครั้ง · Lax ส่งเฉพาะ GET แบบ top-level ซึ่งคือกรณีนี้พอดี
   */
  private stateCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: STATE_COOKIE_PATH,
      maxAge: OAUTH_STATE_TTL_MS,
    };
  }
}

/** บัญชีที่ผูกไว้ — หน้าตั้งค่า */
@ApiTags('me')
@Controller('me/oauth-accounts')
export class OAuthAccountsController {
  constructor(private readonly oauth: OAuthService) {}

  @Get()
  list(@CurrentUser('userId') userId: string): Promise<OAuthAccountsDto> {
    return this.oauth.listAccounts(userId);
  }

  @Delete(':provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(
    @CurrentUser('userId') userId: string,
    @Param('provider') rawProvider: string,
  ): Promise<void> {
    await this.oauth.unlink(userId, parseProvider(rawProvider));
  }
}

function parseProvider(raw: string): OAuthProvider {
  const parsed = oauthProviderSchema.safeParse(raw);
  if (!parsed.success) throw new NotFoundException('ไม่รู้จักผู้ให้บริการนี้');
  return parsed.data;
}
