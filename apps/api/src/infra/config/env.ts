import { z } from 'zod';

/**
 * ตรวจ env ตอน bootstrap — ถ้าขาดหรือผิดรูปแบบให้ล้มทันทีพร้อมบอกว่าตัวไหนผิด
 * ดีกว่าปล่อยให้ระบบขึ้นแล้วไปพังตอนมีผู้ใช้จริง
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3001'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET ต้องยาวอย่างน้อย 32 ตัว — openssl rand -base64 48'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  ENCRYPTION_KEY: z.string().length(64).default('0'.repeat(64)),

  SMTP_URL: z.string().default('smtp://localhost:1025'),
  EMAIL_FROM: z.string().default('NOSION <noreply@nosion.dev>'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SENTRY_DSN: z.string().optional(),
  /** Vercel Cron ส่งมาใน Authorization: Bearer — ไม่ตั้ง = ปิด endpoint cron (404) */
  CRON_SECRET: z.string().min(32, 'CRON_SECRET ต้องยาวอย่างน้อย 32 ตัว').optional(),

  ENABLE_DEMO_ACCOUNT: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`ตัวแปรสภาพแวดล้อมไม่ถูกต้อง:\n${detail}`);
  }
  return parsed.data;
}

export const APP_CONFIG = Symbol.for('nosion.config');
