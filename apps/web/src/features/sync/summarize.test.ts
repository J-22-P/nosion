import type { EntryDto } from '@nosion/contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { pickBase } from '@/features/entries/api';
import { findCachedEntry } from '@/lib/sync/entry-cache';
import { summarizeResults } from './summarize';

const entry = (over: Partial<EntryDto> = {}): EntryDto => ({
  id: 'e1',
  module: 'expense',
  title: 'กาแฟ',
  description: null,
  status: 'pending',
  priority: 'none',
  occurredAt: null,
  isAllDay: true,
  completedAt: null,
  payload: { amountMinor: 6500, category: 'food' },
  projectId: null,
  parentId: null,
  recurrenceRuleId: null,
  tags: [],
  sortOrder: 0,
  version: 3,
  createdAt: '2026-10-16T00:00:00Z',
  updatedAt: '2026-10-16T00:00:00Z',
  deletedAt: null,
  ...over,
});

describe('summarizeResults', () => {
  it('แยกผลเป็นสิ่งที่ต้องบอกผู้ใช้ · ชื่อ field เป็นภาษาไทย', () => {
    const s = summarizeResults([
      { opId: '1', status: 'applied' },
      { opId: '2', status: 'merged' },
      {
        opId: '3',
        status: 'conflict',
        entry: entry({ title: 'รายงาน' }),
        conflicts: [
          { field: 'title', client: 'a', server: 'b' },
          { field: 'payload.amountMinor', client: 1, server: 2 },
        ],
      },
      { opId: '4', status: 'deleted' },
      { opId: '5', status: 'error', error: 'ไม่พบรายการ' },
    ]);
    expect(s).toEqual({
      saved: 2,
      conflicts: [{ title: 'รายงาน', fields: ['ชื่อ', 'amountMinor'] }],
      deleted: 1,
      errors: ['ไม่พบรายการ'],
    });
  });
});

describe('pickBase (ค่าก่อนแก้ของ operation update)', () => {
  it('เอาเฉพาะ field ที่แก้ · payload เฉพาะ key ที่แก้ · ตัด version', () => {
    expect(pickBase(entry(), { title: 'ลาเต้', payload: { amountMinor: 7000 } } as never)).toEqual({
      title: 'กาแฟ',
      payload: { amountMinor: 6500 },
    });
    expect(pickBase(entry(), { priority: 'high', version: 3 } as never)).toEqual({
      priority: 'none',
    });
  });

  it('ไม่มีในแคช → ว่าง (server ถือว่าไม่มีใครแก้ระหว่างนั้น)', () => {
    expect(pickBase(null, { title: 'x' })).toEqual({});
  });
});

describe('findCachedEntry', () => {
  it('หาเจอในแคชทุกรูปร่างที่ขึ้นต้นด้วย entries · ไม่ดู key อื่น', () => {
    const qc = new QueryClient();
    qc.setQueryData(['entries', { module: 'task' }], { data: [entry({ id: 'a' })] });
    qc.setQueryData(['entries', 'today'], { sections: { focus: { items: [entry({ id: 'b' })] } } });
    qc.setQueryData(['habits'], [entry({ id: 'c' })]);
    expect(findCachedEntry(qc, 'a')?.id).toBe('a');
    expect(findCachedEntry(qc, 'b')?.id).toBe('b');
    expect(findCachedEntry(qc, 'c')).toBeNull();
  });
});
