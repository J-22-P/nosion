import type {
  BillDto,
  BillsUpcomingDto,
  BudgetStatusDto,
  CalendarDto,
  CalendarEventDto,
  HabitDto,
  HabitListDto,
  WeeklyReviewDto,
  ParsedEntryDto,
  ParseResultDto,
  EntryDto,
  ExpenseForecastDto,
  ExpenseSummaryDto,
  ExpensePayload,
  ExpenseTrendsDto,
  FocusTodayDto,
  StandupDto,
  TodayDto,
  ProjectDto,
  TagDto,
  TaskSidebarDto,
} from '@nosion/contracts';

/**
 * ข้อมูลชุดคงที่สำหรับ UI test (visual + a11y) — ใช้ชื่อ/ตัวเลขชุดเดียวกับ mockup (สเปก 8.11)
 * ใส่ type จาก @nosion/contracts เสมอ: DTO เปลี่ยนเมื่อไร typecheck ของ e2e จะฟ้องว่า mock ล้าสมัย
 *
 * "ตอนนี้" ของทุกเทสต์ = 30 ก.ย. 2026 15:00 เวลาไทย (ตรึงด้วย page.clock)
 */
export const NOW = new Date('2026-09-30T08:00:00.000Z');

const iso = (offsetHours: number) =>
  new Date(NOW.getTime() + offsetHours * 3_600_000).toISOString();

export const USER = {
  id: 'u_jay',
  email: 'jay@example.com',
  displayName: 'Jay',
  avatarUrl: null,
  emailVerified: iso(-240),
  isDemo: false,
};

export const SETTINGS = {
  timezone: 'Asia/Bangkok',
  locale: 'th',
  currency: 'THB',
  weekStartsOn: 1,
  theme: 'system',
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  dailyDigestEnabled: true,
  dailyDigestTime: '07:00',
  weeklyReviewEnabled: true,
  weeklyReviewDay: 1,
  enabledModules: ['task', 'expense', 'habit'] as const,
  focusGoalMinutes: 240,
};

export const PROJECTS: ProjectDto[] = [
  {
    id: 'p_core',
    name: 'NOSION Core',
    color: '#6366f1',
    icon: null,
    sortOrder: 0,
    isArchived: false,
  },
  { id: 'p_auth', name: 'auth-v2', color: '#6366f1', icon: null, sortOrder: 1, isArchived: false },
];

export const TAGS: TagDto[] = [
  { id: 't_dev', name: 'dev', color: '#94a3b8' },
  { id: 't_ui', name: 'ui', color: '#94a3b8' },
  { id: 't_bug', name: 'bug', color: '#94a3b8' },
];

const tag = (id: string) => {
  const t = TAGS.find((x) => x.id === id)!;
  return { id: t.id, name: t.name, color: t.color };
};

function entry(partial: Partial<EntryDto> & Pick<EntryDto, 'id' | 'title'>): EntryDto {
  return {
    module: 'task',
    description: null,
    status: 'pending',
    priority: 'none',
    occurredAt: null,
    isAllDay: true,
    completedAt: null,
    payload: {
      estimateMinutes: null,
      actualMinutes: 0,
      checklist: [],
      github: null,
      branchName: null,
      deferCount: 0,
    },
    projectId: null,
    parentId: null,
    recurrenceRuleId: null,
    tags: [],
    sortOrder: 0,
    version: 1,
    createdAt: iso(-72),
    updatedAt: iso(-1),
    deletedAt: null,
    ...partial,
  };
}

export const ACTIVE_TASKS: EntryDto[] = [
  entry({
    id: 'e_auth',
    title: 'Re-architect Auth Token refresh flow',
    description: 'รองรับ Multi-tenant JWT refresh token rotation พร้อม reuse detection',
    priority: 'urgent',
    // ส่งก่อน 00:00 วันนี้ (เวลาไทย) แบบมีเวลา → เลยกำหนดแล้ว ป้ายแดง "วันนี้"
    // ถ้าเป็นงานทั้งวัน (isAllDay) จะยังไม่เลยกำหนดจนจบวัน — เดิมพึ่งบั๊กที่นับงานทั้งวันว่าเลยตั้งแต่ 00:00
    occurredAt: iso(-15),
    isAllDay: false,
    projectId: 'p_core',
    tags: [tag('t_dev')],
    payload: {
      estimateMinutes: 240,
      actualMinutes: 95,
      checklist: [
        { id: 'c1', text: 'rotation', done: true },
        { id: 'c2', text: 'reuse detection', done: true },
        { id: 'c3', text: 'redis revoke', done: true },
        { id: 'c4', text: 'integration test', done: true },
        { id: 'c5', text: 'docs', done: false },
      ],
      github: { repo: 'jay/nosion', issueNumber: 42, prNumber: 104, autoCloseOnMerge: true },
      branchName: 'feat/auth-refresh',
      deferCount: 2,
    },
  }),
  entry({
    id: 'e_sqlite',
    title: 'Optimize SQLite query สำหรับ offline outbox',
    priority: 'high',
    occurredAt: iso(2),
    projectId: 'p_core',
    tags: [tag('t_dev')],
    payload: {
      estimateMinutes: 90,
      actualMinutes: 0,
      checklist: [],
      github: null,
      branchName: null,
      deferCount: 3,
    },
  }),
  entry({
    id: 'e_tailwind',
    title: 'Refactor Tailwind utility classes ให้ใช้ token ใหม่',
    priority: 'medium',
    occurredAt: iso(72),
    tags: [tag('t_ui')],
  }),
  entry({ id: 'e_adr', title: 'เขียน ADR-010 เรื่อง conflict resolution' }),
];

export const DONE_TASKS: EntryDto[] = [
  entry({
    id: 'e_ci',
    title: 'Setup CI/CD deployment hooks',
    status: 'done',
    completedAt: iso(-3),
    projectId: 'p_core',
    version: 3,
  }),
];

export const SIDEBAR: TaskSidebarDto = {
  smartLists: { all: 4, inbox: 1, today: 2, week: 2, overdue: 1 },
  projects: [
    { id: 'p_core', name: 'NOSION Core', color: '#6366f1', count: 2 },
    { id: 'p_auth', name: 'auth-v2', color: '#6366f1', count: 0 },
  ],
  topTags: [
    { id: 't_dev', name: 'dev', count: 2 },
    { id: 't_ui', name: 'ui', count: 1 },
  ],
};

export const FOCUS_TODAY: FocusTodayDto = {
  date: '2026-09-30',
  totalSeconds: 2 * 3600 + 45 * 60,
  goalMinutes: 240,
  completedSessions: 3,
  running: null,
};

// ── การเงิน (หน้า Expenses) ─────────────────────────
// ตัวเลขชุดเดียวกัน: ผลรวมหมวด = ยอดเดือน · ผลรวมบิล = fixedMonthly · NOW = 30 ก.ย. (วันสุดท้ายของเดือน)

export const BUDGET_STATUS: BudgetStatusDto = {
  period: '2026-09',
  firstDay: '2026-09-01',
  lastDay: '2026-09-30',
  currency: 'THB',
  total: {
    spentMinor: 842000,
    budgetMinor: 1500000,
    ratio: 842000 / 1500000,
    tone: 'safe',
    budgetSource: 'total',
  },
  categories: [
    { category: 'food', spentMinor: 382000, budgetMinor: 500000, ratio: 0.764, tone: 'safe' },
    { category: 'housing', spentMinor: 228000, budgetMinor: 300000, ratio: 0.76, tone: 'safe' },
    {
      category: 'transport',
      spentMinor: 174000,
      budgetMinor: 200000,
      ratio: 0.87,
      tone: 'warning',
    },
    { category: 'subscription', spentMinor: 58000, budgetMinor: null, ratio: null, tone: 'safe' },
  ],
};

/** ยอดสะสมรายวัน 1–30 ก.ย. — โตไม่เท่ากันทุกวัน (มีวันไม่ใช้เงิน) ให้เส้นดูเหมือนจริง */
const DAILY = [
  210, 0, 1040, 120, 380, 0, 0, 450, 260, 180, 920, 90, 0, 310, 640, 150, 220, 0, 380, 860, 120,
  300, 0, 250, 410, 410, 260, 0, 330, 130,
];
let running = 0;
const SERIES = DAILY.map((baht, i) => {
  running += baht * 100;
  return { date: `2026-09-${String(i + 1).padStart(2, '0')}`, cumulativeMinor: running };
});

export const FORECAST: ExpenseForecastDto = {
  period: '2026-09',
  currency: 'THB',
  asOf: '2026-09-30',
  dayOfMonth: 30,
  daysInMonth: 30,
  spentToDateMinor: running,
  projectedMinor: running + 105000,
  unpaidBillsMinor: 105000,
  budgetMinor: 1500000,
  marginMinor: 1500000 - (running + 105000),
  status: 'safe',
  series: SERIES,
};

const bill = (
  id: string,
  title: string,
  amountMinor: number,
  dueDate: string,
  paid: boolean,
  paymentMethod: BillDto['paymentMethod'],
): BillDto => ({
  id,
  title,
  amountMinor,
  currency: 'THB',
  dueDate,
  paid,
  paymentMethod,
  daysUntilDue: paid ? null : 0,
  version: 1,
});

export const BILLS: BillsUpcomingDto = {
  currency: 'THB',
  fixedMonthlyMinor: 79900 + 125000 + 35000 + 105000,
  bills: [
    bill('b_ais', 'AIS Fibre', 79900, '2026-09-05', true, 'card'),
    bill('b_copilot', 'GitHub Copilot', 35000, '2026-09-12', true, 'card'),
    bill('b_aws', 'AWS', 125000, '2026-09-15', true, 'transfer'),
    bill('b_power', 'ค่าไฟ', 105000, '2026-09-30', false, 'transfer'),
  ],
  dueSoonCount: 1,
  overdueCount: 0,
};

export const TRENDS: ExpenseTrendsDto = {
  currency: 'THB',
  points: [
    ['2026-04', 910000],
    ['2026-05', 1120000],
    ['2026-06', 980000],
    ['2026-07', 1340000],
    ['2026-08', 1050000],
    ['2026-09', 842000],
  ].map(([period, expenseMinor], i) => ({
    period: period as string,
    expenseMinor: expenseMinor as number,
    // เงินเดือนคงที่ + รายได้เสริมบางเดือน — เส้นรายรับไม่แบนเรียบจนดูปลอม
    incomeMinor: 4500000 + [0, 120000, 0, 350000, 80000, 120000][i]!,
    fixedMinor: 344900,
    variableMinor: (expenseMinor as number) - 344900,
    byCategory: {},
  })),
};

const expense = (
  id: string,
  title: string,
  hoursAgo: number,
  payload: Partial<ExpensePayload> & { amountMinor: number },
): EntryDto =>
  entry({
    id,
    title,
    module: 'expense',
    status: 'done',
    occurredAt: iso(-hoursAgo),
    isAllDay: false,
    payload: {
      currency: 'THB',
      direction: 'expense',
      category: 'other',
      costType: 'variable',
      merchant: null,
      paymentMethod: 'cash',
      isBill: false,
      note: null,
      ...payload,
    },
  });

export const EXPENSES: EntryDto[] = [
  expense('x1', 'Craft Specialty Coffee', 1, {
    amountMinor: 14500,
    category: 'food',
    paymentMethod: 'ewallet',
    merchant: 'PromptPay',
  }),
  expense('x2', 'Grab ไปออฟฟิศ', 6, {
    amountMinor: 18900,
    category: 'transport',
    paymentMethod: 'card',
  }),
  expense('x3', 'ข้าวมันไก่', 26, { amountMinor: 6000, category: 'food' }),
  expense('x4', 'หนังสือ Clean Architecture', 30, {
    amountMinor: 59000,
    category: 'education',
    paymentMethod: 'card',
  }),
  expense('x5', 'ขายคีย์บอร์ดมือสอง', 50, {
    amountMinor: 120000,
    direction: 'income',
    paymentMethod: 'transfer',
  }),
  expense('x6', 'BTS', 54, { amountMinor: 4700, category: 'transport' }),
];

// ── หน้า Today ──────────────────────────────────────
// ตัวเลขผูกกับชุดด้านบน: ใช้วันนี้ = x1 + x2 (฿145 + ฿189) · เดือน/งบ = BUDGET_STATUS · บิลถัดไป = ค่าไฟ (BILLS)
const TODAY_SPENT = EXPENSES.filter((e) => ['x1', 'x2'].includes(e.id)).reduce(
  (sum, e) => sum + (e.payload as { amountMinor: number }).amountMinor,
  0,
);

export const TODAY: TodayDto = {
  date: '2026-09-30',
  timezone: 'Asia/Bangkok',
  greeting: 'สวัสดีตอนบ่าย Jay',
  widgets: [
    {
      module: 'task',
      title: 'งานวันนี้',
      order: 10,
      headline: 'งานวันนี้ 3 ชิ้น · เลยกำหนด 1',
      subline: 'เสร็จแล้ว 1/3',
      progress: { done: 1, total: 3 },
      actions: [{ label: 'สร้าง standup', href: '/today?standup=1' }],
      data: { overdueCount: 1 },
      isEmpty: false,
      // ค้างอยู่ก่อน แล้วตามด้วยที่เสร็จวันนี้ (API ส่งแบบนี้ — task.trackable.ts)
      items: [
        ...ACTIVE_TASKS.slice(0, 2).map((t, i) => ({
          entryId: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          occurredAt: t.occurredAt,
          ...(i === 0 ? { detail: 'เลยกำหนด' } : {}),
        })),
        {
          entryId: DONE_TASKS[0]!.id,
          title: DONE_TASKS[0]!.title,
          status: 'done' as const,
          priority: DONE_TASKS[0]!.priority,
          occurredAt: DONE_TASKS[0]!.occurredAt,
        },
      ],
    },
    {
      module: 'expense',
      title: 'การเงินและงบประมาณ',
      order: 20,
      headline: 'วันนี้ใช้ ฿334 · เดือนนี้ ฿8,420 / ฿15,000',
      subline: 'ค่าไฟ ครบกำหนดวันนี้',
      progress: { done: BUDGET_STATUS.total.spentMinor, total: BUDGET_STATUS.total.budgetMinor },
      alerts: [
        { level: 'warning', message: 'หมวดเดินทางใช้ไป 87% ของงบแล้ว' },
        { level: 'info', message: 'ค่าไฟ ฿1,050.00 ครบกำหนดวันนี้' },
      ],
      isEmpty: false,
      // รายการวันนี้ = x1 + x2 ชุดเดียวกับยอด TODAY_SPENT
      items: EXPENSES.filter((e) => ['x1', 'x2'].includes(e.id)).map((e) => ({
        entryId: e.id,
        title: e.title,
        status: e.status,
        occurredAt: e.occurredAt,
        detail: `−฿${((e.payload as { amountMinor: number }).amountMinor / 100).toFixed(2)}`,
      })),
      data: {
        currency: 'THB',
        todaySpentMinor: TODAY_SPENT,
        monthSpentMinor: BUDGET_STATUS.total.spentMinor,
        budgetMinor: BUDGET_STATUS.total.budgetMinor,
        budgetTone: BUDGET_STATUS.total.tone,
        nextBill: BILLS.bills.find((b) => !b.paid) ?? null,
      },
    },
    {
      module: 'habit',
      title: 'นิสัย',
      order: 30,
      headline: 'ทำแล้ว 1 จาก 3',
      progress: { done: 1, total: 3 },
      items: [],
      isEmpty: false,
      emptyCta: { label: 'สร้างนิสัยแรก', href: '/habits?new=1' },
      data: {
        habits: [
          {
            entryId: 'h_water',
            version: 2,
            title: 'ดื่มน้ำ',
            subtitle: null,
            kind: 'count',
            currentValue: 5,
            targetValue: 8,
            unit: 'แก้ว',
            deadlineLocalTime: null,
            done: false,
            completedAt: null,
          },
          {
            entryId: 'h_read',
            version: 3,
            title: 'อ่านหนังสือ',
            subtitle: 'Staff Engineer Path',
            kind: 'check',
            currentValue: 1,
            targetValue: 1,
            unit: 'ครั้ง',
            deadlineLocalTime: null,
            done: true,
            completedAt: '2026-09-30T01:10:00.000Z',
          },
          {
            entryId: 'h_sleep',
            version: 1,
            title: 'นอน',
            subtitle: null,
            kind: 'before_time',
            currentValue: 0,
            targetValue: 1,
            unit: 'ครั้ง',
            deadlineLocalTime: '23:45',
            done: false,
            completedAt: null,
          },
        ],
      },
    },
  ],
  failedModules: [],
};

export const STANDUP: StandupDto = {
  date: '2026-09-30',
  done: [{ id: DONE_TASKS[0]!.id, title: DONE_TASKS[0]!.title }],
  doing: ACTIVE_TASKS.slice(0, 2).map((t) => ({ id: t.id, title: t.title })),
  blocked: [],
  markdown: [
    '## Standup · 2026-09-30',
    `**Done**\n- ${DONE_TASKS[0]!.title}`,
    `**Doing**\n${ACTIVE_TASKS.slice(0, 2)
      .map((t) => `- ${t.title}`)
      .join('\n')}`,
    '**Blocked**\n- ไม่มี',
  ].join('\n\n'),
};

/** สรุปเดือน ก.ย. — หมวดชุดเดียวกับ BUDGET_STATUS (รวม = ฿8,420) · fixed/variable ตรงกับจุดสุดท้ายของ TRENDS */
export const SUMMARY: ExpenseSummaryDto = {
  period: '2026-09',
  currency: 'THB',
  expenseMinor: BUDGET_STATUS.total.spentMinor,
  incomeMinor: TRENDS.points.at(-1)!.incomeMinor,
  netMinor: TRENDS.points.at(-1)!.incomeMinor - BUDGET_STATUS.total.spentMinor,
  fixedMinor: TRENDS.points.at(-1)!.fixedMinor,
  variableMinor: TRENDS.points.at(-1)!.variableMinor,
  count: 46,
  byCategory: BUDGET_STATUS.categories.map((c) => ({
    category: c.category,
    amountMinor: c.spentMinor,
    count: 1,
    share: c.spentMinor / BUDGET_STATUS.total.spentMinor,
  })),
};

// ── ปฏิทิน (สเปก 8.11.4) — "วันนี้" = พุธ 30 ก.ย. · งานหลายรายการในวันเดียวให้เห็น "+N" · บิลมีการเตือน · รอบ projected 1 รายการ
type CalEvent = Omit<CalendarEventDto, 'color' | 'end' | 'meta' | 'version'> & {
  meta?: Record<string, unknown>;
};
const calEvent = (e: CalEvent): CalendarEventDto => ({
  color: '#000',
  end: null,
  version: e.projected ? null : 3,
  ...e,
  meta: e.meta ?? {},
});
const TICK = [{ kind: 'complete' as const, label: 'ทำเสร็จ', presentation: 'checkbox' as const }];
const PAY = [{ kind: 'complete' as const, label: 'จ่ายแล้ว', presentation: 'button' as const }];
const calBill = (amountMinor: number) => ({ amountMinor, currency: 'THB', badge: 'ครบกำหนด' });

const CALENDAR_EVENTS: CalendarEventDto[] = [
  calEvent({
    id: 'c1',
    entryId: 't_c1',
    ruleId: null,
    module: 'task',
    title: 'Sprint review W39',
    start: '2026-09-28T07:00:00.000Z',
    allDay: false,
    date: '2026-09-28',
    status: 'done',
    projected: false,
    hasReminder: false,
    actions: [],
  }),
  calEvent({
    id: 'c2',
    entryId: 't_c2',
    ruleId: null,
    module: 'task',
    title: 'Review PR #142',
    start: '2026-09-29T03:00:00.000Z',
    allDay: false,
    date: '2026-09-29',
    status: 'done',
    projected: false,
    hasReminder: false,
    actions: [],
  }),
  calEvent({
    id: 'c3',
    entryId: 'e_ais',
    ruleId: 'r_ais',
    module: 'expense',
    title: 'AIS Fibre · ฿799.00',
    start: '2026-09-29T17:00:00.000Z',
    allDay: true,
    date: '2026-09-30',
    status: 'pending',
    projected: false,
    hasReminder: true,
    actions: PAY,
    meta: { ...calBill(79900), deepLink: '/expenses?entry=e_ais' },
  }),
  calEvent({
    id: 'c4',
    entryId: 't_c4',
    ruleId: null,
    module: 'task',
    title: 'Fix login redirect bug',
    start: '2026-09-30T03:00:00.000Z',
    allDay: false,
    date: '2026-09-30',
    status: 'pending',
    projected: false,
    hasReminder: true,
    actions: TICK,
    meta: { priority: 'high' },
  }),
  calEvent({
    id: 'c5',
    entryId: 't_c5',
    ruleId: null,
    module: 'task',
    title: 'Update API docs',
    start: '2026-09-30T07:30:00.000Z',
    allDay: false,
    date: '2026-09-30',
    status: 'pending',
    projected: false,
    hasReminder: false,
    actions: TICK,
  }),
  calEvent({
    id: 'c6',
    entryId: 't_c6',
    ruleId: 'r_standup',
    module: 'task',
    title: 'Daily standup notes',
    start: '2026-09-30T10:00:00.000Z',
    allDay: false,
    date: '2026-09-30',
    status: 'pending',
    projected: false,
    hasReminder: false,
    actions: TICK,
  }),
  calEvent({
    id: 'c7',
    entryId: 't_c7',
    ruleId: null,
    module: 'task',
    title: 'Sprint planning',
    start: '2026-10-01T07:00:00.000Z',
    allDay: false,
    date: '2026-10-01',
    status: 'pending',
    projected: false,
    hasReminder: false,
    actions: TICK,
  }),
  calEvent({
    id: 'c8',
    entryId: 'e_true',
    ruleId: 'r_true',
    module: 'expense',
    title: 'TrueMove H · ฿599.00',
    start: '2026-10-04T17:00:00.000Z',
    allDay: true,
    date: '2026-10-05',
    status: 'pending',
    projected: false,
    hasReminder: true,
    actions: PAY,
    meta: calBill(59900),
  }),
  calEvent({
    id: 'c9',
    entryId: 't_c9',
    ruleId: null,
    module: 'task',
    title: 'ส่งรายงานไตรมาส',
    start: '2026-10-08T17:00:00.000Z',
    allDay: true,
    date: '2026-10-09',
    status: 'pending',
    projected: false,
    hasReminder: false,
    actions: TICK,
  }),
  calEvent({
    id: 'c10',
    entryId: null,
    ruleId: 'r_netflix',
    module: 'expense',
    title: 'Netflix · ฿419.00',
    start: '2026-10-24T17:00:00.000Z',
    allDay: true,
    date: '2026-10-25',
    status: 'pending',
    projected: true,
    hasReminder: false,
    actions: [],
    meta: calBill(41900),
  }),
];

/** GET /calendar — กรองตามช่วงที่ขอ เหมือน API จริง */
export function calendarFor(from: string, to: string): CalendarDto {
  const events = CALENDAR_EVENTS.filter((e) => e.date >= from && e.date <= to);
  return {
    from,
    to,
    timezone: 'Asia/Bangkok',
    events,
    countsByModule: {
      task: events.filter((e) => e.module === 'task').length,
      expense: events.filter((e) => e.module === 'expense').length,
    },
    reminders: [
      {
        entryId: 'e_ais',
        date: '2026-09-29',
        fireAt: '2026-09-29T02:00:00.000Z',
        channel: 'push' as const,
        status: 'sent' as const,
      },
      {
        entryId: 't_c4',
        date: '2026-09-30',
        fireAt: '2026-09-30T03:00:00.000Z',
        channel: 'push' as const,
        status: 'sent' as const,
      },
      {
        entryId: 'e_true',
        date: '2026-10-04',
        fireAt: '2026-10-04T02:00:00.000Z',
        channel: 'push' as const,
        status: 'scheduled' as const,
      },
    ].filter((r) => r.date >= from && r.date <= to),
  };
}

export const CALENDAR_FEED = {
  url: 'https://api.nosion.test/api/v1/calendar/test-feed-token-abcdefghijk.ics',
  webcalUrl: 'webcal://api.nosion.test/api/v1/calendar/test-feed-token-abcdefghijk.ics',
};

// ── ⌘K /parse (สเปก 8.3) — คำตอบตามข้อความ: บิล (DoD) · รายจ่าย + ทางเลือกงาน · งาน ──
const parsedTask = (title: string, confidence: number): ParsedEntryDto => ({
  module: 'task',
  title,
  occurredAt: null,
  isAllDay: true,
  priority: 'none',
  status: 'pending',
  payload: { estimateMinutes: null },
  rrule: null,
  reminders: [],
  confidence,
  matchedTokens: [],
});

export function parseFor(text: string): ParseResultDto {
  if (text.includes('ค่าเน็ต')) {
    return {
      best: {
        module: 'expense',
        title: 'ค่าเน็ต',
        occurredAt: '2026-10-04T17:00:00.000Z',
        isAllDay: true,
        priority: 'none',
        status: 'pending',
        payload: { amountMinor: 79900, currency: 'THB', category: 'utilities', isBill: true },
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=5',
        reminders: [{ channel: 'push', offsetMinutes: -900 }],
        confidence: 0.95,
        matchedTokens: ['799', 'ค่าเน็ต', 'ทุกวันที่ 5'],
      },
      alternatives: [parsedTask('ค่าเน็ต 799', 0.25)],
      tags: [],
      project: null,
      tokens: [],
    };
  }
  if (/\d/.test(text)) {
    return {
      best: {
        module: 'expense',
        title: 'กาแฟ',
        occurredAt: NOW.toISOString(),
        isAllDay: false,
        priority: 'none',
        status: 'done',
        payload: { amountMinor: 6500, currency: 'THB', category: 'food' },
        rrule: null,
        reminders: [],
        confidence: 0.9,
        matchedTokens: ['65', 'กาแฟ'],
      },
      alternatives: [parsedTask(text, 0.25)],
      tags: [],
      project: null,
      tokens: [],
    };
  }
  return { best: parsedTask(text, 0.5), alternatives: [], tags: [], project: null, tokens: [] };
}

// ── นิสัย (Phase 6) — วันนี้ = 30 ก.ย. · นับจำนวน / ติ๊ก / ก่อนเวลา / รายสัปดาห์ ──
const last7 = (states: HabitDto['last7'][number]['state'][]) =>
  states.map((state, i) => ({ date: `2026-09-${String(24 + i).padStart(2, '0')}`, state }));

export const HABITS: HabitListDto = {
  date: '2026-09-30',
  timezone: 'Asia/Bangkok',
  habits: [
    {
      ruleId: 'r_water',
      title: 'ดื่มน้ำ',
      kind: 'count',
      targetValue: 8,
      unit: 'แก้ว',
      deadlineLocalTime: null,
      subtitle: null,
      cadence: 'daily',
      weeklyTarget: null,
      isPaused: false,
      today: {
        entryId: 'h_water',
        currentValue: 5,
        status: 'pending',
        completedAt: null,
        version: 2,
      },
      streak: { current: 4, longest: 12, unit: 'day' },
      last7: last7(['missed', 'done', 'done', 'done', 'done', 'done', 'pending']),
      weekProgress: null,
    },
    {
      ruleId: 'r_read',
      title: 'อ่านหนังสือ',
      kind: 'check',
      targetValue: 1,
      unit: 'ครั้ง',
      deadlineLocalTime: null,
      subtitle: 'Staff Engineer Path',
      cadence: 'daily',
      weeklyTarget: null,
      isPaused: false,
      today: {
        entryId: 'h_read',
        currentValue: 1,
        status: 'done',
        completedAt: '2026-09-30T01:10:00.000Z',
        version: 3,
      },
      streak: { current: 12, longest: 12, unit: 'day' },
      last7: last7(['done', 'done', 'done', 'done', 'done', 'done', 'done']),
      weekProgress: null,
    },
    {
      ruleId: 'r_sleep',
      title: 'นอน',
      kind: 'before_time',
      targetValue: 1,
      unit: 'ครั้ง',
      deadlineLocalTime: '23:45',
      subtitle: null,
      cadence: 'daily',
      weeklyTarget: null,
      isPaused: false,
      today: {
        entryId: 'h_sleep',
        currentValue: 0,
        status: 'pending',
        completedAt: null,
        version: 1,
      },
      streak: { current: 0, longest: 3, unit: 'day' },
      last7: last7(['done', 'skipped', 'missed', 'done', 'missed', 'none', 'pending']),
      weekProgress: null,
    },
    {
      ruleId: 'r_run',
      title: 'วิ่ง',
      kind: 'check',
      targetValue: 1,
      unit: 'ครั้ง',
      deadlineLocalTime: null,
      subtitle: null,
      cadence: 'weekly',
      weeklyTarget: 3,
      isPaused: false,
      today: {
        entryId: 'h_run',
        currentValue: 0,
        status: 'pending',
        completedAt: null,
        version: 1,
      },
      streak: { current: 2, longest: 5, unit: 'week' },
      last7: last7(['done', 'missed', 'done', 'missed', 'missed', 'missed', 'pending']),
      weekProgress: { done: 1, target: 3 },
    },
  ],
};

// ── สรุปสัปดาห์ (Phase 6) — ส่วนของแต่ละโมดูลมาจาก summarizeWeek() ──
export function reviewFor(week: string | null): WeeklyReviewDto {
  const current = !week || week === '2026-W40';
  return {
    week: week ?? '2026-W40',
    from: current ? '2026-09-28' : '2026-09-21',
    to: current ? '2026-10-04' : '2026-09-27',
    timezone: 'Asia/Bangkok',
    previousWeek: current ? '2026-W39' : '2026-W38',
    nextWeek: current ? '2026-W41' : '2026-W40',
    failedModules: [],
    sections: [
      {
        module: 'task',
        title: 'งาน',
        order: 10,
        stats: [
          { label: 'ทำเสร็จ', value: current ? '6/9' : '4/7' },
          { label: 'เวลาที่ประเมิน', value: '12 ชม.' },
          { label: 'เวลาที่ใช้จริง', value: '14 ชม.' },
        ],
        highlights: [
          'ปิดงานได้ 6 รายการ',
          'งานที่ผัดบ่อยที่สุด: "Sync สถาปัตยกรรม Local-First" (3 ครั้ง)',
        ],
      },
      {
        module: 'expense',
        title: 'การเงิน',
        order: 20,
        stats: [
          { label: 'รายจ่าย', value: '฿3,820' },
          { label: 'รายรับ', value: '฿0' },
          { label: 'จำนวนรายการ', value: '14' },
        ],
        highlights: ['ใช้กับอาหารมากที่สุด ฿1,640 (43%)'],
      },
      {
        module: 'habit',
        title: 'นิสัย',
        order: 30,
        stats: [
          { label: 'ทำสำเร็จ', value: '11/14' },
          { label: 'อัตราความสำเร็จ', value: '79%' },
          { label: 'จำนวนนิสัย', value: '4' },
        ],
        highlights: ['ทำสม่ำเสมอที่สุด: อ่านหนังสือ (3/3)', 'ควรใส่ใจ: นอน (1/3)'],
      },
    ],
  };
}
