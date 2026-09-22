/**
 * Seed สำหรับ development — ข้อมูลต้องดู "เหมือนของจริง" ไม่ใช่ foo/bar
 * รันซ้ำได้ (idempotent): อิงจากอีเมลคงที่แล้วล้างข้อมูลเดิมของผู้ใช้นั้นก่อน
 */
import { hash } from '@node-rs/argon2';
import { EntryStatus, ModuleKey, PrismaClient, Priority } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@nosion.dev';
const DEMO_PASSWORD = 'nosion-demo-2026';

function daysFromToday(offset: number, hour = 9): Date {
  const d = new Date();
  d.setUTCHours(hour - 7, 0, 0, 0); // 09:00 เวลาไทย = 02:00 UTC
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

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
      displayName: 'ผู้ใช้ตัวอย่าง',
      emailVerified: new Date(),
      settings: { create: { timezone: 'Asia/Bangkok', locale: 'th', currency: 'THB' } },
    },
  });

  // ล้างข้อมูลเดิมของผู้ใช้นี้เพื่อให้รันซ้ำได้ผลเหมือนเดิม
  await prisma.entry.deleteMany({ where: { userId: user.id } });
  await prisma.tag.deleteMany({ where: { userId: user.id } });
  await prisma.project.deleteMany({ where: { userId: user.id } });

  const [work, personal, learning] = await Promise.all([
    prisma.project.create({
      data: { userId: user.id, name: 'งานบริษัท', color: '#6366f1', sortOrder: 0 },
    }),
    prisma.project.create({
      data: { userId: user.id, name: 'เรื่องส่วนตัว', color: '#10b981', sortOrder: 1 },
    }),
    prisma.project.create({
      data: { userId: user.id, name: 'เรียนรู้', color: '#f59e0b', sortOrder: 2 },
    }),
  ]);

  const tags = await Promise.all(
    [
      { name: 'ด่วน', color: '#ef4444' },
      { name: 'รอคนอื่น', color: '#f59e0b' },
      { name: 'ทำที่บ้าน', color: '#8b5cf6' },
    ].map((t) => prisma.tag.create({ data: { ...t, userId: user.id } })),
  );

  const tasks: {
    title: string;
    project: string;
    status: EntryStatus;
    priority: Priority;
    day: number;
    estimate: number | null;
    deferCount?: number;
    tagIndex?: number;
  }[] = [
    {
      title: 'เขียน ADR-001 เรื่องแยก NestJS ออกจาก Next.js',
      project: work.id,
      status: EntryStatus.done,
      priority: Priority.high,
      day: -6,
      estimate: 60,
    },
    {
      title: 'ตั้ง CI ให้เขียวตั้งแต่วันแรก',
      project: work.id,
      status: EntryStatus.done,
      priority: Priority.high,
      day: -5,
      estimate: 120,
    },
    {
      title: 'ออกแบบ schema ของ entries ให้รองรับทุกโมดูล',
      project: work.id,
      status: EntryStatus.done,
      priority: Priority.urgent,
      day: -4,
      estimate: 180,
    },
    {
      title: 'รีวิว PR ของทีม',
      project: work.id,
      status: EntryStatus.pending,
      priority: Priority.high,
      day: -1,
      estimate: 45,
      tagIndex: 0,
    },
    {
      title: 'ตอบอีเมลลูกค้าเรื่องสัญญา',
      project: work.id,
      status: EntryStatus.pending,
      priority: Priority.urgent,
      day: -1,
      estimate: 20,
      deferCount: 3,
      tagIndex: 0,
    },
    {
      title: 'เตรียมสไลด์ประชุมรายสัปดาห์',
      project: work.id,
      status: EntryStatus.active,
      priority: Priority.medium,
      day: 0,
      estimate: 90,
    },
    {
      title: 'อัปเดตเอกสาร onboarding',
      project: work.id,
      status: EntryStatus.pending,
      priority: Priority.low,
      day: 2,
      estimate: 60,
      deferCount: 1,
    },
    {
      title: 'สัมภาษณ์ผู้สมัครตำแหน่ง backend',
      project: work.id,
      status: EntryStatus.pending,
      priority: Priority.high,
      day: 1,
      estimate: 60,
      tagIndex: 1,
    },
    {
      title: 'ต่ออายุประกันรถ',
      project: personal.id,
      status: EntryStatus.pending,
      priority: Priority.urgent,
      day: -2,
      estimate: 30,
      deferCount: 5,
    },
    {
      title: 'นัดหมอฟัน',
      project: personal.id,
      status: EntryStatus.pending,
      priority: Priority.medium,
      day: 3,
      estimate: null,
      tagIndex: 1,
    },
    {
      title: 'ซื้อของเข้าบ้าน',
      project: personal.id,
      status: EntryStatus.pending,
      priority: Priority.low,
      day: 0,
      estimate: null,
      tagIndex: 2,
    },
    {
      title: 'จองตั๋วกลับบ้านสงกรานต์',
      project: personal.id,
      status: EntryStatus.pending,
      priority: Priority.none,
      day: 10,
      estimate: null,
    },
    {
      title: 'ทำความสะอาดโต๊ะทำงาน',
      project: personal.id,
      status: EntryStatus.done,
      priority: Priority.none,
      day: -3,
      estimate: 30,
      tagIndex: 2,
    },
    {
      title: 'อ่าน Designing Data-Intensive Applications บทที่ 5',
      project: learning.id,
      status: EntryStatus.active,
      priority: Priority.medium,
      day: 0,
      estimate: 90,
      tagIndex: 2,
    },
    {
      title: 'ลองทำ RRULE parser ด้วยตัวเอง',
      project: learning.id,
      status: EntryStatus.pending,
      priority: Priority.medium,
      day: 4,
      estimate: 120,
    },
    {
      title: 'ดูคอร์ส PostgreSQL performance tuning',
      project: learning.id,
      status: EntryStatus.pending,
      priority: Priority.low,
      day: 7,
      estimate: 180,
      deferCount: 2,
    },
    {
      title: 'สรุปสิ่งที่เรียนรู้จากโปรเจกต์นี้',
      project: learning.id,
      status: EntryStatus.pending,
      priority: Priority.low,
      day: 14,
      estimate: 60,
    },
    {
      title: 'ตรวจ Lighthouse ให้ได้ 90 ทุกหมวด',
      project: work.id,
      status: EntryStatus.pending,
      priority: Priority.medium,
      day: 5,
      estimate: 90,
    },
    {
      title: 'เขียน E2E test flow สมัคร → สร้างงาน',
      project: work.id,
      status: EntryStatus.pending,
      priority: Priority.high,
      day: 2,
      estimate: 120,
    },
    {
      title: 'ทดสอบ restore backup จริงหนึ่งครั้ง',
      project: work.id,
      status: EntryStatus.pending,
      priority: Priority.medium,
      day: 6,
      estimate: 60,
    },
  ];

  for (const [index, task] of tasks.entries()) {
    const occurredAt = daysFromToday(task.day);
    await prisma.entry.create({
      data: {
        userId: user.id,
        module: ModuleKey.task,
        title: task.title,
        status: task.status,
        priority: task.priority,
        occurredAt,
        isAllDay: true,
        completedAt: task.status === EntryStatus.done ? occurredAt : null,
        projectId: task.project,
        sortOrder: index,
        payload: {
          estimateMinutes: task.estimate,
          actualMinutes: task.status === EntryStatus.done ? (task.estimate ?? 0) : 0,
          checklist: [],
          github: null,
          branchName: null,
          deferCount: task.deferCount ?? 0,
        },
        ...(task.tagIndex !== undefined && tags[task.tagIndex]
          ? { tags: { create: [{ tagId: tags[task.tagIndex]!.id }] } }
          : {}),
      },
    });
  }

  console.log(`✓ seed เสร็จแล้ว — เข้าสู่ระบบด้วย ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  งาน ${tasks.length} รายการ · โปรเจกต์ 3 · แท็ก ${tags.length}`);
}

main()
  .catch((err: unknown) => {
    console.error('✗ seed ล้มเหลว:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
