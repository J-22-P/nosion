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
  hasDate: true,
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

  it('วันจากช่องวันที่ของ GitHub Project มาก่อน milestone', () => {
    const f = taskFieldsFor(issue({ project_due_on: '2026-10-16' }));
    expect(f.occurredAt).toBe('2026-10-16');
    expect(f.github).toMatchObject({ dueOn: '2026-10-16', milestoneDueOn: '2026-10-20T07:00:00Z' });
  });

  it('Start Date ของ Project → วันเริ่ม (คู่กับวันกำหนดจาก Project เท่านั้น)', () => {
    const f = taskFieldsFor(
      issue({ project_due_on: '2026-10-16', project_start_on: '2026-10-12' }),
    );
    expect(f.startDate).toBe('2026-10-12');
    expect(f.github.startOn).toBe('2026-10-12');
    expect(taskFieldsFor(issue({ project_start_on: '2026-10-12' })).startDate).toBeNull();
  });

  it('issue ปิดแล้วไม่มีวันกำหนด → ลงปฏิทินวันที่ปิดตามโซนผู้ใช้ · เปิดอยู่ไม่มีวัน → ไม่มีกำหนด', () => {
    // 18:30Z วันที่ 30 = 01:30 วันที่ 1 ตุลาคม เวลาไทย
    const closed = issue({ state: 'closed', milestone: null, closed_at: '2026-09-30T18:30:00Z' });
    expect(taskFieldsFor(closed).occurredAt).toBe('2026-10-01');
    expect(taskFieldsFor(closed, 'UTC').occurredAt).toBe('2026-09-30');
    expect(taskFieldsFor(closed).github.dueOn).toBeNull();
    expect(taskFieldsFor(issue({ milestone: null })).occurredAt).toBeNull();
  });

  it('clientId ผูกกับ node_id (unique ทั่ว GitHub)', () => {
    expect(issueClientId(issue())).toBe('gh:I_kwDOAbc123');
  });
});

describe('planIssue', () => {
  it('ยังไม่มีงาน + issue เปิด → สร้าง · issue ปิดแล้ว → สร้างเป็นงานที่เสร็จแล้ว (ประวัติ)', () => {
    expect(planIssue(issue(), null)).toMatchObject({ kind: 'create', completes: false });
    expect(
      planIssue(issue({ state: 'closed', closed_at: '2026-09-30T18:30:00Z' }), null),
    ).toMatchObject({
      kind: 'create',
      completes: true,
      fields: { completedAt: '2026-09-30T18:30:00Z' },
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

  it('issue ถูกปิดบน GitHub → ปิดงาน (วันที่เสร็จ = วันที่ปิดบน GitHub)', () => {
    const plan = planIssue(issue({ state: 'closed', closed_at: '2026-10-21T03:00:00Z' }), synced());
    expect(plan).toMatchObject({
      kind: 'update',
      completes: true,
      completedAt: '2026-10-21T03:00:00Z',
      patch: {},
    });
  });

  it('งานไม่มีวัน + issue ถูกปิด → ลงปฏิทินวันที่ปิด', () => {
    const plan = planIssue(
      issue({ state: 'closed', milestone: null, closed_at: '2026-10-21T03:00:00Z' }),
      synced({ hasDate: false, github: { ...taskFieldsFor(issue({ milestone: null })).github } }),
    );
    expect(plan).toMatchObject({ completes: true, patch: { occurredAt: '2026-10-21' } });
  });

  it('วันในช่อง Project เปลี่ยน → เลื่อนวัน · ไม่เปลี่ยน → ไม่แตะวันที่ผู้ใช้เลื่อนเอง', () => {
    const base = synced({ github: taskFieldsFor(issue({ project_due_on: '2026-10-16' })).github });
    expect(planIssue(issue({ project_due_on: '2026-10-16' }), base)).toEqual({
      kind: 'skip',
      reason: 'unchanged',
    });
    expect(planIssue(issue({ project_due_on: '2026-10-23' }), base)).toMatchObject({
      patch: { occurredAt: '2026-10-23' },
      github: { dueOn: '2026-10-23' },
    });
  });

  it('วันเริ่มบน GitHub เปลี่ยน → เขียนทับวันเริ่ม · ไม่เปลี่ยน → ไม่แตะ · ลบบน GitHub → ไม่ลบของผู้ใช้', () => {
    const ranged = issue({ project_due_on: '2026-10-16', project_start_on: '2026-10-12' });
    const existing = synced({ github: { ...taskFieldsFor(ranged).github } });
    expect(planIssue(ranged, existing)).toEqual({ kind: 'skip', reason: 'unchanged' });

    const moved = planIssue({ ...ranged, project_start_on: '2026-10-09' }, existing);
    expect(moved).toMatchObject({ kind: 'update', startDate: '2026-10-09' });

    const removed = planIssue({ ...ranged, project_start_on: null }, existing);
    expect(removed.kind).toBe('update');
    expect(removed).not.toHaveProperty('startDate');
  });

  it('งานที่ซิงก์ก่อนมีช่อง dueOn (มีแค่ milestoneDueOn) → ไม่ถือว่าวันเปลี่ยน', () => {
    const legacy = synced({ github: { ...taskFieldsFor(issue()).github, dueOn: null } });
    expect(planIssue(issue(), legacy)).toEqual({ kind: 'skip', reason: 'unchanged' });
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
