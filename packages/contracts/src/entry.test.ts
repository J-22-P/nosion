import { describe, expect, it } from 'vitest';
import { createEntrySchema, listEntriesQuerySchema, updateEntrySchema } from './entry';
import { expensePayloadSchema, taskPayloadSchema } from './payloads';

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

  it('แปลง occurredAt เป็น Date เสมอ ไม่ว่าจะส่งมาแบบ ISO เต็มหรือแค่วันที่', () => {
    const full = createEntrySchema.parse({
      module: 'task',
      title: 'a',
      occurredAt: '2026-09-18T03:00:00.000Z',
    });
    const dateOnly = createEntrySchema.parse({ module: 'task', title: 'a', occurredAt: '2026-09-18' });
    expect(full.occurredAt).toBeInstanceOf(Date);
    expect(dateOnly.occurredAt).toBeInstanceOf(Date);
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
    expect(
      expensePayloadSchema.safeParse({ amountMinor: 100, category: 'crypto' }).success,
    ).toBe(false);
  });
});
