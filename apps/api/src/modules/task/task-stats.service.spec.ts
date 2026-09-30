import { describe, expect, it } from 'vitest';
import { buildSidebar } from './task-stats.service';

describe('buildSidebar', () => {
  const counts = { all: 5, inbox: 1, today: 2, week: 3, overdue: 1 };

  it('ผูกจำนวนงานเข้ากับโปรเจกต์ และโปรเจกต์ที่ไม่มีงานค้างได้ 0', () => {
    const result = buildSidebar({
      counts,
      projects: [
        { id: 'p1', name: 'Core', color: '#000000' },
        { id: 'p2', name: 'ใหม่', color: '#111111' },
      ],
      perProject: [{ projectId: 'p1', count: 4 }],
      tags: [],
      perTag: [],
    });
    expect(result.smartLists).toEqual(counts);
    expect(result.projects).toEqual([
      { id: 'p1', name: 'Core', color: '#000000', count: 4 },
      { id: 'p2', name: 'ใหม่', color: '#111111', count: 0 },
    ]);
  });

  it('แท็กคงลำดับตามจำนวน และทิ้งแท็กที่หาชื่อไม่เจอ (เช่นถูกลบระหว่าง query)', () => {
    const result = buildSidebar({
      counts,
      projects: [],
      perProject: [],
      tags: [
        { id: 't2', name: 'bug' },
        { id: 't1', name: 'dev' },
      ],
      perTag: [
        { tagId: 't1', count: 7 },
        { tagId: 'gone', count: 5 },
        { tagId: 't2', count: 2 },
      ],
    });
    expect(result.topTags).toEqual([
      { id: 't1', name: 'dev', count: 7 },
      { id: 't2', name: 'bug', count: 2 },
    ]);
  });
});
