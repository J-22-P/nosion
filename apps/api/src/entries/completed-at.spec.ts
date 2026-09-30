import { describe, expect, it } from 'vitest';
import { completedAtFor } from './completed-at';

const NOW = new Date('2026-09-30T08:00:00.000Z');
const EARLIER = new Date('2026-09-29T08:00:00.000Z');

describe('completedAtFor', () => {
  it('pending → done ได้เวลาปัจจุบัน', () => {
    expect(completedAtFor('done', { status: 'pending', completedAt: null }, NOW)).toEqual(NOW);
  });

  it('done อยู่แล้ว → คงเวลาเดิม', () => {
    expect(completedAtFor('done', { status: 'done', completedAt: EARLIER }, NOW)).toEqual(EARLIER);
  });

  it('done → pending (undo) ต้องล้างเป็น null', () => {
    expect(completedAtFor('pending', { status: 'done', completedAt: EARLIER }, NOW)).toBeNull();
    expect(completedAtFor('active', { status: 'done', completedAt: EARLIER }, NOW)).toBeNull();
  });
});
