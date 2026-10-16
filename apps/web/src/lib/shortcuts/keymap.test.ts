import { describe, expect, it } from 'vitest';
import { createKeyReader, SHORTCUTS, type KeyLike } from './keymap';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('keymap', () => {
  it('chord g + ปุ่ม ภายใน 1 วินาที → ไปหน้า', () => {
    const read = createKeyReader();
    expect(read(key('g'), 0)).toBeNull();
    expect(read(key('c'), 500)).toEqual({ kind: 'go', href: '/calendar' });
    expect(read(key('g'), 1000)).toBeNull();
    expect(read(key('k'), 1200)).toEqual({ kind: 'go', href: '/tasks' });
  });

  it('g ค้างนานเกิน → ปุ่มถัดไปอ่านแบบปกติ ("k" = รายการก่อนหน้า)', () => {
    const read = createKeyReader();
    read(key('g'), 0);
    expect(read(key('k'), 1500)).toEqual({ kind: 'prev' });
  });

  it('g ตามด้วยปุ่มที่ไม่ใช่ chord → ปุ่มนั้นทำงานตามปกติ', () => {
    const read = createKeyReader();
    read(key('g'), 0);
    expect(read(key('n'), 100)).toEqual({ kind: 'new' });
    expect(read(key('k'), 200)).toEqual({ kind: 'prev' }); // chord ถูกทิ้งไปแล้ว
  });

  it('⌘K / Ctrl+K / ⌘Z · ปุ่มที่มี modifier อื่นไม่ใช่ปุ่มลัด', () => {
    const read = createKeyReader();
    expect(read(key('k', { metaKey: true }), 0)).toEqual({ kind: 'palette' });
    expect(read(key('K', { ctrlKey: true }), 0)).toEqual({ kind: 'palette' });
    expect(read(key('z', { metaKey: true }), 0)).toEqual({ kind: 'undo' });
    expect(read(key('z', { metaKey: true, shiftKey: true }), 0)).toBeNull(); // redo ไม่มี
    expect(read(key('n', { altKey: true }), 0)).toBeNull();
    expect(read(key('j'), 0)).toEqual({ kind: 'next' });
    expect(read(key('?', { shiftKey: true }), 0)).toEqual({ kind: 'help' });
  });

  it('ตารางในหน้าต่าง ? ครบทุกปุ่มของสเปก 8.4', () => {
    const all = SHORTCUTS.map((s) => s.keys.join(''));
    for (const k of [
      '⌘K',
      'n',
      '/',
      'gt',
      'gk',
      'gm',
      'gc',
      'j',
      'k',
      'x',
      'e',
      't',
      '1–4',
      '⌘Z',
      '?',
      '[',
      's',
    ]) {
      expect(all).toContain(k);
    }
  });
});
