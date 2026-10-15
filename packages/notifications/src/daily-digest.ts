import { dayBoundsInTimeZone, formatMoney, signUnsubscribeToken } from '@nosion/core';
import { renderEmail, type DigestItem, type MailTransport } from '@nosion/emails';
import { Prisma, type PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { dueText } from './message';

/** ส่งได้ภายในกี่นาทีหลังเวลาที่ตั้ง — cron รันทุก 15 นาที ถ้า worker ล่มช่วงสั้น ๆ ยังส่งทัน แต่ไม่ส่ง "สรุปเช้า" ตอนบ่าย */
export const DIGEST_WINDOW_MINUTES = 180;
const BATCH = 500;
const MAX_ITEMS = 10;

export interface DueDigest {
  userId: string;
  timezone: string;
}

/**
 * ผู้ใช้ที่ถึงเวลาสรุปรายวัน "ตามนาฬิกาของตัวเอง" (สเปก 10.2)
 *
 * ทางที่ผิดคือรัน cron 07:00 UTC (คนไทยได้ตอนบ่ายสอง) — ที่นี่แปลง "ตอนนี้" เป็นเวลาท้องถิ่นของแต่ละคนใน SQL
 * ต่างจากสเปกตรงที่ใช้ "หน้าต่าง" แทนการเทียบนาทีตรง ๆ: cron ทุก 15 นาทีไม่มีทางตรงกับ 07:05 พอดี
 * และถ้า worker ล่มตอน 07:00 ก็ยังส่งได้ในรอบถัดไป · กันส่งซ้ำด้วย lastDigestSentAt < เที่ยงคืนของวันนั้นตามโซนผู้ใช้
 */
export async function findDueDigests(prisma: PrismaClient, now: Date): Promise<DueDigest[]> {
  return prisma.$queryRaw<DueDigest[]>(Prisma.sql`
    WITH local AS (
      SELECT s."userId", s.timezone, s."dailyDigestTime", s."lastDigestSentAt",
             (${now}::timestamptz AT TIME ZONE s.timezone) AS local_now
      FROM user_settings s
      JOIN users u ON u.id = s."userId"
      WHERE s."dailyDigestEnabled" AND u."deletedAt" IS NULL AND NOT u."isDemo"
    )
    SELECT "userId", timezone
    FROM local
    WHERE (EXTRACT(HOUR FROM local_now) * 60 + EXTRACT(MINUTE FROM local_now))
            BETWEEN split_part("dailyDigestTime", ':', 1)::int * 60 + split_part("dailyDigestTime", ':', 2)::int
                AND split_part("dailyDigestTime", ':', 1)::int * 60 + split_part("dailyDigestTime", ':', 2)::int
                    + ${DIGEST_WINDOW_MINUTES - 1}
      AND ("lastDigestSentAt" IS NULL
           OR "lastDigestSentAt" < ((date_trunc('day', local_now) AT TIME ZONE timezone) AT TIME ZONE 'UTC'))
    ORDER BY "userId"
    LIMIT ${BATCH}
  `);
}

/**
 * จองสิทธิ์ส่งของวันนี้ก่อนส่งจริง — worker สองตัวรันซ้อนกันจะมีตัวเดียวที่ได้ (count = 1)
 * คืนค่าเดิมไว้ใช้ปล่อยสิทธิ์คืนถ้าส่งไม่สำเร็จ (รอบถัดไปจะลองใหม่)
 */
export async function claimDigest(
  prisma: PrismaClient,
  userId: string,
  timezone: string,
  now: Date,
): Promise<{ claimed: boolean; previous: Date | null }> {
  const current = await prisma.userSettings.findUnique({
    where: { userId },
    select: { lastDigestSentAt: true },
  });
  const dayStart = dayBoundsInTimeZone(now, timezone).start;
  const { count } = await prisma.userSettings.updateMany({
    where: {
      userId,
      OR: [{ lastDigestSentAt: null }, { lastDigestSentAt: { lt: dayStart } }],
    },
    data: { lastDigestSentAt: now },
  });
  return { claimed: count === 1, previous: current?.lastDigestSentAt ?? null };
}

export interface DigestContent {
  overdue: DigestItem[];
  today: DigestItem[];
  bills: DigestItem[];
}

/** งานเลยกำหนด · รายการของวันนี้ · บิลที่ยังไม่จ่ายภายใน 7 วันข้างหน้า — ตามวันในโซนของผู้ใช้ */
export async function buildDigest(
  prisma: PrismaClient,
  userId: string,
  settings: { timezone: string; currency: string },
  now: Date,
): Promise<DigestContent> {
  const { start, end } = dayBoundsInTimeZone(now, settings.timezone);
  const open = {
    userId,
    deletedAt: null,
    status: { in: ['pending', 'active'] as ('pending' | 'active')[] },
  };
  const select = {
    id: true,
    title: true,
    module: true,
    occurredAt: true,
    isAllDay: true,
    payload: true,
  };
  const [overdue, today, bills] = await Promise.all([
    prisma.entry.findMany({
      where: { ...open, module: 'task', occurredAt: { lt: start } },
      select,
      orderBy: { occurredAt: 'asc' },
      take: MAX_ITEMS,
    }),
    prisma.entry.findMany({
      where: { ...open, module: 'task', occurredAt: { gte: start, lt: end } },
      select,
      orderBy: { occurredAt: 'asc' },
      take: MAX_ITEMS,
    }),
    prisma.entry.findMany({
      where: {
        ...open,
        module: 'expense',
        payload: { path: ['isBill'], equals: true },
        occurredAt: { gte: start, lt: new Date(end.getTime() + 6 * 86_400_000) },
      },
      select,
      orderBy: { occurredAt: 'asc' },
      take: MAX_ITEMS,
    }),
  ]);
  const due = (e: (typeof today)[number]) =>
    dueText(e.occurredAt!, e.isAllDay, now, settings.timezone);
  return {
    overdue: overdue.map((e) => ({ title: e.title, detail: due(e) })),
    today: today.map((e) => ({ title: e.title, detail: e.isAllDay ? undefined : due(e) })),
    bills: bills.map((e) => {
      const p = (e.payload ?? {}) as { amountMinor?: number; currency?: string };
      const amount =
        typeof p.amountMinor === 'number'
          ? formatMoney(p.amountMinor, p.currency ?? settings.currency)
          : undefined;
      return { title: e.title, detail: [due(e), amount].filter(Boolean).join(' · ') };
    }),
  };
}

export interface DigestDeps {
  prisma: PrismaClient;
  transport: MailTransport;
  appUrl: string;
  apiUrl: string;
  /** ลายเซ็นลิงก์เลิกรับ — ไม่มี = ไม่ส่ง digest (อีเมลแจ้งข่าวสารต้องเลิกรับได้เสมอ) */
  unsubscribeSecret: string | undefined;
}

/** งานทุก 15 นาที (สเปก 10.1 `daily-digest`) */
export async function runDailyDigest(
  deps: DigestDeps,
  now = new Date(),
): Promise<{ sent: number; empty: number; failed: number }> {
  const result = { sent: 0, empty: 0, failed: 0 };
  if (!deps.unsubscribeSecret) {
    logger.warn('ไม่ได้ตั้ง NOTIFICATION_ACTION_SECRET — ข้ามสรุปรายวัน (สร้างลิงก์เลิกรับไม่ได้)');
    return result;
  }
  for (const { userId, timezone } of await findDueDigests(deps.prisma, now)) {
    const claim = await claimDigest(deps.prisma, userId, timezone, now);
    if (!claim.claimed) continue;
    try {
      const user = await deps.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, displayName: true, settings: { select: { currency: true } } },
      });
      const content = await buildDigest(
        deps.prisma,
        userId,
        { timezone, currency: user.settings?.currency ?? 'THB' },
        now,
      );
      // ไม่มีอะไรเลย = ไม่ส่ง — อีเมล "วันนี้ว่าง" ทุกเช้าทำให้คนเลิกเปิดอ่านฉบับที่มีเรื่องจริง
      if (!content.overdue.length && !content.today.length && !content.bills.length) {
        result.empty += 1;
        continue;
      }
      const unsubscribeUrl = `${deps.apiUrl}/api/v1/email/unsubscribe?token=${signUnsubscribeToken(
        { userId, kind: 'digest' },
        deps.unsubscribeSecret,
        now,
      )}`;
      const mail = await renderEmail('dailyDigest', {
        name: user.displayName,
        dateLabel: new Intl.DateTimeFormat('th-TH', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: timezone,
        }).format(now),
        ...content,
        appUrl: `${deps.appUrl}/today`,
        settingsUrl: `${deps.appUrl}/settings`,
        unsubscribeUrl,
      });
      await deps.transport.send({
        to: user.email,
        ...mail,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      // คืนสิทธิ์ — รอบ 15 นาทีถัดไปลองใหม่ (ยังอยู่ในหน้าต่าง 3 ชม.)
      await deps.prisma.userSettings.updateMany({
        where: { userId, lastDigestSentAt: now },
        data: { lastDigestSentAt: claim.previous },
      });
      logger.error({ userId, err: (err as Error).message }, 'ส่งสรุปรายวันไม่สำเร็จ');
    }
  }
  return result;
}
