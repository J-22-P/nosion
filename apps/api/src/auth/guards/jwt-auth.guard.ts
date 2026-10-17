import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemType } from '@nosion/contracts';
import type { Response } from 'express';
import {
  DEMO_FORBIDDEN_KEY,
  IS_PUBLIC_KEY,
  PUBLIC_API_KEY,
  type AuthenticatedRequest,
} from '../../common/decorators';
import { requestContext } from '../../common/request-context';
import { RedisService } from '../../infra/redis/redis.service';
import { extractApiKey, requiredScope } from '../api-keys/api-key';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { SessionRevocationService } from '../session-revocation.service';
import { TokenService } from '../token.service';

/** Public API: 60 ครั้ง/นาที/key (สเปก 7.5) */
const API_KEY_LIMIT = 60;
const API_KEY_WINDOW_SECONDS = 60;

/**
 * Guard ระดับ global — endpoint ทุกตัวต้องล็อกอิน ยกเว้นที่ติด @Public()
 * (ปลอดภัยโดยค่าเริ่มต้น: ลืมใส่ guard แล้วข้อมูลรั่วเป็นบั๊กที่พบบ่อยที่สุด)
 *
 * ทางเข้ามีสองแบบ: access token (JWT จาก session) หรือ API key (`nos_…` · เฉพาะ endpoint ที่ติด @PublicApi)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly revocations: SessionRevocationService,
    private readonly apiKeys: ApiKeysService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.flag(IS_PUBLIC_KEY, context)) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const apiKey = extractApiKey({
      authorization: req.header('authorization'),
      apiKey: req.header('x-api-key'),
    });

    if (apiKey) {
      await this.authenticateApiKey(apiKey, req, context);
    } else {
      await this.authenticateSession(req);
    }

    if (this.flag(DEMO_FORBIDDEN_KEY, context) && req.user?.isDemo) {
      throw new ForbiddenException({
        type: ProblemType.forbidden,
        title: 'Demo account',
        message: 'บัญชีทดลองทำรายการนี้ไม่ได้',
      });
    }

    return true;
  }

  private async authenticateSession(req: AuthenticatedRequest): Promise<void> {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        type: ProblemType.unauthorized,
        title: 'Unauthorized',
        message: 'ต้องแนบ access token',
      });
    }

    try {
      const claims = await this.tokens.verifyAccessToken(header.slice(7));
      if (await this.revocations.isRevoked(claims.sid)) {
        throw new UnauthorizedException('เซสชันถูกเพิกถอนแล้ว');
      }
      req.user = {
        userId: claims.sub,
        email: claims.email,
        isDemo: claims.demo,
        sessionId: claims.sid,
      };
      requestContext.setUserId(claims.sub);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException({
        type: ProblemType.unauthorized,
        title: 'Unauthorized',
        message: 'access token ไม่ถูกต้องหรือหมดอายุ',
      });
    }
  }

  private async authenticateApiKey(
    rawKey: string,
    req: AuthenticatedRequest,
    context: ExecutionContext,
  ): Promise<void> {
    if (!this.flag(PUBLIC_API_KEY, context)) {
      throw new ForbiddenException({
        type: ProblemType.forbidden,
        title: 'Not part of the Public API',
        message: 'endpoint นี้ใช้ API key ไม่ได้ ต้องล็อกอินจากแอป',
      });
    }

    const principal = await this.apiKeys.authenticate(rawKey);
    if (!principal) {
      throw new UnauthorizedException({
        type: ProblemType.unauthorized,
        title: 'Invalid API key',
        message: 'API key ไม่ถูกต้อง ถูกเพิกถอน หรือหมดอายุแล้ว',
      });
    }

    const scope = requiredScope(req.method);
    if (!principal.scopes.includes(scope)) {
      throw new ForbiddenException({
        type: ProblemType.forbidden,
        title: 'Insufficient scope',
        message: `API key นี้ไม่มีสิทธิ์ ${scope}`,
      });
    }

    await this.enforceKeyRateLimit(principal.keyId, context);

    req.user = {
      userId: principal.userId,
      email: principal.email,
      isDemo: principal.isDemo,
      sessionId: `apikey:${principal.keyId}`,
      apiKeyId: principal.keyId,
    };
    requestContext.setUserId(principal.userId);
  }

  /** นับต่อ key ไม่ใช่ต่อ IP — สคริปต์ของผู้ใช้มักรันจาก IP เดียวกับเครื่องอื่นในบ้าน/ออฟฟิศ */
  private async enforceKeyRateLimit(keyId: string, context: ExecutionContext): Promise<void> {
    const windowStart = Math.floor(Date.now() / 1000 / API_KEY_WINDOW_SECONDS);
    const count = await this.redis.incrementWindow(
      `rl:apikey:${keyId}:${windowStart}`,
      API_KEY_WINDOW_SECONDS,
    );
    if (count === null) {
      this.logger.warn('ข้าม rate limit ของ API key เพราะ Redis ไม่พร้อมใช้งาน');
      return;
    }

    const resetIn =
      API_KEY_WINDOW_SECONDS - (Math.floor(Date.now() / 1000) % API_KEY_WINDOW_SECONDS);
    const res = context.switchToHttp().getResponse<Response>();
    // header ตาม IETF draft RateLimit fields (สเปก 7.5)
    res.setHeader('RateLimit-Limit', String(API_KEY_LIMIT));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, API_KEY_LIMIT - count)));
    res.setHeader('RateLimit-Reset', String(resetIn));

    if (count > API_KEY_LIMIT) {
      res.setHeader('Retry-After', String(resetIn));
      throw new HttpException(
        {
          type: ProblemType.rateLimited,
          title: 'Too many requests',
          message: `API key นี้เรียกเกิน ${API_KEY_LIMIT} ครั้ง/นาที กรุณารออีก ${resetIn} วินาที`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private flag(key: string, context: ExecutionContext): boolean {
    return Boolean(
      this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]),
    );
  }
}
