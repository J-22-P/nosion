import {
  CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemType } from '@nosion/contracts';
import { createHash } from 'node:crypto';
import {
  RATE_LIMIT_KEY,
  type AuthenticatedRequest,
  type RateLimitOptions,
} from '../../common/decorators';
import { RedisService } from '../../infra/redis/redis.service';

/**
 * Rate limit ด้วย Redis (fixed window) — ใช้กับ endpoint ที่ถูกโจมตีบ่อย:
 * login, register, forgot-password, demo
 *
 * Redis ล่ม → ปล่อยผ่านพร้อม log warning (fail-open) เพราะ availability ของ
 * ระบบหลักสำคัญกว่าการกัน brute force ชั่วคราว — และยังมี Argon2id เป็นด่านที่สอง
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = this.buildKey(req, options, context);
    const count = await this.redis.incrementWindow(key, options.windowSeconds);

    if (count === null) {
      this.logger.warn('ข้าม rate limit เพราะ Redis ไม่พร้อมใช้งาน');
      return true;
    }

    if (count > options.limit) {
      throw new HttpException(
        {
          type: ProblemType.rateLimited,
          title: 'Too many requests',
          message: `ทำรายการถี่เกินไป กรุณารออีก ${options.windowSeconds} วินาที`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private buildKey(
    req: AuthenticatedRequest,
    options: RateLimitOptions,
    context: ExecutionContext,
  ): string {
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const ip = req.ip ?? 'unknown';
    switch (options.by ?? 'ip') {
      case 'user':
        return `rl:${route}:u:${req.user?.userId ?? ip}`;
      case 'ip+body.email': {
        const email = (req.body as { email?: string } | undefined)?.email ?? '';
        const digest = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
        return `rl:${route}:ip:${ip}:e:${digest}`;
      }
      default:
        return `rl:${route}:ip:${ip}`;
    }
  }
}
