import { z } from 'zod';

/**
 * นโยบายรหัสผ่าน: ยาว ≥ 12 (สเปกหัวข้อ 9.3)
 * ความแข็งแรงจริงตรวจด้วย zxcvbn + HIBP k-anonymity ที่ service layer
 */
export const passwordSchema = z
  .string()
  .min(12, 'รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร')
  .max(128);

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80),
  timezone: z.string().max(64).default('Asia/Bangkok'),
});
export type RegisterInput = z.infer<typeof registerSchema>;
/** ค่าที่ฟอร์มถืออยู่ก่อน Zod เติม default — react-hook-form ต้องใช้ชนิดนี้ */
export type RegisterFormValues = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;
export type LoginFormValues = z.input<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(10).max(512) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(512),
  password: passwordSchema,
});

export interface AuthUserDto {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: string | null;
  isDemo: boolean;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUserDto;
}

export interface SessionDto {
  id: string;
  deviceLabel: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}
