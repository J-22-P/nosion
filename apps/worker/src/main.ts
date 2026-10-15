import { config as loadDotenv } from 'dotenv';
loadDotenv();

import { PrismaClient } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from './logger';
import { runCleanup } from './processors/cleanup.processor';
import { LogDispatcher, type ReminderDispatcher } from './reminders/dispatcher';
import { WebPushDispatcher } from './reminders/web-push.dispatcher';
import { startReminderPipeline } from './reminders/pipeline';
import { DEFAULT_JOB_OPTIONS, QUEUE } from './queues';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // BullMQ ต้องการค่านี้เป็น null เพื่อให้ blocking command ทำงาน
});
const prisma = new PrismaClient();

/**
 * Worker แยก container จาก API เพราะต้องเป็น long-running process
 * (เหตุผลเดียวกับที่แยก NestJS ออกจาก Next.js API Routes — ADR-001)
 */
async function bootstrap(): Promise<void> {
  const cleanupQueue = new Queue(QUEUE.cleanup, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  // งานประจำวันตี 3 ตามเวลาไทย (20:00 UTC ของวันก่อนหน้า)
  await cleanupQueue.upsertJobScheduler(
    'daily-cleanup',
    { pattern: '0 20 * * *' },
    { name: 'cleanup', data: {} },
  );

  const cleanupWorker = new Worker(
    QUEUE.cleanup,
    async (job: Job) => {
      const result = await runCleanup(prisma);
      logger.info({ jobId: job.id, ...result }, 'cleanup เสร็จสิ้น');
      return result;
    },
    { connection, concurrency: 1 },
  );

  // Reminder Engine (สเปก 6.2) — push ส่งจริงเมื่อตั้ง VAPID · ช่องทางอื่นยังบันทึก log (email: ขั้น 4)
  const reminders = await startReminderPipeline({
    connection,
    prisma,
    dispatcher: createDispatcher(),
  });

  cleanupWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'job ล้มเหลว');
  });

  logger.info('NOSION worker พร้อมรับงานแล้ว');

  // graceful shutdown: ปิด worker ก่อน เพื่อให้ job ที่ทำค้างอยู่จบก่อนตัดการเชื่อมต่อ
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'กำลังปิด worker อย่างนุ่มนวล…');
    await reminders.close();
    await cleanupWorker.close();
    await cleanupQueue.close();
    await prisma.$disconnect();
    connection.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

function createDispatcher(): ReminderDispatcher {
  const log = new LogDispatcher();
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, NOTIFICATION_ACTION_SECRET } =
    process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn(
      'ไม่ได้ตั้ง VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — การเตือนแบบ push จะถูกบันทึก log แทนการส่งจริง',
    );
    return log;
  }
  if (!NOTIFICATION_ACTION_SECRET) {
    logger.warn(
      'ไม่ได้ตั้ง NOTIFICATION_ACTION_SECRET — notification จะไม่มีปุ่ม "จ่ายแล้ว / เลื่อน"',
    );
  }
  return new WebPushDispatcher(
    prisma,
    {
      publicKey: VAPID_PUBLIC_KEY,
      privateKey: VAPID_PRIVATE_KEY,
      subject: VAPID_SUBJECT ?? 'mailto:noreply@nosion.dev',
      actionSecret: NOTIFICATION_ACTION_SECRET,
    },
    log,
  );
}

bootstrap().catch((err: unknown) => {
  logger.error({ err }, 'worker เริ่มทำงานไม่สำเร็จ');
  process.exit(1);
});
