import type { PrismaClient } from '@prisma/client';

export interface CleanupResult {
  demoAccountsRemoved: number;
  trashPurged: number;
  sessionsPurged: number;
}

/** อายุของถังขยะก่อนลบจริง (สเปกหัวข้อ 5.1) */
export const TRASH_RETENTION_DAYS = 30;

/**
 * งานประจำวัน: ลบบัญชีทดลองที่หมดอายุ, เทถังขยะที่เกิน 30 วัน, ล้าง session ที่หมดอายุ
 * เขียนเป็นฟังก์ชันที่รับ prisma เข้ามา → ทดสอบด้วย mock ได้โดยไม่ต้องยก worker ทั้งตัว
 */
export async function runCleanup(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<CleanupResult> {
  const trashCutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 3600 * 1000);

  const [demo, trash, sessions] = await Promise.all([
    prisma.user.deleteMany({ where: { isDemo: true, expiresAt: { lt: now } } }),
    prisma.entry.deleteMany({ where: { deletedAt: { lt: trashCutoff } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  return {
    demoAccountsRemoved: demo.count,
    trashPurged: trash.count,
    sessionsPurged: sessions.count,
  };
}
