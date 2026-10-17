import { z } from 'zod';

/** เข้าสู่ระบบด้วยบัญชีภายนอก (สเปก 7.3 `GET /auth/oauth/:provider`) */
export const oauthProviderSchema = z.enum(['google', 'github']);
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;
export const OAUTH_PROVIDERS = oauthProviderSchema.options;

/** ผู้ให้บริการไหนเปิดอยู่บนเซิร์ฟเวอร์นี้ (ตั้ง client id/secret แล้ว) */
export type OAuthProvidersDto = Record<OAuthProvider, boolean>;

/** ผูกบัญชีจากหน้าตั้งค่า — GitHub ขอสิทธิ์ repo ส่วนตัวเพิ่มได้ (ดึง issue ของ repo ส่วนตัว) */
export const oauthLinkSchema = z.object({
  includePrivateRepos: z.boolean().default(false),
});
export type OAuthLinkInput = z.infer<typeof oauthLinkSchema>;

export interface OAuthLinkDto {
  /** เปิด URL นี้แบบ top-level navigation — ใช้ได้ครั้งเดียวภายใน 2 นาที */
  url: string;
}

export interface OAuthAccountDto {
  provider: OAuthProvider;
  login: string | null;
  scopes: string[];
  createdAt: string;
}

export interface OAuthAccountsDto {
  accounts: OAuthAccountDto[];
  /** มีรหัสผ่านไหม — ไม่มีแล้วเหลือบัญชีเดียว = ยกเลิกการเชื่อมไม่ได้ (จะเข้าระบบไม่ได้อีก) */
  hasPassword: boolean;
}

/**
 * รหัสข้อผิดพลาดที่ส่งกลับมาทาง query `?oauth_error=` — เว็บแปลงเป็นข้อความที่ผู้ใช้อ่านเข้าใจ
 * (ไม่ส่งข้อความดิบจากผู้ให้บริการไปแสดง)
 */
export const OAUTH_ERRORS = [
  'provider_disabled',
  'denied',
  'state_mismatch',
  'exchange_failed',
  'email_unverified',
  'email_conflict',
  'already_linked',
  'account_unavailable',
] as const;
export type OAuthErrorCode = (typeof OAUTH_ERRORS)[number];
