import { expensePayloadSchema, taskPayloadSchema } from '@nosion/contracts';
import { formatInTimeZone, isEntryOverdue, monthBoundsInTimeZone } from '@nosion/core';
import { describe, expect, it } from 'vitest';
import { isSpent } from '../../modules/expense/spend-rules';
import { buildDemoDataset } from './demo-dataset';

const TZ = 'Asia/Bangkok';
/** 30 ก.ย. 2026 15:00 เวลาไทย (วันเดียวกับ mock ของ UI test) */
const AFTERNOON = new Date('2026-09-30T08:00:00Z');

/** ใช้ "ตอนนี้" หลายแบบ — ขอบต้นเดือน/ท้ายเดือน/เช้ามืด คือที่ seed เก่าพัง */
const MOMENTS = {
  บ่ายวันสุดท้ายของเดือน: AFTERNOON,
  'ต้นเดือน 00:30': new Date('2026-09-30T17:30:00Z'), // 1 ต.ค. 00:30 ไทย
  'วันที่ 2 เช้า': new Date('2026-10-02T01:00:00Z'),
  กลางเดือน: new Date('2026-10-15T05:00:00Z'),
};

describe('buildDemoDataset', () => {
  it('ผลเหมือนเดิมทุกครั้ง (deterministic) — ไม่มีสุ่ม', () => {
    expect(buildDemoDataset(AFTERNOON, TZ)).toEqual(buildDemoDataset(AFTERNOON, TZ));
  });

  it('payload ทุกตัวผ่าน schema ของโมดูล', () => {
    const d = buildDemoDataset(AFTERNOON, TZ);
    for (const t of d.tasks) expect(() => taskPayloadSchema.parse(t.payload)).not.toThrow();
    for (const e of d.expenses) expect(() => expensePayloadSchema.parse(e.payload)).not.toThrow();
  });

  for (const [name, now] of Object.entries(MOMENTS)) {
    describe(name, () => {
      const d = buildDemoDataset(now, TZ);
      const month = monthBoundsInTimeZone(now, TZ);
      const inMonth = (t: Date) => t >= month.start && t < month.end;

      it('ไม่มีสิ่งที่ "เกิดแล้ว" อยู่ในอนาคต (รายจ่ายที่จ่ายแล้ว, งานที่เสร็จ, รอบโฟกัส)', () => {
        for (const e of d.expenses.filter((x) => x.status === 'done'))
          expect(e.occurredAt.getTime()).toBeLessThanOrEqual(now.getTime());
        for (const t of d.tasks.filter((x) => x.completedAt))
          expect(t.completedAt!.getTime()).toBeLessThanOrEqual(now.getTime());
        for (const f of d.focusSessions)
          expect(f.endedAt.getTime()).toBeLessThanOrEqual(now.getTime());
      });

      it('เดือนนี้มีรายจ่ายจริง · บิลค้างจ่ายอยู่ในเดือนนี้ · ประวัติไม่ปนเข้าเดือนนี้', () => {
        const spentThisMonth = d.expenses.filter(
          (e) => inMonth(e.occurredAt) && isSpent({ ...e, deletedAt: null }),
        );
        expect(spentThisMonth.length).toBeGreaterThan(5);
        const unpaid = d.expenses.filter((e) => e.status === 'pending');
        expect(unpaid.length).toBe(2);
        for (const b of unpaid) expect(inMonth(b.occurredAt)).toBe(true);
        // บิลแต่ละชื่อปรากฏครั้งเดียวต่อเดือน
        const billsThisMonth = d.expenses
          .filter((e) => e.payload.isBill && inMonth(e.occurredAt))
          .map((e) => e.title);
        expect(new Set(billsThisMonth).size).toBe(billsThisMonth.length);
      });

      it('การ์ด Today มีของ: งานเลยกำหนด 1 · งานเสร็จวันนี้ 1 · รายจ่ายวันนี้ 2', () => {
        const today = formatInTimeZone(now, TZ);
        const onToday = (t: Date) => formatInTimeZone(t, TZ) === today;
        expect(d.tasks.filter((t) => isEntryOverdue(t, now, TZ)).map((t) => t.key)).toContain(
          'safari',
        );
        expect(
          d.tasks.filter((t) => t.completedAt && onToday(t.completedAt)).map((t) => t.key),
        ).toEqual(['receipt']);
        expect(
          d.expenses.filter((e) => onToday(e.occurredAt) && e.status === 'done').length,
        ).toBeGreaterThanOrEqual(2);
      });
    });
  }

  it('ประวัติ 5 เดือนก่อนครบ (กราฟแนวโน้ม 6 เดือนไม่ว่าง)', () => {
    const d = buildDemoDataset(AFTERNOON, TZ);
    const months = new Set(d.expenses.map((e) => formatInTimeZone(e.occurredAt, TZ).slice(0, 7)));
    expect([...months].sort()).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('บ่าย: รอบโฟกัส 2h 45m และ actualMinutes ของงานตรงกัน · เช้ามืด: ไม่มีรอบข้ามไปเมื่อวาน', () => {
    const d = buildDemoDataset(AFTERNOON, TZ);
    const total = d.focusSessions.reduce((s, f) => s + f.durationSeconds, 0);
    expect(total).toBe(165 * 60);
    expect(d.tasks.find((t) => t.key === 'auth')!.payload.actualMinutes).toBe(165);
    const early = buildDemoDataset(MOMENTS['ต้นเดือน 00:30'], TZ);
    expect(early.focusSessions).toEqual([]);
  });

  it('เวลาเป็นหน้าปัดของผู้ใช้: งานเลยกำหนด = เมื่อวาน 23:59 เวลาไทย (ไม่ใช่ UTC)', () => {
    const d = buildDemoDataset(AFTERNOON, TZ);
    expect(d.tasks.find((t) => t.key === 'safari')!.occurredAt!.toISOString()).toBe(
      '2026-09-29T16:59:00.000Z',
    );
  });

  it('นิสัย (Phase 6): payload ผ่าน schema · ประวัติ 15 วัน · slot 22 วันเรียงกันวันละรอบ (เที่ยงคืนเวลาไทย)', () => {
    const d = buildDemoDataset(new Date('2026-10-16T03:00:00Z'), 'Asia/Bangkok');
    expect(d.habits.map((h) => h.title)).toEqual(['ดื่มน้ำ', 'อ่านหนังสือ', 'นอน', 'วิ่ง']);
    for (const h of d.habits) expect(h.history).toHaveLength(15);
    expect(d.habitDays).toHaveLength(22);
    expect(d.habitDays[14]!.toISOString()).toBe('2026-10-15T17:00:00.000Z'); // วันนี้ 00:00 ไทย
    expect(d.habitDays[1]!.getTime() - d.habitDays[0]!.getTime()).toBe(86_400_000);
  });
});
