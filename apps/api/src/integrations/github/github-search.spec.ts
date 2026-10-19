import { describe, expect, it } from 'vitest';
import { projectDueDate, projectStartDate } from './github-search';

type Value = { date?: string; startDate?: string; duration?: number; field: { name: string } };
const item = (...values: Value[]) => ({
  projectItems: { nodes: [{ fieldValues: { nodes: values } }] },
});
const dateField = (name: string, date: string): Value => ({ date, field: { name } });

describe('วันจากช่องของ GitHub Project', () => {
  it('Start Date + End Date → วันเริ่ม + วันกำหนด', () => {
    const node = item(dateField('Start Date', '2026-10-12'), dateField('End Date', '2026-10-16'));
    expect(projectDueDate(node)).toBe('2026-10-16');
    expect(projectStartDate(node)).toBe('2026-10-12');
  });

  it('Sprint (iteration) → วันแรกถึงวันสุดท้ายของรอบ', () => {
    const node = item({ startDate: '2026-10-05', duration: 14, field: { name: 'Sprint' } });
    expect(projectDueDate(node)).toBe('2026-10-18');
    expect(projectStartDate(node)).toBe('2026-10-05');
  });

  it('มีแต่ Start Date → ใช้เป็นวันกำหนด ไม่มีวันเริ่ม (งานวันเดียว)', () => {
    const node = item(dateField('Start Date', '2026-10-12'));
    expect(projectDueDate(node)).toBe('2026-10-12');
    expect(projectStartDate(node)).toBeNull();
  });

  it('วันเริ่มไม่ได้อยู่ก่อนวันกำหนด → ไม่มีวันเริ่ม', () => {
    const node = item(dateField('Start Date', '2026-10-20'), dateField('End Date', '2026-10-16'));
    expect(projectStartDate(node)).toBeNull();
  });
});
