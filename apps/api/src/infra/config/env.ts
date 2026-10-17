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

  /** log = ไม่ส่งจริง (เทสต์/CI) · smtp = Mailpit ในเครื่อง · resend = staging/production */
  MAIL_DRIVER: z.enum(['log', 'smtp', 'resend']).default('log'),
  RESEND_API_KEY: z.string().min(1).optional(),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  EMAIL_FROM: z.string().default('NOSION <noreply@nosion.dev>'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SENTRY_DSN: z.string().optional(),
  /** Vercel Cron ส่งมาใน Authorization: Bearer — ไม่ตั้ง = ปิด endpoint cron (404) */
  CRON_SECRET: z.string().min(32, 'CRON_SECRET ต้องยาวอย่างน้อย 32 ตัว').optional(),

  /** Web Push (สเปก 10.3) — public key ส่งให้เบราว์เซอร์ใช้ subscribe · ไม่ตั้ง = ปิด push */
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  /** ใช้เมื่อ API ส่งการเตือนเอง (GET /internal/cron/reminders บน Vercel แทน worker) */
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().default('mailto:noreply@nosion.dev'),
  /** ลายเซ็นของปุ่มใน notification — ต้องตรงกับของ worker · ไม่ตั้ง = endpoint ปุ่มปิด (404) */
  NOTIFICATION_ACTION_SECRET: z
    .string()
    .min(32, 'NOTIFICATION_ACTION_SECRET ต้องยาวอย่างน้อย 32 ตัว')
    .optional(),

  ENABLE_DEMO_ACCOUNT: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  /**
   * จำนวน proxy หน้า API ที่เชื่อ `X-Forwarded-For` ได้ (Express `trust proxy`) — ไม่ตั้ง: บน Vercel = 1 (edge เขียนทับ
   * header นี้ ผู้ใช้ปลอมไม่ได้) · ที่อื่น = 0 · ตั้งผิดแล้ว req.ip = IP ของ proxy → rate limit รวมทั้งโลก (เจอจริง Phase 8)
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).optional(),
  /** รหัสลับร่วมกับ proxy `/api/v1` ของเว็บ — มีแล้วถึงจะเชื่อ IP ผู้ใช้ที่ proxy ส่งต่อมา (ดู common/client-ip.ts) */
  API_PROXY_KEY: z.string().min(32, 'API_PROXY_KEY ต้องยาวอย่างน้อย 32 ตัว').optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

/**
 * `KEY=` (ว่าง) ใน .env = "ไม่ได้ตั้ง" ไม่ใช่ "ตั้งเป็นสตริงว่าง"
 * ไม่งั้นค่าที่ไม่บังคับ (VAPID, RESEND …) ที่เว้นว่างไว้ใน .env ทำให้ API ไม่ยอม boot
 * (Prisma Client ก็อ่าน .env เองตอน runtime — ค่าว่างจึงหลุดเข้ามาแม้ turbo กรอง env ไว้)
 */
function withoutEmpty(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(withoutEmpty(source));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`ตัวแปรสภาพแวดล้อมไม่ถูกต้อง:\n${detail}`);
  }
  return parsed.data;
}

export const APP_CONFIG = Symbol.for('nosion.config');
