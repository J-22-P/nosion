import { describe, expect, it } from 'vitest';
import { createEntrySchema, listEntriesQuerySchema, updateEntrySchema } from './entry';
import {
  expensePayloadSchema,
  habitPayloadSchema,
  isHabitComplete,
  taskPayloadSchema,
  workoutPayloadSchema,
} from './payloads';

describe('createEntrySchema', () => {
  it('เติมค่าเริ่มต้นให้ครบ เพื่อให้ service ไม่ต้องเช็ค undefined ทุกจุด', () => {
    const parsed = createEntrySchema.parse({ module: 'task', title: 'ทดสอบ' });
    expect(parsed).toMatchObject({
      status: 'pending',
      priority: 'none',
      isAllDay: true,
      payload: {},
      tagIds: [],
      reminders: [],
    });
  });

  it('ตัดช่องว่างหัวท้ายของชื่อ และไม่ยอมรับชื่อว่าง', () => {
    expect(createEntrySchema.parse({ module: 'task', title: '  งาน  ' }).title).toBe('งาน');
    expect(createEntrySchema.safeParse({ module: 'task', title: '   ' }).success).toBe(false);
  });

  it('ISO เต็มเป็น Date · date ล้วนคงเป็น string ให้ service แปลงตามโซนผู้ใช้ (เดิม new Date() ได้ 07:00 เวลาไทย)', () => {
    const full = createEntrySchema.parse({
      module: 'task',
      title: 'a',
      occurredAt: '2026-09-18T03:00:00.000Z',
    });
    const dateOnly = createEntrySchema.parse({
      module: 'task',
      title: 'a',
      occurredAt: '2026-09-18',
    });
    expect(full.occurredAt).toBeInstanceOf(Date);
    expect(dateOnly.occurredAt).toBe('2026-09-18');
  });

  it('ปฏิเสธโมดูลที่ไม่รู้จัก', () => {
    expect(createEntrySchema.safeParse({ module: 'crypto', title: 'a' }).success).toBe(false);
  });
});

describe('updateEntrySchema', () => {
  it('ต้องส่ง version มาเสมอ — ไม่มีการอัปเดตแบบไม่รู้เวอร์ชัน', () => {
    expect(updateEntrySchema.safeParse({ title: 'ใหม่' }).success).toBe(false);
    expect(updateEntrySchema.safeParse({ title: 'ใหม่', version: 3 }).success).toBe(true);
  });
});

describe('listEntriesQuerySchema', () => {
  it('แปลง comma-separated ใน query string เป็น array', () => {
    const parsed = listEntriesQuerySchema.parse({ module: 'task,expense', status: 'pending,done' });
    expect(parsed.module).toEqual(['task', 'expense']);
    expect(parsed.status).toEqual(['pending', 'done']);
  });

  it('boolean ใน query: "false" ต้องเป็น false ไม่ใช่ true', () => {
    expect(listEntriesQuerySchema.parse({ overdue: 'false' }).overdue).toBe(false);
    expect(listEntriesQuerySchema.parse({ overdue: 'true' }).overdue).toBe(true);
    expect(listEntriesQuerySchema.parse({ inbox: '1' }).inbox).toBe(true);
    expect(listEntriesQuerySchema.parse({}).inbox).toBeUndefined();
    expect(listEntriesQuerySchema.safeParse({ inbox: 'yes' }).success).toBe(false);
  });

  it('จำกัด limit ไม่ให้ดึงทีเดียวทั้งฐานข้อมูล', () => {
    expect(listEntriesQuerySchema.parse({}).limit).toBe(50);
    expect(listEntriesQuerySchema.safeParse({ limit: '5000' }).success).toBe(false);
  });
});

describe('payload ต่อโมดูล', () => {
  it('task: checklist จำกัด 50 รายการ', () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({ id: `${i}`, text: 'x', done: false }));
    expect(taskPayloadSchema.safeParse({ checklist: tooMany }).success).toBe(false);
  });

  it('expense: จำนวนเงินต้องเป็นจำนวนเต็มหน่วยสตางค์ — ห้าม float', () => {
    expect(expensePayloadSchema.safeParse({ amountMinor: 12550 }).success).toBe(true);
    expect(expensePayloadSchema.safeParse({ amountMinor: 125.5 }).success).toBe(false);
  });

  it('expense: หมวดที่ไม่รู้จักถูกปฏิเสธ ไม่ใช่ปล่อยผ่านเพราะเป็น JSONB', () => {
    expect(expensePayloadSchema.safeParse({ amountMinor: 100, category: 'crypto' }).success).toBe(
      false,
    );
  });
});

describe('habit payload v1.1', () => {
  it('ค่าเริ่มต้นเป็นแบบ check และ payload เก่า (ไม่มี kind) ยัง parse ผ่าน', () => {
    const parsed = habitPayloadSchema.parse({ targetValue: 8, unit: 'แก้ว' });
    expect(parsed).toMatchObject({
      kind: 'check',
      targetValue: 8,
      currentValue: 0,
      unitConversion: null,
      deadlineLocalTime: null,
      subtitle: null,
    });
  });

  it('count: เก็บหน่วยแปลงสำหรับแสดงผลรอง', () => {
    const parsed = habitPayloadSchema.parse({
      kind: 'count',
      targetValue: 8,
      currentValue: 5,
      unit: 'แก้ว',
      unitConversion: { unit: 'ml', factor: 250 },
    });
    expect(parsed.unitConversion).toEqual({ unit: 'ml', factor: 250 });
  });

  it('before_time: ต้องมี deadlineLocalTime และต้องเป็นเวลาที่มีจริง', () => {
    const missing = habitPayloadSchema.safeParse({ kind: 'before_time' });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.path).toEqual(['deadlineLocalTime']);

    expect(
      habitPayloadSchema.safeParse({ kind: 'before_time', deadlineLocalTime: '23:45' }).success,
    ).toBe(true);
    expect(
      habitPayloadSchema.safeParse({ kind: 'before_time', deadlineLocalTime: '25:99' }).success,
    ).toBe(false);
  });

  it('weekly: ต้องบอกว่ากี่ครั้งต่อสัปดาห์', () => {
    expect(habitPayloadSchema.safeParse({ cadence: 'weekly' }).success).toBe(false);
    expect(habitPayloadSchema.safeParse({ cadence: 'weekly', weeklyTarget: 3 }).success).toBe(true);
  });

  it('isHabitComplete: ครบเป้าเมื่อ current ≥ target', () => {
    expect(isHabitComplete({ currentValue: 5, targetValue: 8 })).toBe(false);
    expect(isHabitComplete({ currentValue: 8, targetValue: 8 })).toBe(true);
  });
});

describe('workout payload v1.1', () => {
  it('splitLabel / templateId เป็น optional และมีค่าเริ่มต้นเป็น null', () => {
    const parsed = workoutPayloadSchema.parse({ workoutType: 'strength' });
    expect(parsed.splitLabel).toBeNull();
    expect(parsed.templateId).toBeNull();
    expect(
      workoutPayloadSchema.safeParse({ workoutType: 'strength', splitLabel: 'x'.repeat(21) })
        .success,
    ).toBe(false);
  });
});
