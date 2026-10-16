/**
 * Seed สำหรับ development — ข้อมูลต้องดู "เหมือนของจริง" ไม่ใช่ foo/bar
 * รันซ้ำได้ (idempotent): อิงจากอีเมลคงที่แล้วล้างข้อมูลเดิมของผู้ใช้นั้นก่อน
 *
 * ข้อมูลชุดเดียวกับบัญชีทดลอง (POST /auth/demo) — 📁 src/auth/demo/demo-dataset.ts
 * ชุดเดียวกับ mockup ในสเปก 8.11 และวันเวลาสัมพันธ์กับตอนที่รัน
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';
import { buildDemoDataset } from '../src/auth/demo/demo-dataset';
import { seedDemo } from '../src/auth/demo/seed-demo';

loadDotenv();

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@nosion.dev';
const DEMO_PASSWORD = 'nosion-demo-2026';
const TIME_ZONE = 'Asia/Bangkok';

async function main(): Promise<void> {
  console.log('🌱 กำลัง seed ข้อมูลตัวอย่าง…');

  const passwordHash = await hash(DEMO_PASSWORD, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      displayName: 'Jay',
      emailVerified: new Date(),
      settings: { create: { timezone: TIME_ZONE, locale: 'th', currency: 'THB' } },
    },
  });

  // ล้างข้อมูลเดิมของผู้ใช้นี้เพื่อให้รันซ้ำได้ผลเหมือนเดิม (focus session / tag ของ entry ลบตาม cascade)
  await prisma.entry.deleteMany({ where: { userId: user.id } });
  await prisma.budget.deleteMany({ where: { userId: user.id } });
  await prisma.tag.deleteMany({ where: { userId: user.id } });
  await prisma.project.deleteMany({ where: { userId: user.id } });

  const counts = await seedDemo(prisma, user.id, buildDemoDataset(new Date(), TIME_ZONE));

  console.log(`✓ seed เสร็จแล้ว — เข้าสู่ระบบด้วย ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(
    `  งาน ${counts.tasks} · รายการเงิน ${counts.expenses} · งบ ${counts.budgets} · รอบโฟกัส ${counts.focusSessions} · นิสัย ${counts.habits}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('✗ seed ล้มเหลว:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
