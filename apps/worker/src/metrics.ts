import type { Queue } from 'bullmq';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Metrics ของ worker (สเปก 14.3) — Prometheus ดึงจาก GET /metrics (server.ts)
 * registry แยกต่อ instance เพื่อให้เทสต์สร้างใหม่ได้โดยไม่ชนกับค่าที่สะสมจากเทสต์อื่น
 */
export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const reminderLag = new Histogram({
    name: 'reminder_delivery_lag_seconds',
    help: 'ส่งการเตือนช้ากว่า fireAt กี่วินาที — metric สำคัญที่สุดของ Reminder Engine',
    labelNames: ['channel'] as const,
    // DoD ±60 วินาที · alert ที่ p95 > 120 วินาที — ละเอียดช่วงต้น หยาบช่วงท้าย
    buckets: [1, 5, 15, 30, 60, 120, 300, 900, 3600],
    registers: [registry],
  });

  const reminderFailures = new Counter({
    name: 'reminder_failures_total',
    help: 'การเตือนที่ส่งไม่สำเร็จ (นับทุกครั้งที่ล้ม รวมที่ retry แล้วสำเร็จ)',
    labelNames: ['channel', 'kind'] as const,
    registers: [registry],
  });

  const queueJobs = new Counter({
    name: 'queue_jobs_total',
    help: 'job ที่ทำเสร็จ แยกตามคิวและผลลัพธ์',
    labelNames: ['queue', 'status'] as const,
    registers: [registry],
  });

  const queueJobDuration = new Histogram({
    name: 'queue_job_duration_seconds',
    help: 'เวลาที่ใช้ประมวลผล job',
    labelNames: ['queue'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registry],
  });

  const queues: Queue[] = [];
  new Gauge({
    name: 'queue_depth',
    help: 'จำนวน job ในคิวแยกตามสถานะ — waiting ที่โตค้างคือ worker ตามไม่ทัน',
    labelNames: ['queue', 'state'] as const,
    registers: [registry],
    // อ่านจาก Redis ตอนถูก scrape เท่านั้น ไม่ poll เอง
    async collect() {
      this.reset();
      for (const queue of queues) {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
        for (const [state, value] of Object.entries(counts)) {
          this.set({ queue: queue.name, state }, value);
        }
      }
    },
  });

  return {
    registry,
    reminderLag,
    reminderFailures,
    queueJobs,
    queueJobDuration,
    watchQueues(...more: Queue[]) {
      queues.push(...more);
    },
  };
}

export type WorkerMetrics = ReturnType<typeof createMetrics>;
