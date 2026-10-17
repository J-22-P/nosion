/**
 * ปุ่มลัดทั้งระบบ (สเปก 8.4) — pure ทั้งไฟล์: ตารางสำหรับหน้าต่าง `?` + ตัวอ่านปุ่ม (รวม chord "g ตามด้วยปุ่ม")
 *
 * แบ่งสองชั้น:
 *  - global (ไฟล์นี้ + use-global-shortcuts): ⌘K n / g… j k ? [ ⌘Z — ทำงานทุกหน้า
 *  - ระดับรายการ: e t x 1–4 — รายการที่โฟกัสอยู่ (TaskCard) จัดการเอง เพราะรู้ว่าตัวเองคือรายการไหน
 * `s` (Standup) อยู่ที่หน้า Today ตั้งแต่ v1.1
 */

export interface ShortcutDef {
  keys: string[];
  /** ข้อความ `shortcuts.<label>` ตามภาษา */
  label: string;
  group: 'general' | 'goto' | 'items';
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { keys: ['⌘', 'K'], label: 'palette', group: 'general' },
  { keys: ['n'], label: 'new', group: 'general' },
  { keys: ['/'], label: 'search', group: 'general' },
  { keys: ['⌘', 'Z'], label: 'undo', group: 'general' },
  { keys: ['['], label: 'sidebar', group: 'general' },
  { keys: ['s'], label: 'standup', group: 'general' },
  { keys: ['?'], label: 'help', group: 'general' },
  { keys: ['g', 't'], label: 'goToday', group: 'goto' },
  { keys: ['g', 'k'], label: 'goTasks', group: 'goto' },
  { keys: ['g', 'm'], label: 'goMoney', group: 'goto' },
  { keys: ['g', 'c'], label: 'goCalendar', group: 'goto' },
  { keys: ['j'], label: 'next', group: 'items' },
  { keys: ['k'], label: 'prev', group: 'items' },
  { keys: ['e'], label: 'complete', group: 'items' },
  { keys: ['t'], label: 'defer', group: 'items' },
  { keys: ['x'], label: 'select', group: 'items' },
  { keys: ['1', '–', '4'], label: 'priority', group: 'items' },
];

export type GlobalAction =
  | { kind: 'palette' | 'new' | 'search' | 'help' | 'sidebar' | 'undo' | 'next' | 'prev' }
  | { kind: 'go'; href: string };

const GO: Record<string, string> = { t: '/today', k: '/tasks', m: '/expenses', c: '/calendar' };

/** chord ต้องกดปุ่มที่สองภายในเวลานี้ — นานกว่านี้ "g" ถือว่าทิ้งไป */
export const CHORD_TIMEOUT_MS = 1000;

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * ตัวอ่านปุ่มที่จำ "g" ค้างไว้ได้ — คืน action หรือ null (ไม่ใช่ปุ่มลัด / กำลังรอปุ่มที่สองของ chord)
 * ไม่อ่านนาฬิกาเอง: `now` ส่งเข้ามา ทดสอบ timeout ได้
 */
export function createKeyReader(timeoutMs = CHORD_TIMEOUT_MS) {
  let pendingG: number | null = null;

  return function read(e: KeyLike, now: number): GlobalAction | null {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 'k') return { kind: 'palette' };
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') return { kind: 'undo' };
    if (mod || e.altKey) return null;

    if (pendingG !== null) {
      const fresh = now - pendingG <= timeoutMs;
      pendingG = null;
      if (fresh && GO[e.key]) return { kind: 'go', href: GO[e.key]! };
      // ไม่ใช่ปุ่มที่สองของ chord → อ่านปุ่มนี้แบบปกติต่อ
    }

    switch (e.key) {
      case 'g':
        pendingG = now;
        return null;
      case 'n':
        return { kind: 'new' };
      case '/':
        return { kind: 'search' };
      case '?':
        return { kind: 'help' };
      case '[':
        return { kind: 'sidebar' };
      case 'j':
        return { kind: 'next' };
      case 'k':
        return { kind: 'prev' };
      default:
        return null;
    }
  };
}

/** ปุ่ม 1–4 → ความสำคัญ (ตาม PRIORITY_ORDER ของ contracts: น้อย → มาก) */
export const PRIORITY_BY_DIGIT = { '1': 'low', '2': 'medium', '3': 'high', '4': 'urgent' } as const;

/** ไม่จับปุ่มลัดตอนผู้ใช้กำลังพิมพ์ */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}
