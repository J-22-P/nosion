import { describe, expect, it } from 'vitest';
import { buildStandup, type StandupTask } from './standup';

// วันนี้ = 18 ก.ย. 2026 ตามเวลาไทย
const todayStart = new Date('2026-09-17T17:00:00Z');
const todayEnd = new Date('2026-09-18T17:00:00Z');

let seq = 0;
const task = (over: Partial<StandupTask>): StandupTask => ({
  id: `t${++seq}`,
  title: `งาน ${seq}`,
  status: 'pending',
  occurredAt: new Date('2026-09-18T05:00:00Z'),
  isAllDay: false,
  completedAt: null,
  projectName: null,
  tags: [],
  blockers: [],
  ...over,
});

const build = (tasks: StandupTask[]) =>
  buildStandup({
    date: '2026-09-18',
    now: new Date('2026-09-18T03:00:00Z'), // 10:00 เวลาไทย
    timeZone: 'Asia/Bangkok',
    todayStart,
    todayEnd,
    tasks,
  });

describe('buildStandup', () => {
  it('Done = เสร็จวันนี้เท่านั้น (เสร็จเมื่อวานไม่นับ)', () => {
    const s = build([
      task({ title: 'เสร็จวันนี้', status: 'done', completedAt: new Date('2026-09-18T02:00:00Z') }),
      task({
        title: 'เสร็จเมื่อวาน',
        status: 'done',
        completedAt: new Date('2026-09-17T10:00:00Z'),
      }),
    ]);
    expect(s.done.map((i) => i.title)).toEqual(['เสร็จวันนี้']);
  });

  it('Blocked: dependency ที่ยังไม่จบ หรือแท็ก #blocked (ตัวพิมพ์ใดก็ได้) · dependency ที่เสร็จแล้วไม่บล็อก', () => {
    const s = build([
      task({ title: 'รอ review', blockers: [{ title: 'Review PR #108', status: 'pending' }] }),
      task({ title: 'ติดแท็ก', tags: ['Blocked'] }),
      task({ title: 'รอแต่อีกงานเสร็จแล้ว', blockers: [{ title: 'Setup', status: 'done' }] }),
    ]);
    expect(s.blocked).toEqual([
      { id: expect.any(String), title: 'รอ review', note: 'รอ: Review PR #108' },
      { id: expect.any(String), title: 'ติดแท็ก', note: '#blocked' },
    ]);
    expect(s.doing.map((i) => i.title)).toEqual(['รอแต่อีกงานเสร็จแล้ว']);
  });

  it('Doing: กำหนดวันนี้ / เลยกำหนด (มีหมายเหตุ) / active ที่ไม่มีกำหนด · งานอนาคตและ inbox ไม่อยู่', () => {
    const s = build([
      task({ title: 'วันนี้', projectName: 'NOSION Core' }),
      task({ title: 'เลยกำหนด', occurredAt: new Date('2026-09-15T03:00:00Z') }),
      task({ title: 'กำลังทำ ไม่มีกำหนด', status: 'active', occurredAt: null }),
      task({ title: 'สัปดาห์หน้า', occurredAt: new Date('2026-09-25T03:00:00Z') }),
      task({ title: 'inbox', occurredAt: null }),
      task({ title: 'ยกเลิก', status: 'cancelled' }),
    ]);
    expect(s.doing).toEqual([
      { id: expect.any(String), title: 'วันนี้', note: 'NOSION Core' },
      { id: expect.any(String), title: 'เลยกำหนด', note: 'เลยกำหนด' },
      { id: expect.any(String), title: 'กำลังทำ ไม่มีกำหนด' },
    ]);
  });

  it('งานทั้งวันที่กำหนดวันนี้ (00:00 เวลาไทย) ไม่ถูกเขียนว่า "เลยกำหนด" · กำหนดเมื่อวานถูกเขียน', () => {
    const s = build([
      task({ title: 'ทั้งวันวันนี้', isAllDay: true, occurredAt: todayStart }),
      task({
        title: 'ทั้งวันเมื่อวาน',
        isAllDay: true,
        occurredAt: new Date('2026-09-16T17:00:00Z'),
      }),
    ]);
    expect(s.doing).toEqual([
      { id: expect.any(String), title: 'ทั้งวันวันนี้' },
      { id: expect.any(String), title: 'ทั้งวันเมื่อวาน', note: 'เลยกำหนด' },
    ]);
  });

  it('markdown จัดกลุ่ม Done / Doing / Blocked · กลุ่มว่างเขียนว่า "ไม่มี"', () => {
    const s = build([
      task({
        title: 'Fix login redirect',
        status: 'done',
        completedAt: new Date('2026-09-18T02:00:00Z'),
      }),
      task({ title: 'Merge PR #108', projectName: 'auth-v2' }),
    ]);
    expect(s.markdown).toBe(
      [
        '## Standup · 2026-09-18',
        '**Done**\n- Fix login redirect',
        '**Doing**\n- Merge PR #108 _(auth-v2)_',
        '**Blocked**\n- ไม่มี',
      ].join('\n\n'),
    );
  });
});
