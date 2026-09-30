import { describe, expect, it } from 'vitest';
import { buildTaskFilters } from './use-task-view';

const NOW = new Date(2026, 8, 30, 15, 0, 0); // 30 ก.ย. 2026 15:00 เวลาเครื่อง

describe('buildTaskFilters', () => {
  it('ค่าเริ่มต้น = งานที่ยังไม่เสร็จ เรียงตามกำหนดส่ง', () => {
    expect(buildTaskFilters('list', 'all', '', NOW)).toEqual({
      module: 'task',
      status: 'pending,active',
      limit: 50,
      sort: 'occurredAt:asc',
    });
  });

  it('view: overdue ใส่ overdue=true · priority เรียงความสำคัญก่อน', () => {
    expect(buildTaskFilters('overdue', 'all', '', NOW).overdue).toBe(true);
    expect(buildTaskFilters('priority', 'all', '', NOW).sort).toBe('priority:desc,occurredAt:asc');
  });

  it('smart list "วันนี้" ตัดที่สิ้นวัน (รวมงานเลยกำหนด) · "7 วัน" มีทั้งต้นและปลาย', () => {
    const today = buildTaskFilters('list', 'today', '', NOW);
    expect(today.from).toBeUndefined();
    expect(new Date(today.to!).getDate()).toBe(30);

    const week = buildTaskFilters('list', 'week', '', NOW);
    expect(new Date(week.from!).getHours()).toBe(0);
    expect(new Date(week.to!).getDate()).toBe(6); // 6 ต.ค.
  });

  it('project / tag / คำค้น', () => {
    expect(buildTaskFilters('list', 'project:p1', '', NOW).projectId).toBe('p1');
    expect(buildTaskFilters('list', 'tag:t1', '', NOW).tagIds).toBe('t1');
    expect(buildTaskFilters('list', 'all', '  auth ', NOW).q).toBe('auth');
    expect(buildTaskFilters('list', 'all', '   ', NOW).q).toBeUndefined();
  });
});
