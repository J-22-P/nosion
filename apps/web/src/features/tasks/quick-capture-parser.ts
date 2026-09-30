import type { Priority } from '@nosion/contracts';

/**
 * Quick capture เวอร์ชัน regex (สเปก 8.11.2 — ก่อนมี NL parser ใน Phase 5)
 * รองรับเฉพาะ 3 รูปแบบ:
 *   !urgent / !high / !medium / !low  (หรือ !ด่วน !สูง !กลาง !ต่ำ)
 *   #tag
 *   +project
 * ส่วนที่เหลือคือชื่องาน
 *
 * token ต้องขึ้นต้นคำ (มีช่องว่างหรือต้นบรรทัดนำหน้า) เพื่อไม่ให้ "C#" หรือ "1+1" ถูกตีความผิด
 */

export type ParsedToken =
  | { kind: 'priority'; raw: string; value: Exclude<Priority, 'none'> }
  | { kind: 'tag'; raw: string; value: string }
  | { kind: 'project'; raw: string; value: string };

export interface ParsedCapture {
  title: string;
  priority: Exclude<Priority, 'none'> | null;
  tags: string[];
  project: string | null;
  tokens: ParsedToken[];
}

const PRIORITY_ALIASES: Record<string, Exclude<Priority, 'none'>> = {
  urgent: 'urgent',
  high: 'high',
  medium: 'medium',
  med: 'medium',
  low: 'low',
  ด่วน: 'urgent',
  สูง: 'high',
  กลาง: 'medium',
  ต่ำ: 'low',
};

// \p{M} = สระ/วรรณยุกต์ไทย — ถ้าไม่ใส่ "#ด่วนมาก" จะถูกตัดกลางคำ
const WORD = '[\\p{L}\\p{M}\\p{N}_.-]+';
const TOKEN_RE = new RegExp(`(^|\\s)([!#+])(${WORD})(?=\\s|$)`, 'gu');

export function parseQuickCapture(input: string): ParsedCapture {
  const tokens: ParsedToken[] = [];
  let priority: ParsedCapture['priority'] = null;
  const tags: string[] = [];
  let project: string | null = null;

  const title = input
    .replace(TOKEN_RE, (match, lead: string, sigil: string, word: string) => {
      const raw = `${sigil}${word}`;
      if (sigil === '!') {
        const value = PRIORITY_ALIASES[word.toLowerCase()];
        if (!value) return match; // "!important" ไม่รู้จัก → เก็บไว้ในชื่องาน
        priority = value; // ตัวหลังชนะ
        tokens.push({ kind: 'priority', raw, value });
      } else if (sigil === '#') {
        if (!tags.some((t) => t.toLowerCase() === word.toLowerCase())) tags.push(word);
        tokens.push({ kind: 'tag', raw, value: word });
      } else {
        project = word; // ตัวหลังชนะ
        tokens.push({ kind: 'project', raw, value: word });
      }
      return lead;
    })
    .replace(/\s+/g, ' ')
    .trim();

  return { title, priority, tags, project, tokens };
}

/** ลบ token หนึ่งตัวออกจากข้อความ (ตอนผู้ใช้กด × ที่ chip) */
export function removeToken(input: string, raw: string): string {
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return input
    .replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'u'), '$1')
    .replace(/\s{2,}/g, ' ')
    .trimStart();
}

/** เทียบชื่อแบบไม่สนตัวพิมพ์และถือว่า "-" = ช่องว่าง: "+auth-v2" ตรงกับโปรเจกต์ "Auth v2" */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ');
  return norm(a) === norm(b);
}
