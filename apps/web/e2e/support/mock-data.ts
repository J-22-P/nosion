import type {
  EntryDto,
  FocusTodayDto,
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
    occurredAt: iso(-15), // เลยกำหนดตั้งแต่เมื่อวาน
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
