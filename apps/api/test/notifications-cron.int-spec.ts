import type { INestApplication } from '@nestjs/common';
import {
  runDueReminders,
  type ReminderDispatcher,
  type ReminderMessage,
} from '@nosion/notifications';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

const CRON_SECRET = 'c'.repeat(40);
/** 10:00 เวลาไทย — นอกช่วงห้ามรบกวนเริ่มต้น (22:00–07:00) เทสต์จึงไม่ขึ้นกับเวลาที่รัน */
const NOW = new Date('2027-01-10T03:00:00Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

class FakeDispatcher implements ReminderDispatcher {
  sent: ReminderMessage[] = [];
  failTimes = 0;
  async send(_channel: string, message: ReminderMessage): Promise<void> {
    if (this.failTimes > 0) {
      this.failTimes -= 1;
      throw new Error('push service ตอบ 503');
    }
    this.sent.push(message);
  }
}

describe('ส่งการเตือนจาก API บน Vercel (cron ภายนอกทุกนาที)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let userId = '';
  const saved = process.env.CRON_SECRET;

  beforeAll(async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    redis = ctx.redis;
    const token = await registerAndLogin(app, 'cron-remind');
    userId = (
      await request(app.getHttpServer()).get('/api/v1/me').set('Authorization', `Bearer ${token}`)
    ).body.user.id;
  });

  afterAll(async () => {
    await app.close();
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
    // ให้แต่ละเทสต์เห็นเฉพาะการเตือนของตัวเอง
    await prisma.reminder.updateMany({
      where: { status: 'scheduled' },
      data: { status: 'cancelled' },
    });
  });

  async function reminderAt(fireAt: Date, jobId: string | null = null) {
    const entry = await prisma.entry.create({
      data: {
        userId,
        module: 'expense',
        title: 'ค่าเน็ต',
        occurredAt: at(86_400_000),
        payload: { amountMinor: 79_900, isBill: true },
      },
    });
    return prisma.reminder.create({
      data: {
        entryId: entry.id,
        channel: 'push',
        offsetMinutes: -1440,
        fireAt,
        jobId,
        idempotencyKey: `${entry.id}:push:-1440`,
      },
    });
  }
  const statusOf = async (id: string) =>
    (await prisma.reminder.findUniqueOrThrow({ where: { id } })).status;

  it('ส่งเฉพาะที่ถึงเวลา (ล่วงหน้าได้ไม่เกิน 30 วินาที) · ที่ยังไกลรอรอบหน้า', async () => {
    const due = await reminderAt(at(-20_000));
    const soon = await reminderAt(at(25_000));
    const later = await reminderAt(at(90_000));
    const d = new FakeDispatcher();
    const result = await runDueReminders(prisma, d, NOW);
    expect(result).toMatchObject({ sent: 2 });
    expect(await statusOf(due.id)).toBe('sent');
    expect(await statusOf(soon.id)).toBe('sent');
    expect(await statusOf(later.id)).toBe('scheduled');
    expect(d.sent[0]).toMatchObject({ title: 'ค่าเน็ต ฿799.00', body: 'ครบกำหนดพรุ่งนี้' });
  });

  it('เรียกซ้อนกัน 3 ครั้ง (ตัวเรียก retry ตอน timeout) → ส่งครั้งเดียว', async () => {
    const r = await reminderAt(at(-5_000));
    const d = new FakeDispatcher();
    await Promise.all([1, 2, 3].map(() => runDueReminders(prisma, d, NOW)));
    expect(d.sent.filter((m) => m.entryId === r.entryId)).toHaveLength(1);
  });

  it('ล้มชั่วคราว → ยัง scheduled (นับ attempts) และนาทีถัดไปส่งสำเร็จ', async () => {
    const r = await reminderAt(at(-5_000));
    const d = new FakeDispatcher();
    d.failTimes = 1;
    expect(await runDueReminders(prisma, d, NOW)).toMatchObject({ retrying: 1, sent: 0 });
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } });
    expect(after).toMatchObject({ status: 'scheduled', attempts: 1, jobId: null });

    expect(await runDueReminders(prisma, d, at(60_000))).toMatchObject({ sent: 1 });
    expect(await statusOf(r.id)).toBe('sent');
  });

  it('รอบก่อนตายกลางทาง (lease ค้าง) → ไม่แย่งภายใน 2 นาที · เกิน 2 นาทีหยิบใหม่', async () => {
    const r = await reminderAt(at(-5_000), `cron:${at(-60_000).getTime()}`);
    const d = new FakeDispatcher();
    await runDueReminders(prisma, d, NOW);
    expect(await statusOf(r.id)).toBe('scheduled');
    await runDueReminders(prisma, d, at(61_000)); // lease อายุเกิน 2 นาทีแล้ว
    expect(await statusOf(r.id)).toBe('sent');
  });

  it('พลาดเกิน 1 ชั่วโมง → failed ไม่ส่งย้อนหลัง', async () => {
    const r = await reminderAt(at(-61 * 60_000));
    const d = new FakeDispatcher();
    expect(await runDueReminders(prisma, d, NOW)).toMatchObject({ expired: 1, sent: 0 });
    expect(await statusOf(r.id)).toBe('failed');
  });

  it('endpoint: ไม่มี / ผิด secret → 401 · ถูก → 200 พร้อมสรุปผล (reminders และ digest)', async () => {
    const api = () => request(app.getHttpServer());
    await api().get('/api/v1/internal/cron/reminders').expect(401);
    await api()
      .get('/api/v1/internal/cron/reminders')
      .set('Authorization', 'Bearer wrong')
      .expect(401);
    const ok = await api()
      .get('/api/v1/internal/cron/reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`)
      .expect(200);
    expect(ok.body).toEqual(
      expect.objectContaining({ sent: expect.any(Number), expired: expect.any(Number) }),
    );
    const digest = await api()
      .get('/api/v1/internal/cron/digest')
      .set('Authorization', `Bearer ${CRON_SECRET}`)
      .expect(200);
    // ไม่ได้ตั้ง NOTIFICATION_ACTION_SECRET ในเทสต์นี้ → ข้ามสรุปรายวันทั้งหมด (สร้างลิงก์เลิกรับไม่ได้)
    expect(digest.body).toEqual({ sent: 0, empty: 0, failed: 0 });
  });
});
