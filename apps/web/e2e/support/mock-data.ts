import type {
  BillDto,
  BillsUpcomingDto,
  BudgetStatusDto,
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
  enabledModules: ['task', 'expense'] as const,
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
