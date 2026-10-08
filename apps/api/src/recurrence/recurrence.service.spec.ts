import { UnprocessableEntityException } from '@nestjs/common';
import { RecurrenceRuleError } from '@nosion/core';
import { describe, expect, it } from 'vitest';
import { matches } from './recurrence-cron.controller';
import { asHttpError, entryDataFor, normalizeRrule, toEnd } from './recurrence.service';

describe('recurrence helpers', () => {
  it('normalizeRrule ตัด prefix RRULE: และเป็นตัวพิมพ์ใหญ่', () => {
    expect(normalizeRrule('  rrule:freq=monthly;bymonthday=31 ')).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=31',
    );
  });

  it('toEnd แปลงคอลัมน์ DB เป็น RecurrenceEnd และบังคับค่าที่จำเป็น', () => {
    const at = new Date('2027-01-01T00:00:00Z');
    expect(toEnd('never', null, null)).toEqual({ type: 'never' });
    expect(toEnd('onDate', at, null)).toEqual({ type: 'onDate', endsAt: at });
    expect(toEnd('afterCount', null, 5)).toEqual({ type: 'afterCount', maxCount: 5 });
    expect(() => toEnd('onDate', null, null)).toThrow(UnprocessableEntityException);
    expect(() => toEnd('afterCount', null, null)).toThrow(UnprocessableEntityException);
  });

  it('asHttpError: error ของ engine → 422 · อย่างอื่นส่งต่อเดิม', () => {
    expect(asHttpError(new RecurrenceRuleError('x'))).toBeInstanceOf(UnprocessableEntityException);
    const other = new Error('db');
    expect(asHttpError(other)).toBe(other);
  });

  it('entryDataFor: occurredAt = slot · เริ่ม pending · ผูก rule + slot (กุญแจกันซ้ำ)', () => {
    const slot = new Date('2027-02-27T17:00:00Z');
    const data = entryDataFor(
      { id: 'rule1', userId: 'u1' },
      {
        module: 'expense',
        title: 'ค่าเน็ต',
        priority: 'none',
        isAllDay: true,
        payload: { amountMinor: 79_900 },
        tagIds: [],
      },
      slot,
    );
    expect(data).toMatchObject({
      userId: 'u1',
      recurrenceRuleId: 'rule1',
      recurrenceSlot: slot,
      occurredAt: slot,
      status: 'pending',
      description: null,
      projectId: null,
    });
  });

  it('matches เทียบ secret แบบความยาวต่างกันได้โดยไม่ throw', () => {
    expect(matches('Bearer abc', 'Bearer abc')).toBe(true);
    expect(matches('Bearer ab', 'Bearer abc')).toBe(false);
    expect(matches('', 'Bearer abc')).toBe(false);
  });
});
