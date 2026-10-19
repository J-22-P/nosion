import {
  expensePayloadSchema,
  habitPayloadSchema,
  type HabitPayload,
  taskPayloadSchema,
  type ExpenseCategory,
  type ExpensePayload,
  type Priority,
  type TaskPayload,
} from '@nosion/contracts';
import { formatInTimeZone, monthBoundsInTimeZone, zonedTimeToUtc } from '@nosion/core';

/**
 * ข้อมูลบัญชีทดลอง (สเปก Phase 2b: "Seed demo account ด้วยข้อมูลชุดเดียวกับ mockup วันที่สัมพันธ์กับวันนี้")
 *
 * pure function: รับ "ตอนนี้" + โซนเวลา → คืนข้อมูลที่มีวันเวลาจริงทั้งหมด (ไม่แตะฐานข้อมูล ทดสอบได้)
 * ใช้ทั้ง POST /auth/demo (ผู้เข้าชม) และ `pnpm db:seed` (dev) — ข้อมูลชุดเดียว ไม่ต้องดูแลสองที่
 *
 * กติกาวันเวลา:
 *  - ทุกเวลาคิดเป็น "หน้าปัด" ของผู้ใช้ (zonedTimeToUtc) ไม่ใช่ setUTCHours (บั๊กเดิม: เที่ยงคืน UTC = 07:00 ไทย)
 *  - ไม่มีรายการ "เกิดขึ้นแล้ว" อยู่ในอนาคต — รายจ่ายวันนี้ถอยจาก now · รอบโฟกัสจบก่อน now
 *  - ข้ามต้นเดือนได้: รายการ "3 วันก่อน" ในวันที่ 2 ไปอยู่เดือนก่อน (ยอดเดือนนี้จึงแปรตามวันที่ — ยอมรับ)
 */

export interface DemoProject {
  key: string;
  name: string;
  color: string;
}
export interface DemoTag {
  key: string;
  name: string;
}
export interface DemoTask {
  key: string;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'done';
  priority: Priority;
  occurredAt: Date | null;
  isAllDay: boolean;
  completedAt: Date | null;
  project?: string;
  tags?: string[];
  payload: TaskPayload;
}
export interface DemoExpense {
  title: string;
  status: 'pending' | 'done';
  occurredAt: Date;
  isAllDay: boolean;
  payload: ExpensePayload;
}
export interface DemoBudget {
  category: ExpenseCategory | null;
  amountMinor: number;
}
export interface DemoFocusSession {
  task: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
}
/**
 * นิสัย (Phase 6) = กฎการเกิดซ้ำรายวัน + รอบย้อนหลัง 14 วันถึงล่วงหน้า 7 วัน
 * `done[i]` = รอบของวัน `HABIT_HISTORY_DAYS - i` วันก่อน (ตัวสุดท้าย = วันนี้) · ทำแล้วหรือยัง / ค่าที่นับได้
 */
export interface DemoHabit {
  title: string;
  payload: HabitPayload;
  /** ค่า currentValue ของแต่ละวันย้อนหลัง (เก่า → วันนี้) · null = ข้ามโดยตั้งใจ */
  history: (number | null)[];
}
export const HABIT_HISTORY_DAYS = 14;
export const HABIT_AHEAD_DAYS = 7;

export interface DemoDataset {
  projects: DemoProject[];
  tags: DemoTag[];
  tasks: DemoTask[];
  expenses: DemoExpense[];
  budgets: DemoBudget[];
  focusSessions: DemoFocusSession[];
  habits: DemoHabit[];
  /** เที่ยงคืนตามโซนผู้ใช้ของ 14 วันก่อน → 7 วันข้างหน้า (22 วัน) — slot ของรอบนิสัยแต่ละวัน */
  habitDays: Date[];
}

const MINUTE = 60_000;
const baht = (n: number) => Math.round(n * 100);

export function buildDemoDataset(now: Date, timeZone: string): DemoDataset {
  const today = formatInTimeZone(now, timeZone);
  /** 'YYYY-MM-DD' ของวันที่เลื่อนไป n วันตามปฏิทิน */
  const dayKey = (offset: number) => {
    const [y, m, d] = today.split('-').map(Number) as [number, number, number];
    return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
  };
  /** เวลาหน้าปัดของผู้ใช้ เช่น at(-1, '23:59') = เมื่อวาน 23:59 */
  const at = (offset: number, hhmm = '00:00') =>
    zonedTimeToUtc(`${dayKey(offset)}T${hhmm}:00`, timeZone);
  const todayStart = at(0);
  /** ก่อนตอนนี้ n นาที แต่ไม่ก่อนต้นวัน (เปิด demo ตอน 00:05 ก็ยังเป็น "วันนี้") */
  const earlierToday = (minutesAgo: number) =>
    new Date(Math.max(now.getTime() - minutesAgo * MINUTE, todayStart.getTime() + MINUTE));

  const task = (
    t: Omit<DemoTask, 'payload' | 'completedAt' | 'isAllDay'> & {
      isAllDay?: boolean;
      completedAt?: Date | null;
      payload?: Partial<TaskPayload>;
    },
  ): DemoTask => ({
    ...t,
    isAllDay: t.isAllDay ?? false,
    completedAt: t.completedAt ?? null,
    payload: taskPayloadSchema.parse(t.payload ?? {}),
  });
  const checklist = (done: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({
      id: `c${i + 1}`,
      text: `ขั้นที่ ${i + 1}`,
      done: i < done,
    }));

  // ── งาน (mockup 8.11.1 / 8.11.2) ───────────────────
  const tasks: DemoTask[] = [
    task({
      key: 'auth',
      title: 'Re-architect Auth Token Rotation Pipeline',
      description: 'รองรับ Multi-tenant JWT refresh token พร้อม revocation strategy บน Redis',
      status: 'active',
      priority: 'urgent',
      occurredAt: at(0, '17:00'),
      project: 'core',
      tags: ['dev'],
      payload: {
        estimateMinutes: 240,
        checklist: checklist(4, 5),
        github: {
          repo: 'jay/nosion',
          issueNumber: null,
          prNumber: 104,
          autoCloseOnMerge: true,
          url: null,
          milestoneDueOn: null,
          dueOn: null,
          startOn: null,
          state: null,
        },
        branchName: 'feat/auth-refresh',
        deferCount: 2,
      },
    }),
    task({
      key: 'safari',
      title: 'แก้ Auth Redirect Callback สำหรับ Safari WebKit',
      status: 'pending',
      priority: 'urgent',
      occurredAt: at(-1, '23:59'), // เลยกำหนดเมื่อคืน
      project: 'core',
      tags: ['bug'],
      payload: { estimateMinutes: 60, branchName: 'fix/safari-redirect' },
    }),
    task({
      key: 'outbox',
      title: 'Merge Pull Request #108: IndexedDB Outbox Engine',
      description: 'รอ Code Review จาก @sarah',
      status: 'pending',
      priority: 'high',
      occurredAt: at(0, '10:30'),
      project: 'web',
      tags: ['blocked'], // → กลุ่ม Blocked ใน standup
      payload: {
        github: {
          repo: 'jay/nosion',
          issueNumber: null,
          prNumber: 108,
          autoCloseOnMerge: true,
          url: null,
          milestoneDueOn: null,
          dueOn: null,
          startOn: null,
          state: null,
        },
      },
    }),
    task({
      key: 'sync',
      title: 'Sync สถาปัตยกรรม Local-First กับทีม Platform',
      description: 'Google Meet · 4 สมาชิกเข้าร่วม',
      status: 'pending',
      priority: 'medium',
      occurredAt: at(0, '16:30'),
      project: 'api',
    }),
    task({
      key: 'sqlite',
      title: 'Optimize SQLite query performance for mobile cache layer',
      description: 'สร้าง index แบบ composite และปรับ journal_mode เป็น WAL',
      status: 'pending',
      priority: 'high',
      occurredAt: at(1),
      isAllDay: true,
      project: 'web',
      tags: ['dev'],
      payload: {
        estimateMinutes: 180,
        checklist: checklist(1, 4),
        github: {
          repo: 'jay/nosion',
          issueNumber: null,
          prNumber: 112,
          autoCloseOnMerge: true,
          url: null,
          milestoneDueOn: null,
          dueOn: null,
          startOn: null,
          state: null,
        },
        branchName: 'perf/sqlite-wal',
        deferCount: 1,
      },
    }),
    task({
      key: 'tailwind',
      title: 'Refactor Tailwind utility classes in Workout card',
      status: 'pending',
      priority: 'medium',
      occurredAt: at(3),
      isAllDay: true,
      project: 'api',
      tags: ['refactor', 'ui'],
      payload: { estimateMinutes: 15 },
    }),
    task({
      key: 'review',
      title: 'เตรียมสไลด์ Sprint Review',
      status: 'pending',
      priority: 'low',
      occurredAt: at(6),
      isAllDay: true,
      project: 'core',
      payload: { estimateMinutes: 90 },
    }),
    task({
      key: 'article',
      title: 'อ่านบทความ Local-First Software ของ Ink & Switch',
      status: 'pending',
      priority: 'none',
      occurredAt: null, // Inbox: ไม่มีโปรเจกต์ ไม่มีวัน
      isAllDay: true,
    }),
    task({
      key: 'receipt',
      title: 'ส่งใบเสร็จเบิกค่า Co-working space Q3',
      status: 'done',
      priority: 'low',
      occurredAt: at(0),
      isAllDay: true,
      completedAt: earlierToday(45),
    }),
    task({
      key: 'cicd',
      title: 'Setup CI/CD deployment hooks for Staging cluster',
      status: 'done',
      priority: 'high',
      occurredAt: at(-1),
      isAllDay: true,
      completedAt: at(-1, '18:20'),
      project: 'core',
      tags: ['dev'],
    }),
  ];

  // ── การเงิน (mockup 8.11.3) ─────────────────────────
  const spend = (
    title: string,
    occurredAt: Date,
    p: Partial<ExpensePayload> & { amountMinor: number },
    status: 'pending' | 'done' = 'done',
  ): DemoExpense => ({
    title,
    status,
    occurredAt,
    isAllDay: Boolean(p.isBill),
    payload: expensePayloadSchema.parse(p),
  });
  const bill = (
    title: string,
    occurredAt: Date,
    amount: number,
    category: ExpenseCategory,
    paymentMethod: ExpensePayload['paymentMethod'],
    paid: boolean,
  ) =>
    spend(
      title,
      occurredAt,
      { amountMinor: baht(amount), category, isBill: true, costType: 'fixed', paymentMethod },
      paid ? 'done' : 'pending',
    );

  const month = monthBoundsInTimeZone(now, timeZone);
  // month.end เป็น exclusive → วันสุดท้าย = วันของ 1 ms ก่อนต้นเดือนถัดไป
  const lastDay = formatInTimeZone(new Date(month.end.getTime() - 1), timeZone);
  const lastDayStart = zonedTimeToUtc(`${lastDay}T00:00:00`, timeZone);
  /** รายการ "เกิดแล้ว" ของเดือนนี้: ไม่ก่อนต้นเดือน (ไม่ไปซ้ำกับประวัติเดือนก่อน) และไม่เลย now */
  const thisMonth = (d: Date) =>
    new Date(
      Math.min(Math.max(d.getTime(), month.start.getTime() + MINUTE), now.getTime() - MINUTE),
    );
  /** บิลที่ยังไม่ถึงกำหนด: ไม่เลยวันสุดท้ายของเดือน (หน้า "บิลเดือนนี้" ต้องเห็น) */
  const dueThisMonth = (d: Date) => new Date(Math.min(d.getTime(), lastDayStart.getTime()));

  const expenses: DemoExpense[] = [
    // วันนี้ — ถอยจาก now เสมอ
    spend('Craft Specialty Coffee', earlierToday(40), {
      amountMinor: baht(145),
      category: 'food',
      merchant: 'PromptPay',
      paymentMethod: 'ewallet',
    }),
    spend('Grab ไปออฟฟิศ', earlierToday(300), {
      amountMinor: baht(189),
      category: 'transport',
      paymentMethod: 'card',
    }),
    // ย้อนหลังในสัปดาห์
    spend('BTS Skytrain (Rabbit Card)', thisMonth(at(-1, '18:15')), {
      amountMinor: baht(300),
      category: 'transport',
    }),
    spend('Gourmet Market (Siam Paragon)', thisMonth(at(-2, '20:30')), {
      amountMinor: baht(865),
      category: 'food',
      paymentMethod: 'card',
    }),
    spend('ข้าวมันไก่', thisMonth(at(-2, '12:10')), { amountMinor: baht(60), category: 'food' }),
    spend('หนังสือ Designing Data-Intensive Apps', thisMonth(at(-3, '19:00')), {
      amountMinor: baht(590),
      category: 'education',
      paymentMethod: 'card',
    }),
    spend('ชาบูกับทีม', thisMonth(at(-4, '19:30')), {
      amountMinor: baht(640),
      category: 'food',
      paymentMethod: 'card',
    }),
    spend('ค่าน้ำมัน', thisMonth(at(-6, '08:00')), {
      amountMinor: baht(1200),
      category: 'transport',
      paymentMethod: 'card',
    }),
    spend('ดูหนัง', thisMonth(at(-8, '20:00')), {
      amountMinor: baht(240),
      category: 'entertainment',
    }),
    spend('Shopee ของใช้ในบ้าน', thisMonth(at(-9, '21:00')), {
      amountMinor: baht(401),
      category: 'shopping',
      paymentMethod: 'ewallet',
    }),
    spend('ข้าวกล่องทั้งสัปดาห์', thisMonth(at(-11, '12:00')), {
      amountMinor: baht(1150),
      category: 'food',
    }),
    spend('ขายคีย์บอร์ดมือสอง', thisMonth(at(-5, '13:00')), {
      amountMinor: baht(1200),
      direction: 'income',
      paymentMethod: 'transfer',
    }),
    // บิลประจำ: จ่ายแล้ว 3 · ครบกำหนดพรุ่งนี้ 1 · อีก 5 วัน 1
    bill('AIS Fibre', thisMonth(at(-3)), 799, 'utilities', 'card', true),
    bill('GitHub Copilot', thisMonth(at(-5)), 350, 'subscription', 'card', true),
    bill('AWS Cloud Hosting', thisMonth(at(-2)), 1250, 'subscription', 'transfer', true),
    bill('ค่าส่วนกลางคอนโด', thisMonth(at(-7)), 2280, 'housing', 'transfer', true),
    bill('ค่าไฟ', dueThisMonth(at(1)), 1050, 'utilities', 'transfer', false),
    bill('ค่าน้ำ', dueThisMonth(at(5)), 180, 'utilities', 'transfer', false),
  ];

  // ประวัติ 5 เดือนก่อน — ให้กราฟแนวโน้ม/คงที่-ผันแปรมีข้อมูล · ตัวคูณคงที่ (ผลเหมือนเดิมทุกครั้ง)
  const VARIATION = [0.92, 1.15, 1.02, 1.3, 0.97];
  for (let back = 1; back <= 5; back++) {
    const [y, m] = month.period.split('-').map(Number) as [number, number];
    const index = y * 12 + (m - 1) - back;
    const ym = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
    const on = (day: number, hhmm = '12:00') =>
      zonedTimeToUtc(`${ym}-${String(day).padStart(2, '0')}T${hhmm}:00`, timeZone);
    const k = VARIATION[back - 1]!;
    expenses.push(
      spend('อาหารและเครื่องดื่ม', on(8), {
        amountMinor: baht(Math.round(3600 * k)),
        category: 'food',
      }),
      spend('เดินทาง', on(14), { amountMinor: baht(Math.round(1500 * k)), category: 'transport' }),
      spend('ช้อปปิ้ง', on(20), { amountMinor: baht(Math.round(900 * k)), category: 'shopping' }),
      bill('AIS Fibre', on(5, '00:00'), 799, 'utilities', 'card', true),
      bill('GitHub Copilot', on(12, '00:00'), 350, 'subscription', 'card', true),
      bill(
        'AWS Cloud Hosting',
        on(15, '00:00'),
        Math.round(1100 * k),
        'subscription',
        'transfer',
        true,
      ),
      bill('ค่าส่วนกลางคอนโด', on(1, '00:00'), 2280, 'housing', 'transfer', true),
      spend('เงินเดือน', on(25, '09:00'), {
        amountMinor: baht(45000),
        direction: 'income',
        paymentMethod: 'transfer',
      }),
    );
  }

  // ── รอบโฟกัสวันนี้ 2h 45m (การ์ด Focus) — ต่อกันย้อนหลังจาก now ไม่ข้ามต้นวัน ───
  const focusSessions: DemoFocusSession[] = [];
  let end = now.getTime() - 10 * MINUTE;
  for (const minutes of [75, 50, 40]) {
    const start = end - minutes * MINUTE;
    if (start < todayStart.getTime()) break; // เปิด demo ตอนเช้ามืด — มีเท่าที่มี
    focusSessions.push({
      task: 'auth',
      startedAt: new Date(start),
      endedAt: new Date(end),
      durationSeconds: minutes * 60,
    });
    end = start - 15 * MINUTE;
  }

  // เวลาที่ใช้จริงของงานต้องตรงกับรอบโฟกัส (stop จริงก็บวกเข้า actualMinutes แบบนี้)
  const focused = focusSessions.reduce((sum, f) => sum + f.durationSeconds / 60, 0);
  tasks[0]!.payload = { ...tasks[0]!.payload, actualMinutes: focused };

  return {
    projects: [
      { key: 'core', name: 'NOSION Core', color: '#1d1d1f' },
      { key: 'web', name: 'Mobile Web App', color: '#6e6e73' },
      { key: 'api', name: 'API Gateway Service', color: '#aeaeb2' },
    ],
    tags: ['dev', 'bug', 'refactor', 'ui', 'blocked'].map((name) => ({ key: name, name })),
    tasks,
    expenses,
    budgets: [
      { category: null, amountMinor: baht(15000) },
      { category: 'food', amountMinor: baht(5000) },
      { category: 'housing', amountMinor: baht(3000) },
      { category: 'transport', amountMinor: baht(2000) },
      { category: 'utilities', amountMinor: baht(1500) },
      { category: 'subscription', amountMinor: baht(2000) },
      { category: 'shopping', amountMinor: baht(2500) },
    ],
    focusSessions,
    habits: demoHabits(),
    habitDays: Array.from({ length: HABIT_HISTORY_DAYS + HABIT_AHEAD_DAYS + 1 }, (_, i) =>
      at(i - HABIT_HISTORY_DAYS),
    ),
  };
}

/** ประวัติ 15 ค่า (14 วันก่อน → วันนี้) · ชุดเดียวกับการ์ดนิสัยใน mockup: ดื่มน้ำ 5/8 · อ่านหนังสือทำแล้ว · นอนยังไม่ถึงเวลา */
function demoHabits(): DemoHabit[] {
  const habit = (title: string, payload: Partial<HabitPayload>, history: (number | null)[]) => ({
    title,
    payload: habitPayloadSchema.parse(payload),
    history,
  });
  return [
    // พลาดเมื่อ 5 วันก่อน → streak 4 วัน · วันนี้ 5/8
    habit(
      'ดื่มน้ำ',
      { kind: 'count', targetValue: 8, unit: 'แก้ว' },
      [8, 8, 6, 8, 8, 8, 8, 8, 8, 3, 8, 8, 8, 8, 5],
    ),
    // ครบทุกวัน → streak 15
    habit('อ่านหนังสือ', { kind: 'check', subtitle: 'Staff Engineer Path' }, Array(15).fill(1)),
    // ก่อนเวลา: วันนี้ยังไม่ทำ · ข้ามโดยตั้งใจ 1 วัน
    habit('นอน', { kind: 'before_time', deadlineLocalTime: '23:45' }, [
      1,
      1,
      0,
      1,
      1,
      null,
      1,
      0,
      1,
      1,
      1,
      0,
      1,
      1,
      0,
    ]),
    // 3 ครั้งต่อสัปดาห์
    habit(
      'วิ่ง',
      { kind: 'check', cadence: 'weekly', weeklyTarget: 3 },
      [1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0],
    ),
  ];
}
