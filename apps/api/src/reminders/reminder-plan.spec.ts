import { describe, expect, it } from 'vitest';
import { fireAtFor, reminderKey, rescheduleData } from './reminder-plan';

const at = (iso: string) => new Date(iso);

describe('fireAtFor', () => {
  it('ล่วงหน้า 1 วัน = occurredAt − 1440 นาที', () => {
    expect(fireAtFor(at('2027-01-31T02:00:00Z'), -1440).toISOString()).toBe(
      '2027-01-30T02:00:00.000Z',
    );
  });

  it('offset 0 = ตรงเวลา', () => {
    expect(fireAtFor(at('2027-01-31T02:00:00Z'), 0).toISOString()).toBe('2027-01-31T02:00:00.000Z');
  });
});

describe('reminderKey', () => {
  it('entry + ช่องทาง + offset เดียวกันได้ key เดียวกัน', () => {
    expect(reminderKey('e1', 'push', -60)).toBe(reminderKey('e1', 'push', -60));
    expect(reminderKey('e1', 'push', -60)).not.toBe(reminderKey('e1', 'email', -60));
  });
});

describe('rescheduleData', () => {
  const now = at('2027-01-10T00:00:00Z');

  it('ย้ายไปอนาคต → ตั้งเตือนใหม่แม้เคยส่งแล้ว และล้าง jobId', () => {
    expect(
      rescheduleData({ offsetMinutes: -1440, status: 'sent' }, at('2027-01-20T02:00:00Z'), now),
    ).toEqual({
      fireAt: at('2027-01-19T02:00:00Z'),
      jobId: null,
      status: 'scheduled',
      attempts: 0,
      sentAt: null,
      lastError: null,
    });
  });

  it('ย้ายไปอดีต → เลื่อนเวลาอย่างเดียว ไม่ปลุกสถานะ', () => {
    expect(
      rescheduleData({ offsetMinutes: 0, status: 'sent' }, at('2027-01-05T02:00:00Z'), now),
    ).toEqual({
      fireAt: at('2027-01-05T02:00:00Z'),
      jobId: null,
    });
  });

  it('ผู้ใช้ยกเลิกเอง → ไม่แตะ', () => {
    expect(
      rescheduleData({ offsetMinutes: 0, status: 'cancelled' }, at('2027-01-20T02:00:00Z'), now),
    ).toBeNull();
  });
});
