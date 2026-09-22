import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemType } from '@nosion/contracts';
import {
  DEMO_FORBIDDEN_KEY,
  IS_PUBLIC_KEY,
  type AuthenticatedRequest,
} from '../../common/decorators';
import { requestContext } from '../../common/request-context';
import { SessionRevocationService } from '../session-revocation.service';
import { TokenService } from '../token.service';

/**
 * Guard ระดับ global — endpoint ทุกตัวต้องล็อกอิน ยกเว้นที่ติด @Public()
 * (ปลอดภัยโดยค่าเริ่มต้น: ลืมใส่ guard แล้วข้อมูลรั่วเป็นบั๊กที่พบบ่อยที่สุด)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly revocations: SessionRevocationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
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

    const demoForbidden = this.reflector.getAllAndOverride<boolean>(DEMO_FORBIDDEN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (demoForbidden && req.user.isDemo) {
      throw new ForbiddenException({
        type: ProblemType.forbidden,
        title: 'Demo account',
        message: 'บัญชีทดลองทำรายการนี้ไม่ได้',
      });
    }

    return true;
  }
}
