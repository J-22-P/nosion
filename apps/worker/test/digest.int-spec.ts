import type { MailTransport, OutgoingMail } from '@nosion/emails';
import { verifyUnsubscribeToken } from '@nosion/core';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { claimDigest, findDueDigests, runDailyDigest } from '../src/digest/daily-digest';

const prisma = new PrismaClient();
const SECRET = 'd'.repeat(48);
const created: string[] = [];

/** ผู้ใช้ทดสอบ — ฐานเดียวกับ integration ของ API จึงตรวจเฉพาะ id ของเราเอง ไม่นับจำนวนรวม */
async function user(
  opts: Partial<{
    timezone: string;
    time: string;
    enabled: boolean;
    isDemo: boolean;
    deletedAt: Date;
    lastDigestSentAt: Date;
  }> = {},
) {
  const u = await prisma.user.create({
    data: {
      email: `digest-${crypto.randomUUID()}@test.local`,
      displayName: 'Digest',
      isDemo: opts.isDemo ?? false,
      deletedAt: opts.deletedAt ?? null,
      settings: {
        create: {
          timezone: opts.timezone ?? 'Asia/Bangkok',
          dailyDigestTime: opts.time ?? '07:00',
          dailyDigestEnabled: opts.enabled ?? true,
          lastDigestSentAt: opts.lastDigestSentAt ?? null,
        },
      },
    },
  });
  created.push(u.id);
  return u;
}

const dueIds = async (now: Date) => (await findDueDigests(prisma, now)).map((d) => d.userId);

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('สรุปรายวันตามนาฬิกาของผู้ใช้ (สเปก 10.2) — SQL กับ PostgreSQL จริง', () => {
  it('07:00 ของแต่ละโซน: คนไทยถึงเวลาตอน 00:05 UTC · คนนิวยอร์กตอน 12:05 UTC', async () => {
    const th = await user({ timezone: 'Asia/Bangkok' });
    const ny = await user({ timezone: 'America/New_York' });
    const at0005 = await dueIds(new Date('2027-01-10T00:05:00Z')); // 07:05 ไทย · 19:05 NY (เมื่อวาน)
    expect(at0005).toContain(th.id);
    expect(at0005).not.toContain(ny.id);
    const at1205 = await dueIds(new Date('2027-01-10T12:05:00Z')); // 19:05 ไทย · 07:05 NY
    expect(at1205).toContain(ny.id);
    expect(at1205).not.toContain(th.id);
  });

  it('หน้าต่าง 3 ชั่วโมง: 06:59 ยังไม่ถึง · 09:59 ยังส่ง · 10:00 เลยแล้ว', async () => {
    const u = await user();
    expect(await dueIds(new Date('2027-01-09T23:59:00Z'))).not.toContain(u.id); // 06:59 ไทย
    expect(await dueIds(new Date('2027-01-10T02:59:00Z'))).toContain(u.id); // 09:59
    expect(await dueIds(new Date('2027-01-10T03:00:00Z'))).not.toContain(u.id); // 10:00
  });

  it('ส่งไปแล้ววันนี้ (ตามวันของผู้ใช้) → ไม่ถึงเวลา · ส่งเมื่อวาน → ถึงเวลา', async () => {
    // 2027-01-09T23:30Z = 06:30 ของวันที่ 10 เวลาไทย → นับเป็น "วันนี้" แม้ตาม UTC ยังเป็นวันที่ 9
    const sentToday = await user({ lastDigestSentAt: new Date('2027-01-09T23:30:00Z') });
    const sentYesterday = await user({ lastDigestSentAt: new Date('2027-01-09T00:05:00Z') });
    const due = await dueIds(new Date('2027-01-10T00:05:00Z'));
    expect(due).not.toContain(sentToday.id);
    expect(due).toContain(sentYesterday.id);
  });

  it('ปิด digest / บัญชีทดลอง / ผู้ใช้ถูกลบ → ไม่ส่ง', async () => {
    const off = await user({ enabled: false });
    const demo = await user({ isDemo: true });
    const gone = await user({ deletedAt: new Date() });
    const due = await dueIds(new Date('2027-01-10T00:05:00Z'));
    for (const u of [off, demo, gone]) expect(due).not.toContain(u.id);
  });

  it('จองสิทธิ์พร้อมกัน 3 ตัว → ได้ตัวเดียว', async () => {
    const u = await user();
    const now = new Date('2027-01-10T00:05:00Z');
    const claims = await Promise.all(
      [1, 2, 3].map(() => claimDigest(prisma, u.id, 'Asia/Bangkok', now)),
    );
    expect(claims.filter((c) => c.claimed)).toHaveLength(1);
  });
});

describe('runDailyDigest', () => {
  const now = new Date('2027-01-10T00:05:00Z'); // 07:05 ไทย
  const transport = (fail = false) => {
    const sent: OutgoingMail[] = [];
    const t: MailTransport = {
      driver: 'smtp',
      send: async (mail) => {
        if (fail) throw new Error('SMTP ล่ม');
        sent.push(mail);
      },
    };
    return { t, sent };
  };
  const deps = (t: MailTransport) => ({
    prisma,
    transport: t,
    appUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:3001',
    unsubscribeSecret: SECRET,
  });

  it('เนื้อหา: งานเลยกำหนด · งานวันนี้ · บิลภายใน 7 วัน (ไม่รวมที่จ่ายแล้ว) + ลิงก์เลิกรับที่ใช้ได้จริง · รันซ้ำไม่ส่งซ้ำ', async () => {
    const u = await user();
    const at = (iso: string) => new Date(iso);
    await prisma.entry.createMany({
      data: [
        {
          userId: u.id,
          module: 'task',
          title: 'ส่งรายงาน',
          occurredAt: at('2027-01-07T17:00:00Z'),
        }, // 8 ม.ค. ไทย → เลย 2 วัน
        {
          userId: u.id,
          module: 'task',
          title: 'ประชุมทีม',
          occurredAt: at('2027-01-10T07:00:00Z'),
          isAllDay: false,
        }, // 14:00 วันนี้
        {
          userId: u.id,
          module: 'task',
          title: 'งานที่เสร็จแล้ว',
          occurredAt: at('2027-01-09T17:00:00Z'),
          status: 'done',
        },
        {
          userId: u.id,
          module: 'expense',
          title: 'ค่าเน็ต',
          occurredAt: at('2027-01-10T17:00:00Z'),
          payload: { amountMinor: 79_900, isBill: true },
        },
        {
          userId: u.id,
          module: 'expense',
          title: 'ค่าไฟ (จ่ายแล้ว)',
          occurredAt: at('2027-01-11T17:00:00Z'),
          status: 'done',
          payload: { amountMinor: 1, isBill: true },
        },
        {
          userId: u.id,
          module: 'expense',
          title: 'บิลเดือนหน้า',
          occurredAt: at('2027-02-01T17:00:00Z'),
          payload: { amountMinor: 1, isBill: true },
        },
        {
          userId: u.id,
          module: 'expense',
          title: 'กาแฟ',
          occurredAt: at('2027-01-10T01:00:00Z'),
          payload: { amountMinor: 6500 },
        },
      ],
    });

    const { t, sent } = transport();
    await runDailyDigest(deps(t), now);
    const mine = sent.filter((m) => m.to === u.email);
    expect(mine).toHaveLength(1);
    const mail = mine[0]!;
    expect(mail.subject).toBe('วันนี้มี 3 เรื่องรอคุณ · NOSION');
    expect(mail.text).toContain('ส่งรายงาน');
    expect(mail.text).toContain('เลยกำหนดมา 2 วัน');
    expect(mail.text).toContain('ถึงเวลา 14:00');
    expect(mail.text).toContain('ครบกำหนดพรุ่งนี้ · ฿799.00');
    for (const hidden of ['งานที่เสร็จแล้ว', 'ค่าไฟ (จ่ายแล้ว)', 'บิลเดือนหน้า', 'กาแฟ']) {
      expect(mail.text).not.toContain(hidden);
    }

    const url = mail.headers!['List-Unsubscribe']!.slice(1, -1);
    const token = new URL(url).searchParams.get('token')!;
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({ userId: u.id, kind: 'digest' });
    expect(mail.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    const again = transport();
    await runDailyDigest(deps(again.t), new Date('2027-01-10T00:20:00Z'));
    expect(again.sent.filter((m) => m.to === u.email)).toHaveLength(0);
  });

  it('ไม่มีอะไรเลย → ไม่ส่ง (แต่นับว่าวันนี้จัดการแล้ว)', async () => {
    const u = await user();
    const { t, sent } = transport();
    await runDailyDigest(deps(t), now);
    expect(sent.filter((m) => m.to === u.email)).toHaveLength(0);
    expect(
      (await prisma.userSettings.findUniqueOrThrow({ where: { userId: u.id } })).lastDigestSentAt,
    ).toEqual(now);
  });

  it('ส่งไม่สำเร็จ → คืนสิทธิ์ รอบถัดไปลองใหม่ได้', async () => {
    const u = await user();
    await prisma.entry.create({
      data: {
        userId: u.id,
        module: 'task',
        title: 'งานวันนี้',
        occurredAt: new Date('2027-01-09T17:00:00Z'),
      },
    });
    await runDailyDigest(deps(transport(true).t), now);
    expect(
      (await prisma.userSettings.findUniqueOrThrow({ where: { userId: u.id } })).lastDigestSentAt,
    ).toBeNull();

    const retry = transport();
    await runDailyDigest(deps(retry.t), new Date('2027-01-10T00:20:00Z'));
    expect(retry.sent.filter((m) => m.to === u.email)).toHaveLength(1);
  });

  it('ไม่มี secret สำหรับลิงก์เลิกรับ → ไม่ส่งเลย', async () => {
    const { t, sent } = transport();
    const result = await runDailyDigest({ ...deps(t), unsubscribeSecret: undefined }, now);
    expect(result).toEqual({ sent: 0, empty: 0, failed: 0 });
    expect(sent).toHaveLength(0);
  });
});
