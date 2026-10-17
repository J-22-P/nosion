import { describe, expect, it } from 'vitest';
import {
  issueClientId,
  planIssue,
  taskFieldsFor,
  type GitHubIssue,
  type SyncedTask,
} from './issue-plan';

const issue = (over: Partial<GitHubIssue> = {}): GitHubIssue => ({
  node_id: 'I_kwDOAbc123',
  number: 42,
  title: 'แก้ token refresh',
  state: 'open',
  html_url: 'https://github.com/jay/nosion/issues/42',
  body: 'รายละเอียด',
  milestone: { due_on: '2026-10-20T07:00:00Z' },
  repository_url: 'https://api.github.com/repos/jay/nosion',
  ...over,
});

const synced = (over: Partial<SyncedTask> = {}): SyncedTask => ({
  id: 'e1',
  version: 3,
  title: 'แก้ token refresh',
  status: 'pending',
  deleted: false,
  github: { ...taskFieldsFor(issue()).github },
  ...over,
});

describe('taskFieldsFor', () => {
  it('issue → งาน: ชื่อ · ลิงก์ในคำอธิบาย · วันจาก milestone (ทั้งวัน) · ข้อมูล GitHub', () => {
    const f = taskFieldsFor(issue());
    expect(f.title).toBe('แก้ token refresh');
    expect(f.description).toBe(
      'Issue [jay/nosion#42](https://github.com/jay/nosion/issues/42)\n\nรายละเอียด',
    );
    expect(f.occurredAt).toBe('2026-10-20');
    expect(f.github).toMatchObject({ repo: 'jay/nosion', issueNumber: 42, prNumber: null });
  });

  it('PR → prNumber · ไม่มี milestone → ไม่มีกำหนด', () => {
    const f = taskFieldsFor(issue({ pull_request: {}, milestone: null, body: null }));
    expect(f.github).toMatchObject({ issueNumber: null, prNumber: 42 });
    expect(f.occurredAt).toBeNull();
    expect(f.description).toBe('PR [jay/nosion#42](https://github.com/jay/nosion/issues/42)');
  });

  it('clientId ผูกกับ node_id (unique ทั่ว GitHub)', () => {
    expect(issueClientId(issue())).toBe('gh:I_kwDOAbc123');
  });
});

describe('planIssue', () => {
  it('ยังไม่มีงาน + issue เปิด → สร้าง · issue ปิดแล้ว → ไม่สร้าง', () => {
    expect(planIssue(issue(), null).kind).toBe('create');
    expect(planIssue(issue({ state: 'closed' }), null)).toEqual({
      kind: 'skip',
      reason: 'closed-before-import',
    });
  });

  it('ผู้ใช้ลบงานไปแล้ว → ไม่สร้างกลับ', () => {
    expect(planIssue(issue(), synced({ deleted: true }))).toEqual({
      kind: 'skip',
      reason: 'deleted-by-user',
    });
  });

  it('ไม่มีอะไรเปลี่ยน → ข้าม', () => {
    expect(planIssue(issue(), synced())).toEqual({ kind: 'skip', reason: 'unchanged' });
  });

  it('issue ถูกปิดบน GitHub → ปิดงาน', () => {
    const plan = planIssue(issue({ state: 'closed' }), synced());
    expect(plan).toMatchObject({ kind: 'update', completes: true });
  });

  it('issue เปิดกลับบน GitHub → งานกลับเป็น pending', () => {
    const closedBefore = synced({
      status: 'done',
      github: { ...taskFieldsFor(issue()).github, state: 'closed' },
    });
    expect(planIssue(issue(), closedBefore)).toMatchObject({
      kind: 'update',
      patch: { status: 'pending' },
      completes: false,
    });
  });

  it('ผู้ใช้ติ๊กเสร็จเองทั้งที่ issue ยังเปิด → ไม่ถูกเปิดกลับ (state บน GitHub ไม่ได้เปลี่ยน)', () => {
    expect(planIssue(issue(), synced({ status: 'done' }))).toEqual({
      kind: 'skip',
      reason: 'unchanged',
    });
  });

  it('เปลี่ยนชื่อ / milestone due เปลี่ยน → แก้ชื่อและวัน', () => {
    const plan = planIssue(
      issue({ title: 'ชื่อใหม่', milestone: { due_on: '2026-11-01T07:00:00Z' } }),
      synced(),
    );
    expect(plan).toMatchObject({
      kind: 'update',
      patch: { title: 'ชื่อใหม่', occurredAt: '2026-11-01' },
      github: { milestoneDueOn: '2026-11-01T07:00:00Z' },
    });
  });

  it('ลบ milestone → ไม่ลบวันที่ผู้ใช้มีอยู่ (แค่จำว่าไม่มี milestone แล้ว)', () => {
    const plan = planIssue(issue({ milestone: null }), synced());
    expect(plan).toMatchObject({ kind: 'update', patch: {}, github: { milestoneDueOn: null } });
  });

  it('ผู้ใช้ปิด auto-close ไว้ → คงค่าเดิม', () => {
    const plan = planIssue(
      issue({ title: 'x' }),
      synced({ github: { ...taskFieldsFor(issue()).github, autoCloseOnMerge: false } }),
    );
    expect(plan).toMatchObject({ github: { autoCloseOnMerge: false } });
  });
});
