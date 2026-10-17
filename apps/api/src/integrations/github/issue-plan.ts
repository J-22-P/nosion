import type { EntryStatus, TaskPayload } from '@nosion/contracts';

/** ส่วนของ issue ที่ใช้ — รูปเดียวกันทั้ง REST `GET /issues` และ webhook event `issues` */
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
}

/** งานที่มีอยู่แล้วใน NOSION (เฉพาะ field ที่ใช้ตัดสิน) */
export interface SyncedTask {
  id: string;
  version: number;
  title: string;
  status: EntryStatus;
  deleted: boolean;
  github: TaskPayload['github'];
}

export interface TaskFields {
  title: string;
  description: string;
  /** YYYY-MM-DD (ทั้งวัน) จาก milestone · null = ไม่มีกำหนด */
  occurredAt: string | null;
  github: NonNullable<TaskPayload['github']>;
}

export type IssuePlan =
  | { kind: 'create'; fields: TaskFields }
  | {
      kind: 'update';
      id: string;
      version: number;
      patch: { title?: string; occurredAt?: string; status?: EntryStatus };
      github: NonNullable<TaskPayload['github']>;
      completes: boolean;
    }
  | { kind: 'skip'; reason: 'closed-before-import' | 'deleted-by-user' | 'unchanged' };

/** clientId ของงานที่มาจาก issue — unique ต่อผู้ใช้ จึงกันสร้างซ้ำได้ทั้งตอนดึงและตอน webhook มาพร้อมกัน */
export function issueClientId(issue: Pick<GitHubIssue, 'node_id'>): string {
  return `gh:${issue.node_id}`.slice(0, 64);
}

export function repoFullName(issue: Pick<GitHubIssue, 'repository_url'>): string {
  return issue.repository_url.replace(/^https:\/\/api\.github\.com\/repos\//, '');
}

const DESCRIPTION_LIMIT = 4_000;

/** issue → ค่าของงาน · วันที่มาจาก milestone (issue ของ GitHub ไม่มี due date ในตัว) */
export function taskFieldsFor(issue: GitHubIssue): TaskFields {
  const repo = repoFullName(issue);
  const isPr = Boolean(issue.pull_request);
  const due = issue.milestone?.due_on ?? null;
  const body = issue.body?.trim() ?? '';
  return {
    title: issue.title.slice(0, 200),
    description: [
      `${isPr ? 'PR' : 'Issue'} [${repo}#${issue.number}](${issue.html_url})`,
      body.length > DESCRIPTION_LIMIT ? `${body.slice(0, DESCRIPTION_LIMIT)}…` : body,
    ]
      .filter(Boolean)
      .join('\n\n'),
    // milestone ของ GitHub เก็บเป็นวัน (เวลาในค่าไม่มีความหมาย) → เอาเฉพาะวันที่
    occurredAt: due ? due.slice(0, 10) : null,
    github: {
      repo,
      issueNumber: isPr ? null : issue.number,
      prNumber: isPr ? issue.number : null,
      autoCloseOnMerge: true,
      url: issue.html_url,
      milestoneDueOn: due,
      state: issue.state,
    },
  };
}

/**
 * ตัดสินว่า issue หนึ่งตัวต้องทำอะไรกับงาน — GitHub เป็นเจ้าของชื่อ/สถานะ/วัน (milestone) ตาม "การเปลี่ยนแปลง" เท่านั้น:
 *  • ปิด/เปิดงานเมื่อ state บน GitHub **เปลี่ยน** จากที่ซิงก์ครั้งก่อน — ผู้ใช้ติ๊กเสร็จใน NOSION เองแล้ว issue ยังเปิด ไม่ถูกเปิดกลับ
 *  • วันที่เขียนทับเมื่อ milestone due **เปลี่ยน** — ผู้ใช้เลื่อนวันเองใน NOSION ไม่ถูกดึงกลับทุกครั้งที่ซิงก์ · ลบ milestone ไม่ลบวัน
 *  • ผู้ใช้ลบงาน = ไม่อยากเห็น → ไม่สร้างใหม่
 *  • issue ที่ปิดไปแล้วก่อนเคยดึง → ไม่ต้องสร้าง (ไม่ใช่งานที่ต้องทำ)
 */
export function planIssue(issue: GitHubIssue, existing: SyncedTask | null): IssuePlan {
  const fields = taskFieldsFor(issue);
  if (!existing) {
    return issue.state === 'closed'
      ? { kind: 'skip', reason: 'closed-before-import' }
      : { kind: 'create', fields };
  }
  if (existing.deleted) return { kind: 'skip', reason: 'deleted-by-user' };

  const before = existing.github;
  const patch: { title?: string; occurredAt?: string; status?: EntryStatus } = {};
  if (existing.title !== fields.title) patch.title = fields.title;
  if (fields.occurredAt && fields.github.milestoneDueOn !== (before?.milestoneDueOn ?? null)) {
    patch.occurredAt = fields.occurredAt;
  }

  const stateChanged = (before?.state ?? 'open') !== issue.state;
  let completes = false;
  if (stateChanged && issue.state === 'closed' && existing.status !== 'done') {
    completes = true;
  } else if (stateChanged && issue.state === 'open' && existing.status === 'done') {
    patch.status = 'pending';
  }

  const githubChanged =
    before?.state !== fields.github.state ||
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
  };
}
