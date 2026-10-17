import type { EntryStatus, TaskPayload } from '@nosion/contracts';
import { formatInTimeZone } from '@nosion/core';

/**
 * ส่วนของ issue ที่ใช้ — รูปเดียวกับ REST (`GET /issues` · webhook event `issues`)
 * ดึงด้วย GraphQL แล้วแปลงมาเป็นรูปนี้ (ดู github-search.ts)
 */
export interface GitHubIssue {
  node_id: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  body?: string | null;
  milestone?: { due_on: string | null } | null;
  /** มี = เป็น PR (GitHub ถือ PR เป็น issue ชนิดหนึ่ง) */
  pull_request?: unknown;
  /** https://api.github.com/repos/<owner>/<name> */
  repository_url: string;
  assignees?: Array<{ login: string }> | null;
  closed_at?: string | null;
  /** วันจากช่องวันที่ของ GitHub Project (YYYY-MM-DD) — มีเมื่อดึงด้วย GraphQL และได้สิทธิ์ `read:project` */
  project_due_on?: string | null;
}

/** งานที่มีอยู่แล้วใน NOSION (เฉพาะ field ที่ใช้ตัดสิน) */
export interface SyncedTask {
  id: string;
  version: number;
  title: string;
  status: EntryStatus;
  deleted: boolean;
  /** มีวันในปฏิทินแล้ว (ผู้ใช้ตั้งเองหรือมาจาก GitHub) */
  hasDate: boolean;
  github: TaskPayload['github'];
}

export interface TaskFields {
  title: string;
  description: string;
  /** YYYY-MM-DD (ทั้งวัน) · null = ไม่มีกำหนด */
  occurredAt: string | null;
  /** วันที่ปิดบน GitHub (ISO) — issue ที่ปิดแล้ว */
  completedAt: string | null;
  github: NonNullable<TaskPayload['github']>;
}

export type IssuePlan =
  | { kind: 'create'; fields: TaskFields; completes: boolean }
  | {
      kind: 'update';
      id: string;
      version: number;
      patch: { title?: string; occurredAt?: string; status?: EntryStatus };
      github: NonNullable<TaskPayload['github']>;
      completes: boolean;
      completedAt: string | null;
    }
  | { kind: 'skip'; reason: 'deleted-by-user' | 'unchanged' };

/** clientId ของงานที่มาจาก issue — unique ต่อผู้ใช้ จึงกันสร้างซ้ำได้ทั้งตอนดึงและตอน webhook มาพร้อมกัน */
export function issueClientId(issue: Pick<GitHubIssue, 'node_id'>): string {
  return `gh:${issue.node_id}`.slice(0, 64);
}

export function repoFullName(issue: Pick<GitHubIssue, 'repository_url'>): string {
  return issue.repository_url.replace(/^https:\/\/api\.github\.com\/repos\//, '');
}

const DESCRIPTION_LIMIT = 4_000;
const DEFAULT_TIME_ZONE = 'Asia/Bangkok';

/**
 * issue → ค่าของงาน · issue ของ GitHub ไม่มี due date ในตัว — วันในปฏิทินมาจาก (ตามลำดับ):
 *  1. ช่องวันที่ของ GitHub Project (End/Due Date ก่อน Start Date) — ทีมส่วนใหญ่วางแผนด้วย Project ไม่ใช่ milestone
 *  2. milestone due
 *  3. issue ที่ปิดแล้ว = วันที่ปิด (ตามโซนผู้ใช้) — งานเก่าขึ้นปฏิทินในวันที่ทำเสร็จจริง
 * issue ที่เปิดอยู่และไม่มีวันเลย = งานไม่มีกำหนด (ไม่เดาวัน)
 */
export function taskFieldsFor(issue: GitHubIssue, timeZone = DEFAULT_TIME_ZONE): TaskFields {
  const repo = repoFullName(issue);
  const isPr = Boolean(issue.pull_request);
  const milestoneDue = issue.milestone?.due_on ?? null;
  // milestone ของ GitHub เก็บเป็นวัน (เวลาในค่าไม่มีความหมาย) → เอาเฉพาะวันที่
  const due = issue.project_due_on ?? (milestoneDue ? milestoneDue.slice(0, 10) : null);
  const closedAt = issue.state === 'closed' ? (issue.closed_at ?? null) : null;
  const body = issue.body?.trim() ?? '';
  return {
    title: issue.title.slice(0, 200),
    description: [
      `${isPr ? 'PR' : 'Issue'} [${repo}#${issue.number}](${issue.html_url})`,
      body.length > DESCRIPTION_LIMIT ? `${body.slice(0, DESCRIPTION_LIMIT)}…` : body,
    ]
      .filter(Boolean)
      .join('\n\n'),
    occurredAt: due ?? (closedAt ? formatInTimeZone(new Date(closedAt), timeZone) : null),
    completedAt: closedAt,
    github: {
      repo,
      issueNumber: isPr ? null : issue.number,
      prNumber: isPr ? issue.number : null,
      autoCloseOnMerge: true,
      url: issue.html_url,
      milestoneDueOn: milestoneDue,
      dueOn: due,
      state: issue.state,
    },
  };
}

/** วันกำหนดที่ซิงก์ครั้งก่อน — งานที่ซิงก์ก่อนมีช่อง dueOn ใช้ milestoneDueOn */
function syncedDue(github: TaskPayload['github']): string | null {
  return github?.dueOn ?? (github?.milestoneDueOn ? github.milestoneDueOn.slice(0, 10) : null);
}

/**
 * ตัดสินว่า issue หนึ่งตัวต้องทำอะไรกับงาน — GitHub เป็นเจ้าของชื่อ/สถานะ/วัน ตาม "การเปลี่ยนแปลง" เท่านั้น:
 *  • ปิด/เปิดงานเมื่อ state บน GitHub **เปลี่ยน** จากที่ซิงก์ครั้งก่อน — ผู้ใช้ติ๊กเสร็จใน NOSION เองแล้ว issue ยังเปิด ไม่ถูกเปิดกลับ
 *  • วันที่เขียนทับเมื่อวันกำหนดบน GitHub **เปลี่ยน** — ผู้ใช้เลื่อนวันเองใน NOSION ไม่ถูกดึงกลับทุกครั้งที่ซิงก์ · ลบวันบน GitHub ไม่ลบวัน
 *  • ผู้ใช้ลบงาน = ไม่อยากเห็น → ไม่สร้างใหม่
 *  • issue ที่ปิดไปแล้วก่อนเคยดึง → สร้างเป็นงานที่เสร็จแล้ว (ประวัติงานเก่าขึ้นปฏิทินในวันที่ปิด)
 */
export function planIssue(
  issue: GitHubIssue,
  existing: SyncedTask | null,
  timeZone = DEFAULT_TIME_ZONE,
): IssuePlan {
  const fields = taskFieldsFor(issue, timeZone);
  if (!existing) return { kind: 'create', fields, completes: issue.state === 'closed' };
  if (existing.deleted) return { kind: 'skip', reason: 'deleted-by-user' };

  const before = existing.github;
  const patch: { title?: string; occurredAt?: string; status?: EntryStatus } = {};
  if (existing.title !== fields.title) patch.title = fields.title;
  const due = fields.github.dueOn;
  if (due && due !== syncedDue(before)) patch.occurredAt = due;

  const stateChanged = (before?.state ?? 'open') !== issue.state;
  let completes = false;
  if (stateChanged && issue.state === 'closed' && existing.status !== 'done') {
    completes = true;
    // ปิดแล้วแต่ไม่เคยมีวัน → ลงปฏิทินในวันที่ปิด
    if (!existing.hasDate && !patch.occurredAt && fields.occurredAt) {
      patch.occurredAt = fields.occurredAt;
    }
  } else if (stateChanged && issue.state === 'open' && existing.status === 'done') {
    patch.status = 'pending';
  }

  const githubChanged =
    before?.state !== fields.github.state ||
    syncedDue(before) !== due ||
    (before?.milestoneDueOn ?? null) !== fields.github.milestoneDueOn ||
    before?.url !== fields.github.url;

  if (!completes && Object.keys(patch).length === 0 && !githubChanged) {
    return { kind: 'skip', reason: 'unchanged' };
  }
  return {
    kind: 'update',
    id: existing.id,
    version: existing.version,
    patch,
    github: { ...fields.github, autoCloseOnMerge: before?.autoCloseOnMerge ?? true },
    completes,
    completedAt: fields.completedAt,
  };
}
