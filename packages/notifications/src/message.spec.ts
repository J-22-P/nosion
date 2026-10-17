import { describe, expect, it } from 'vitest';
import { buildReminderMessage, dueText } from './message';

const TZ = 'Asia/Bangkok';
const th = (local: string) => new Date(`${local}+07:00`);

describe('dueText — นับวันตามปฏิทินของผู้ใช้', () => {
  const now = th('2027-01-30T09:00');
  it.each([
    [th('2027-01-30T00:00'), true, 'ครบกำหนดวันนี้'],
    [th('2027-01-30T14:30'), false, 'ถึงเวลา 14:30'],
    [th('2027-01-31T00:00'), true, 'ครบกำหนดพรุ่งนี้'],
    [th('2027-01-31T08:00'), false, 'พรุ่งนี้ 08:00'],
    [th('2027-02-28T00:00'), true, 'ครบกำหนด 28 ก.พ.'],
    [th('2027-01-28T00:00'), true, 'เลยกำหนดมา 2 วัน'],
  ])('%s (ทั้งวัน=%s) → %s', (due, allDay, expected) => {
    expect(dueText(due, allDay, now, TZ)).toBe(expected);
  });

  it('23:30 ไทยวันที่ 30 = 16:30 UTC — ยังเป็น "วันนี้" ไม่ใช่วันก่อนตาม UTC', () => {
    expect(dueText(th('2027-01-30T23:30'), false, th('2027-01-30T08:00'), TZ)).toBe(
      'ถึงเวลา 23:30',
    );
  });
});

describe('buildReminderMessage', () => {
  const base = {
    id: 'e1',
    userId: 'u1',
    occurredAt: th('2027-01-31T00:00'),
    isAllDay: true,
  };
  const now = th('2027-01-30T09:00');

  it('บิล: ยอดเงินในหัว · ปุ่ม "จ่ายแล้ว" · tag ต่อ entry · ไปหน้า Expenses', () => {
    const m = buildReminderMessage(
      {
        ...base,
        module: 'expense',
        title: 'ค่าเน็ต',
        payload: { amountMinor: 79_900, isBill: true },
      },
      { timezone: TZ, currency: 'THB' },
      now,
    );
    expect(m.title).toBe('ค่าเน็ต ฿799.00');
    expect(m.body).toBe('ครบกำหนดพรุ่งนี้');
    expect(m.tag).toBe('entry-e1');
    expect(m.deepLink).toBe('/expenses');
    expect(m.actions.map((a) => a.title)).toEqual(['จ่ายแล้ว', 'เลื่อน 1 วัน']);
  });

  it('งาน: หัวเป็นชื่องาน · ปุ่ม "เสร็จแล้ว"', () => {
    const m = buildReminderMessage(
      { ...base, module: 'task', title: 'ส่งรายงาน', payload: {} },
      { timezone: TZ, currency: 'THB' },
      now,
    );
    expect(m.title).toBe('ส่งรายงาน');
    expect(m.deepLink).toBe('/tasks');
    expect(m.actions[0]!.title).toBe('เสร็จแล้ว');
  });
});

describe('ภาษาอังกฤษ (Phase 8 ขั้น 6)', () => {
  it('ผู้ใช้ภาษาอังกฤษ → ข้อความ + ปุ่มใน notification เป็นอังกฤษ · เงินยังเป็น ฿', () => {
    const now = new Date('2026-10-17T03:00:00Z');
    const msg = buildReminderMessage(
      {
        id: 'e1',
        userId: 'u1',
        module: 'expense',
        title: 'Internet',
        occurredAt: new Date('2026-10-17T17:00:00Z'), // 18 ต.ค. เวลาไทย = พรุ่งนี้
        isAllDay: true,
        payload: { amountMinor: 79900, currency: 'THB', isBill: true },
      },
      { timezone: 'Asia/Bangkok', currency: 'THB', locale: 'en' },
      now,
    );
    expect(msg.title).toBe('Internet ฿799.00');
    expect(msg.body).toBe('Due tomorrow');
    expect(msg.actions?.map((a) => a.title)).toEqual(['Paid', 'Snooze 1 day']);
    expect(dueText(new Date('2026-10-14T17:00:00Z'), true, now, 'Asia/Bangkok', 'en')).toBe(
      '2 days overdue',
    );
  });
});
