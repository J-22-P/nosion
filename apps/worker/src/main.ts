import { config as loadDotenv } from 'dotenv';
loadDotenv();

import { PrismaClient } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from './logger';
import { createMetrics } from './metrics';
import { startServer } from './server';
import { runCleanup } from './processors/cleanup.processor';
import { LogDispatcher, type ReminderDispatcher } from './reminders/dispatcher';
import { WebPushDispatcher } from './reminders/web-push.dispatcher';
import { ChannelRouter, EmailDispatcher } from './reminders/email.dispatcher';
import { createMailTransport, type MailDriver, type MailTransport } from '@nosion/emails';
import { runDailyDigest } from './digest/daily-digest';
import { startReminderPipeline } from './reminders/pipeline';
import { DEFAULT_JOB_OPTIONS, QUEUE } from './queues';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // BullMQ ต้องการค่านี้เป็น null เพื่อให้ blocking command ทำงาน
  // 0 = IPv4 หรือ IPv6 — เครือข่ายภายในของ Fly.io (*.internal) มีแต่ IPv6 แต่ ioredis ค่าเริ่มต้นหาแค่ IPv4
  family: 0,
});
const prisma = new PrismaClient();
const metrics = createMetrics();
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const mail: MailTransport = createMailTransport({
  driver: (process.env.MAIL_DRIVER ?? 'log') as MailDriver,
  from: process.env.EMAIL_FROM ?? 'NOSION <noreply@nosion.dev>',
  smtpUrl: process.env.SMTP_URL,
  resendApiKey: process.env.RESEND_API_KEY,
  log: (m) => logger.info({ to: m.to, subject: m.subject }, 'email (log only)'),
});

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
    metrics,
  });

  // สรุปรายวันตามนาฬิกาของผู้ใช้แต่ละคน (สเปก 10.2) — รันทุก 15 นาที แล้วเลือกคนที่ถึงเวลาใน SQL
  const digestQueue = new Queue(QUEUE.digest, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  await digestQueue.upsertJobScheduler(
    'daily-digest',
    { pattern: '*/15 * * * *' },
    { name: 'daily-digest', data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } },
  );
  const digestWorker = new Worker(
    QUEUE.digest,
    async () => {
      const result = await runDailyDigest({
        prisma,
        transport: mail,
        appUrl: APP_URL,
        apiUrl: API_URL,
        unsubscribeSecret: process.env.NOTIFICATION_ACTION_SECRET,
      });
      if (result.sent || result.failed) logger.info(result, 'daily digest');
      return result;
    },
    { connection, concurrency: 1 },
  );

  metrics.watchQueues(cleanupQueue, digestQueue);
  const server = startServer(Number(process.env.METRICS_PORT ?? 9464), metrics.registry, {
    ready: async () => {
      await prisma.$queryRaw`SELECT 1`;
      await connection.ping();
    },
  });

  cleanupWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'job ล้มเหลว');
  });

  logger.info('NOSION worker พร้อมรับงานแล้ว');

  // graceful shutdown: ปิด worker ก่อน เพื่อให้ job ที่ทำค้างอยู่จบก่อนตัดการเชื่อมต่อ
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'กำลังปิด worker อย่างนุ่มนวล…');
    server.close();
    await reminders.close();
    await digestWorker.close();
    await digestQueue.close();
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
  const env = process.env;
  const routes: ConstructorParameters<typeof ChannelRouter>[0] = {};

  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    if (!env.NOTIFICATION_ACTION_SECRET) {
      logger.warn(
        'ไม่ได้ตั้ง NOTIFICATION_ACTION_SECRET — notification จะไม่มีปุ่ม "จ่ายแล้ว / เลื่อน"',
      );
    }
    routes.push = new WebPushDispatcher(
      prisma,
      {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT ?? 'mailto:noreply@nosion.dev',
        actionSecret: env.NOTIFICATION_ACTION_SECRET,
      },
      log,
    );
  } else {
    logger.warn(
      'ไม่ได้ตั้ง VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — การเตือนแบบ push จะถูกบันทึก log แทนการส่งจริง',
    );
  }

  if (mail.driver !== 'log') routes.email = new EmailDispatcher(prisma, mail, APP_URL);

  return new ChannelRouter(routes, log);
}

bootstrap().catch((err: unknown) => {
  logger.error({ err }, 'worker เริ่มทำงานไม่สำเร็จ');
  process.exit(1);
});
