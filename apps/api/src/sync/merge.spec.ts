import { describe, expect, it } from 'vitest';
import { mergeFields, sameValue } from './merge';

describe('mergeFields (สเปก 7.4 นโยบาย conflict)', () => {
  it('แก้ field คนละตัว → รวมกันอัตโนมัติ', () => {
    // client (ออฟไลน์) เปลี่ยนชื่อ · อีกเครื่องเปลี่ยน priority ไปแล้วบน server
    const out = mergeFields(
      { title: 'เดิม', priority: 'high' },
      { title: 'ชื่อใหม่' },
      { title: 'เดิม' },
    );
    expect(out).toEqual({ apply: { title: 'ชื่อใหม่' }, conflicts: [] });
  });

  it('แก้ field เดียวกันคนละค่า → server ชนะ + รายงาน diff', () => {
    const out = mergeFields({ title: 'จากมือถือ' }, { title: 'จากโน้ตบุ๊ก' }, { title: 'เดิม' });
    expect(out).toEqual({
      apply: {},
      conflicts: [{ field: 'title', client: 'จากโน้ตบุ๊ก', server: 'จากมือถือ' }],
    });
  });

  it('แก้ตรงกันอยู่แล้ว (เช่น ติ๊กเสร็จจากสองเครื่อง) → ไม่ใช่ conflict ไม่ต้องเขียน', () => {
    expect(mergeFields({ status: 'done' }, { status: 'done' }, { status: 'pending' })).toEqual({
      apply: {},
      conflicts: [],
    });
  });

  it('payload เทียบทีละ key: amountMinor กับ category แก้คนละเครื่องรวมกันได้', () => {
    const out = mergeFields(
      { payload: { amountMinor: 6500, category: 'shopping', currency: 'THB' } },
      { payload: { amountMinor: 7000 } },
      { payload: { amountMinor: 6500 } },
    );
    expect(out).toEqual({
      apply: { payload: { amountMinor: 7000, category: 'shopping', currency: 'THB' } },
      conflicts: [],
    });
  });

  it('payload key เดียวกันคนละค่า → server ชนะเฉพาะ key นั้น', () => {
    const out = mergeFields(
      { payload: { amountMinor: 9000, category: 'food' } },
      { payload: { amountMinor: 7000, category: 'shopping' } },
      { payload: { amountMinor: 6500, category: 'food' } },
    );
    expect(out.apply).toEqual({ payload: { amountMinor: 9000, category: 'shopping' } });
    expect(out.conflicts).toEqual([{ field: 'payload.amountMinor', client: 7000, server: 9000 }]);
  });

  it('occurredAt เทียบเป็นจุดเวลา — โซนต่างกันแต่เวลาเดียวกัน = ค่าเดียวกัน', () => {
    const out = mergeFields(
      { occurredAt: '2026-10-16T03:00:00.000Z' },
      { occurredAt: '2026-10-17T10:00:00+07:00' },
      { occurredAt: '2026-10-16T10:00:00+07:00' },
    );
    expect(out.apply).toEqual({ occurredAt: '2026-10-17T10:00:00+07:00' });
  });

  it('sameValue ไม่สนลำดับ key', () => {
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue(null, undefined)).toBe(false);
  });
});
