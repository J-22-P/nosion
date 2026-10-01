import { describe, expect, it } from 'vitest';
import { parseSort } from './entry.mapper';
import { resolveDeferTarget } from './defer';

describe('parseSort', () => {
  it('แปลงหลาย field ตามลำดับที่ส่งมา และเติม id ท้ายเสมอเพื่อให้ cursor เสถียร', () => {
    expect(parseSort('priority:desc,title:asc')).toEqual([
      { priority: 'desc' },
      { title: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('occurredAt ที่เป็น null ต้องไปอยู่ท้ายสุดเสมอ ไม่ใช่โผล่บนสุด', () => {
    expect(parseSort('occurredAt:asc')).toEqual([
      { occurredAt: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
  });

  it('ตัด field ที่ไม่อยู่ใน allowlist ทิ้ง — กันการยิงชื่อคอลัมน์มั่ว', () => {
    expect(parseSort('passwordHash:desc,occurredAt:desc')).toEqual([
      { occurredAt: { sort: 'desc', nulls: 'last' } },
      { id: 'asc' },
    ]);
  });

  it('สตริงว่าง → เรียงตาม id อย่างเดียว ไม่พัง', () => {
    expect(parseSort('')).toEqual([{ id: 'asc' }]);
  });
});

describe('resolveDeferTarget', () => {
  const TZ = 'Asia/Bangkok';
  const base = new Date('2026-09-18T03:00:00Z');

  it('tomorrow = +1 วันจากกำหนดเดิม', () => {
    expect(resolveDeferTarget('tomorrow', base, TZ).toISOString()).toBe('2026-09-19T03:00:00.000Z');
  });

  it('next-week = +7 วัน', () => {
    expect(resolveDeferTarget('next-week', base, TZ).toISOString()).toBe(
      '2026-09-25T03:00:00.000Z',
    );
  });

  it('date ล้วน = 00:00 ตามโซนผู้ใช้ (เดิมได้ 00:00 UTC = 07:00 เวลาไทย)', () => {
    expect(resolveDeferTarget('2026-12-31', base, TZ).toISOString()).toBe(
      '2026-12-30T17:00:00.000Z',
    );
    expect(resolveDeferTarget('2026-12-31', base, 'America/New_York').toISOString()).toBe(
      '2026-12-31T05:00:00.000Z',
    );
  });

  it('ISO datetime ที่มี offset ใช้ตามนั้น', () => {
    expect(resolveDeferTarget('2026-12-31T09:00:00+07:00', base, TZ).toISOString()).toBe(
      '2026-12-31T02:00:00.000Z',
    );
  });

  it('วันที่มั่ว → 400 ไม่ใช่ Invalid Date ที่หลุดลง DB', () => {
    expect(() => resolveDeferTarget('พรุ่งนี้มั้ง', base, TZ)).toThrow();
  });
});
