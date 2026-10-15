import { PrismaClient, type ReminderChannel } from '@prisma/client';
import IORedis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PermanentDeliveryError,
  type ReminderDispatcher,
  type ReminderMessage,
} from '@nosion/notifications';
import { createMetrics, type WorkerMetrics } from '../src/metrics';
import { startReminderPipeline } from '../src/reminders/pipeline';
import { jobIdFor, processReminder, sweepReminders } from '@nosion/notifications';

/** dispatcher ปลอม — จดว่าส่งอะไรเมื่อไร และกำหนดให้ล้มได้ */
class FakeDispatcher implements ReminderDispatcher {
  sent: { channel: ReminderChannel; message: ReminderMessage; at: Date }[] = [];
  calls = 0;
  failTimes = 0;
  permanent = false;

  async send(channel: ReminderChannel, message: ReminderMessage): Promise<void> {
    this.calls += 1;
    if (this.permanent) throw new PermanentDeliveryError('ไม่มี push subscription');
    if (this.failTimes > 0) {
      this.failTimes -= 1;
      throw new Error('push service ตอบ 503');
    }
    this.sent.push({ channel, message, at: new Date() });
  }
}

const prisma = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
const userIds: string[] = [];

const statusOf = async (id: string) =>
  (await prisma.reminder.findUniqueOrThrow({ where: { id } })).status;

async function until(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('รอเกินเวลา');
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** ผู้ใช้ + รายการ + การเตือน 1 อัน · ปิด quiet hours ไว้ไม่ให้เทสต์ขึ้นกับเวลาที่รัน */
async function seed(
  fireAt: Date,
  entry: Partial<{ status: 'pending' | 'done'; deletedAt: Date }> = {},
) {
  const user = await prisma.user.create({
    data: {
      email: `worker-${crypto.randomUUID()}@test.local`,
      displayName: 'Worker Test',
      settings: { create: { quietHoursEnabled: false } },
    },
  });
  userIds.push(user.id);
  const created = await prisma.entry.create({
    data: {
      userId: user.id,
      module: 'expense',
      title: 'ค่าเน็ต',
      occurredAt: new Date(fireAt.getTime() + 86_400_000),
      payload: { amountMinor: 79_900, isBill: true },
      ...entry,
    },
  });
  return prisma.reminder.create({
    data: {
      entryId: created.id,
      channel: 'push',
      offsetMinutes: -1440,
      fireAt,
      idempotencyKey: `${created.id}:push:-1440`,
    },
  });
}

describe('Reminder Engine · worker (PostgreSQL + Redis จริง)', () => {
  let dispatcher: FakeDispatcher;
  let metrics: WorkerMetrics;
  let pipeline: Awaited<ReturnType<typeof startReminderPipeline>>;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await pipeline?.close();
    // ให้ sweeper ทำงานกับเฉพาะแถวของเทสต์นี้ — ปิดการเตือนที่ค้างจากเทสต์ก่อนหน้าก่อน
    await prisma.reminder.updateMany({
      where: { status: 'scheduled' },
      data: { status: 'cancelled' },
    });
    dispatcher = new FakeDispatcher();
    metrics = createMetrics();
    pipeline = await startReminderPipeline({
      connection,
      prisma,
      dispatcher,
      prefix: `test-${crypto.randomUUID()}`,
      sweepEveryMs: null, // เรียก sweep เองในเทสต์
      backoffMs: 50,
      metrics,
    });
  });

  afterAll(async () => {
    await pipeline?.close();
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    connection.disconnect();
  });

  it('ยิงตรงเวลา — เข้าคิวพร้อม delay แล้วส่งภายใน ±1 วินาทีจาก fireAt', async () => {
    const fireAt = new Date(Date.now() + 1_500);
    const reminder = await seed(fireAt);
    expect(await pipeline.sweep()).toMatchObject({ enqueued: 1 });
    expect(dispatcher.calls).toBe(0); // ยังไม่ถึงเวลา

    await until(async () => dispatcher.sent.length === 1);
    const lag = dispatcher.sent[0]!.at.getTime() - fireAt.getTime();
    expect(lag).toBeGreaterThanOrEqual(-50);
    expect(lag).toBeLessThan(1_000);
    expect(dispatcher.sent[0]!.message).toMatchObject({
      title: 'ค่าเน็ต ฿799.00',
      tag: `entry-${reminder.entryId}`,
    });

    // processor บันทึก sent ลง DB "หลัง" ส่งเสร็จ และ pipeline บันทึก metric หลังจากนั้นอีกที —
    // ต้องรอ ไม่ใช่อ่านทันที (CI ช้ากว่าเครื่อง dev จนเทสต์ล้มเป็นครั้งคราว)
    await until(async () => (await statusOf(reminder.id)) === 'sent');
    const saved = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(saved).toMatchObject({ status: 'sent', jobId: jobIdFor(reminder.id, fireAt) });

    // metric สำคัญที่สุด (สเปก 14.3) ถูกบันทึกด้วยค่าจริง ติดป้ายช่องทาง
    const lagCount = async () =>
      (await metrics.reminderLag.get()).values.find(
        (v) => v.metricName === 'reminder_delivery_lag_seconds_count',
      )?.value ?? 0;
    await until(async () => (await lagCount()) === 1);
    const lagMetric = (await metrics.reminderLag.get()).values;
    expect(
      lagMetric.find((v) => v.metricName === 'reminder_delivery_lag_seconds_count'),
    ).toMatchObject({
      labels: { channel: 'push' },
      value: 1,
    });
    const sum = lagMetric.find((v) => v.metricName === 'reminder_delivery_lag_seconds_sum')!.value;
    expect(sum).toBeLessThan(1);
  });

  it('ไม่ยิงซ้ำ — sweep หลายรอบและพร้อมกันได้ job เดียว ส่งครั้งเดียว', async () => {
    const reminder = await seed(new Date(Date.now() + 300));
    await Promise.all([pipeline.sweep(), pipeline.sweep(), pipeline.sweep()]);
    await pipeline.sweep();
    await until(
      async () =>
        (await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).status === 'sent',
    );
    await new Promise((r) => setTimeout(r, 500));
    await pipeline.sweep(); // หลังส่งแล้ว sweep อีกก็ไม่หยิบ (ไม่ใช่ scheduled)
    await new Promise((r) => setTimeout(r, 300));
    expect(dispatcher.calls).toBe(1);
  });

  it('retry — ปลายทางล้ม 2 ครั้งแล้วสำเร็จ · จด attempts ไว้', async () => {
    dispatcher.failTimes = 2;
    const reminder = await seed(new Date());
    await pipeline.sweep();
    await until(async () => (await statusOf(reminder.id)) === 'sent');
    const saved = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(saved).toMatchObject({ status: 'sent', attempts: 2, lastError: null });
    expect(dispatcher.calls).toBe(3);
  });

  it('retry ครบ 5 ครั้งยังล้ม → failed + เข้า DLQ', async () => {
    dispatcher.failTimes = 99;
    const reminder = await seed(new Date());
    await pipeline.sweep();
    await until(async () => (await pipeline.dlq.count()) === 1);
    const saved = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(saved).toMatchObject({ status: 'failed', attempts: 5 });
    expect(saved.lastError).toContain('503');
    expect(dispatcher.calls).toBe(5);
    const failures = (await metrics.reminderFailures.get()).values;
    expect(failures).toContainEqual(
      expect.objectContaining({ labels: { channel: 'push', kind: 'retryable' }, value: 5 }),
    );
  });

  it('ล้มแบบถาวร (ไม่มี subscription) → failed ทันที ไม่เผา retry', async () => {
    dispatcher.permanent = true;
    const reminder = await seed(new Date());
    await pipeline.sweep();
    await until(
      async () =>
        (await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).status ===
        'failed',
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(dispatcher.calls).toBe(1);
    expect(await pipeline.dlq.count()).toBe(0);
  });

  describe('guard ก่อนยิง (processReminder ตรง ๆ)', () => {
    it('รายการทำเสร็จ / ถูกลบ ก่อนถึงเวลา → ไม่ส่ง และปิดเป็น cancelled', async () => {
      for (const entry of [{ status: 'done' as const }, { deletedAt: new Date() }]) {
        const r = await seed(new Date(), entry);
        const outcome = await processReminder(prisma, dispatcher, {
          reminderId: r.id,
          fireAt: r.fireAt.toISOString(),
        });
        expect(outcome.result).toBe('skipped');
        expect((await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
          'cancelled',
        );
      }
      expect(dispatcher.calls).toBe(0);
    });

    it('job เก่า (ผู้ใช้เลื่อนวันหลังเข้าคิว) → ข้าม ไม่แตะสถานะ', async () => {
      const r = await seed(new Date());
      const outcome = await processReminder(prisma, dispatcher, {
        reminderId: r.id,
        fireAt: new Date(r.fireAt.getTime() - 60_000).toISOString(),
      });
      expect(outcome).toMatchObject({ result: 'skipped' });
      expect((await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
        'scheduled',
      );
    });

    it('ช่วงห้ามรบกวน → เลื่อนไป 07:00 เวลาไทย ไม่ทิ้ง · sweeper หยิบใหม่ตอนนั้น', async () => {
      const r = await seed(new Date('2027-01-10T16:00:00Z')); // 23:00 ไทย
      const entry = await prisma.entry.findUniqueOrThrow({ where: { id: r.entryId } });
      await prisma.userSettings.update({
        where: { userId: entry.userId },
        data: { quietHoursEnabled: true },
      });
      const outcome = await processReminder(
        prisma,
        dispatcher,
        { reminderId: r.id, fireAt: r.fireAt.toISOString() },
        new Date('2027-01-10T16:00:00Z'),
      );
      expect(outcome).toEqual({ result: 'deferred', until: new Date('2027-01-11T00:00:00Z') });
      const saved = await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } });
      expect(saved).toMatchObject({ status: 'scheduled', jobId: null });
      expect(saved.fireAt.toISOString()).toBe('2027-01-11T00:00:00.000Z');
      expect(dispatcher.calls).toBe(0);
    });
  });

  describe('sweeper', () => {
    it('พลาดเกิน 1 ชม. → failed ไม่ส่งย้อนหลัง · ไกลเกิน 5 นาทียังไม่เข้าคิว', async () => {
      const now = new Date('2027-01-10T03:00:00Z');
      const missed = await seed(new Date('2027-01-10T01:30:00Z'));
      const late = await seed(new Date('2027-01-10T02:30:00Z')); // พลาด 30 นาที — ยังส่ง
      const soon = await seed(new Date('2027-01-10T03:04:00Z'));
      const later = await seed(new Date('2027-01-10T03:06:00Z'));
      const queued: string[] = [];
      const result = await sweepReminders(
        prisma,
        async ({ data }) => {
          queued.push(data.reminderId);
        },
        now,
      );
      expect(result).toEqual({ enqueued: 2, expired: 1 });
      expect(queued.sort()).toEqual([late.id, soon.id].sort());
      expect((await prisma.reminder.findUniqueOrThrow({ where: { id: missed.id } })).status).toBe(
        'failed',
      );
      expect(
        (await prisma.reminder.findUniqueOrThrow({ where: { id: later.id } })).jobId,
      ).toBeNull();
    });
  });
});
