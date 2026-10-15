import type { PrismaClient } from '@prisma/client';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { logger } from '../logger';
import type { WorkerMetrics } from '../metrics';
import { QUEUE, REMINDER_JOB_OPTIONS } from '../queues';
import type { ReminderDispatcher } from './dispatcher';
import { RetryableDeliveryError, processReminder } from './processor';
import { sweepReminders, type ReminderJobData } from './sweeper';

export interface ReminderPipelineOptions {
  connection: ConnectionOptions;
  prisma: PrismaClient;
  dispatcher: ReminderDispatcher;
  /** prefix ของคีย์ใน Redis — เทสต์ใช้ค่าสุ่มเพื่อไม่ชนกับ worker อื่น */
  prefix?: string;
  /** ทุกกี่ ms (ค่าจริง 60s · เทสต์ปิดด้วย null แล้วเรียก sweep เอง) */
  sweepEveryMs?: number | null;
  /** override backoff ในเทสต์ — ค่าจริง 30s ทำให้เทสต์ retry ช้าเกินไป */
  backoffMs?: number;
  metrics?: WorkerMetrics;
}

/**
 * ประกอบ Reminder Engine ทั้งสองชั้น (สเปก 6.2):
 *   reminder-sweep (ทุกนาที) → sweepReminders → คิว reminder (delay ≤ 5 นาที) → processReminder
 *   retry ครบแล้วยังล้ม → คัดลอกเข้า reminder-dlq ไว้ retry ด้วยมือ
 */
export async function startReminderPipeline(options: ReminderPipelineOptions) {
  const { connection, prisma, dispatcher, prefix, metrics } = options;
  const jobOptions = {
    ...REMINDER_JOB_OPTIONS,
    ...(options.backoffMs !== undefined
      ? { backoff: { type: 'exponential' as const, delay: options.backoffMs } }
      : {}),
  };
  const reminderQueue = new Queue<ReminderJobData>(QUEUE.reminder, {
    connection,
    prefix,
    defaultJobOptions: jobOptions,
  });
  const sweepQueue = new Queue(QUEUE.reminderSweep, { connection, prefix });
  const dlq = new Queue(QUEUE.reminderDlq, { connection, prefix });

  const sweep = (now = new Date()) =>
    sweepReminders(
      prisma,
      async ({ jobId, data, delay }) => {
        await reminderQueue.add('send', data, { jobId, delay });
      },
      now,
    );

  const sweepEveryMs = options.sweepEveryMs === undefined ? 60_000 : options.sweepEveryMs;
  if (sweepEveryMs !== null) {
    await sweepQueue.upsertJobScheduler(
      'reminder-sweep',
      { every: sweepEveryMs },
      { name: 'sweep', data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } },
    );
  }

  const sweepWorker = new Worker(
    QUEUE.reminderSweep,
    async () => {
      const result = await sweep();
      if (result.enqueued || result.expired) logger.info(result, 'reminder sweep');
      return result;
    },
    { connection, prefix, concurrency: 1 },
  );

  const reminderWorker = new Worker<ReminderJobData>(
    QUEUE.reminder,
    async (job: Job<ReminderJobData>) => {
      const stopTimer = metrics?.queueJobDuration.startTimer({ queue: QUEUE.reminder });
      try {
        const outcome = await processReminder(prisma, dispatcher, job.data);
        metrics?.queueJobs.inc({ queue: QUEUE.reminder, status: outcome.result });
        if (outcome.result === 'sent') {
          // วัดตอนส่งเสร็จจริง เทียบกับ fireAt ที่อยู่ใน job — รวมเวลารอคิว + เวลาส่ง
          const lag = Math.max(0, (Date.now() - Date.parse(job.data.fireAt)) / 1000);
          metrics?.reminderLag.observe({ channel: outcome.channel }, lag);
        }
        if (outcome.result === 'failed') {
          metrics?.reminderFailures.inc({ channel: outcome.channel, kind: 'permanent' });
        }
        logger.info({ jobId: job.id, reminderId: job.data.reminderId, ...outcome }, 'reminder');
        return outcome;
      } catch (err) {
        metrics?.queueJobs.inc({ queue: QUEUE.reminder, status: 'error' });
        metrics?.reminderFailures.inc({
          channel: err instanceof RetryableDeliveryError ? err.channel : 'unknown',
          kind: 'retryable',
        });
        throw err;
      } finally {
        stopTimer?.();
      }
    },
    { connection, prefix, concurrency: 10 },
  );

  metrics?.watchQueues(reminderQueue, sweepQueue, dlq);

  reminderWorker.on('failed', (job, err) => {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    logger.error(
      { jobId: job.id, attempts: job.attemptsMade, exhausted, err: err.message },
      'ส่งการเตือนไม่สำเร็จ',
    );
    if (exhausted) {
      void dlq.add('dead', { ...job.data, error: err.message }, { jobId: job.id });
    }
  });

  return {
    reminderQueue,
    dlq,
    sweep,
    async close() {
      await Promise.all([sweepWorker.close(), reminderWorker.close()]);
      await Promise.all([reminderQueue.close(), sweepQueue.close(), dlq.close()]);
    },
  };
}
