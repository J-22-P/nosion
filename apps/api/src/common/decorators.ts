import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  email: string;
  isDemo: boolean;
  /** เข้าด้วย API key = `apikey:<id>` — endpoint ที่ใช้ session จริง (logout ฯลฯ) ไม่ติด @PublicApi จึงไม่เจอค่านี้ */
  sessionId: string;
  /** มีเมื่อเข้าด้วย API key (Public API) */
  apiKeyId?: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC_KEY = 'nosion:isPublic';
/** endpoint ที่เข้าได้โดยไม่ต้อง login — ต้องประกาศชัดเจน ไม่ใช่ค่าเริ่มต้น */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PUBLIC_API_KEY = 'nosion:publicApi';
/**
 * เปิดให้ API key เรียกได้ (Public API · สเปก 7.3) — ไม่ติด = ต้องล็อกอินด้วย session เท่านั้น
 * ปลอดภัยโดยค่าเริ่มต้นแบบเดียวกับ @Public(): endpoint ใหม่ไม่หลุดไปเป็น Public API เพราะลืม
 */
export const PublicApi = () => SetMetadata(PUBLIC_API_KEY, true);

export const DEMO_FORBIDDEN_KEY = 'nosion:demoForbidden';
/** demo account ทำสิ่งนี้ไม่ได้ (เปลี่ยนอีเมล/รหัสผ่าน, ส่งอีเมลจริง ฯลฯ) */
export const DemoForbidden = () => SetMetadata(DEMO_FORBIDDEN_KEY, true);

export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);

export const RATE_LIMIT_KEY = 'nosion:rateLimit';
export interface RateLimitOptions {
  /** จำนวนครั้งที่อนุญาต */
  limit: number;
  /** ในกี่วินาที */
  windowSeconds: number;
  /** นับรวมต่อ IP หรือต่อผู้ใช้ */
  by?: 'ip' | 'user' | 'ip+body.email';
}
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
