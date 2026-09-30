import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, parseColor, type Rgba } from './contrast';

/**
 * ตรวจ contrast ของ token ทั้งสองธีมตั้งแต่ระดับ CSS — ก่อนจะมี component ไหนใช้
 * (axe ใน e2e จับได้เฉพาะหน้าที่เปิด · เทสต์นี้จับทุกคู่สีที่ระบบอนุญาตให้ใช้)
 *
 * เกณฑ์ WCAG 2.1 AA: ข้อความปกติ ≥ 4.5 : 1 · ข้อความใหญ่ ≥ 3 : 1
 */

// vitest รันจากโฟลเดอร์ของ package เสมอ (turbo / pnpm --filter)
const css = readFileSync(join(process.cwd(), 'src/tokens.css'), 'utf8');

function readBlock(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('\n}', start);
  const vars: Record<string, string> = {};
  for (const m of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[m[1]!] = m[2]!.trim();
  }
  return vars;
}

const light = readBlock(':root');
const THEMES = { light, dark: { ...light, ...readBlock('.dark') } };

const AA = 4.5;
const AA_LARGE = 3;

for (const [theme, tokens] of Object.entries(THEMES)) {
  const color = (name: string): Rgba => {
    const value = tokens[name];
    if (!value) throw new Error(`ไม่มี token --${name}`);
    return parseColor(value);
  };
  /** พื้นทึบทุกชั้นที่ข้อความวางได้ (level 0 / 1 / 1.5) */
  const grounds = {
    canvas: color('canvas'),
    surface: color('surface'),
    sunken: color('surface-sunken'),
  };

  describe(`contrast · ${theme}`, () => {
    for (const text of [
      'text-primary',
      'text-secondary',
      'accent',
      'danger',
      'warning',
      'success',
    ]) {
      for (const [groundName, ground] of Object.entries(grounds)) {
        it(`${text} บน ${groundName} ≥ ${AA}`, () => {
          expect(contrastRatio(color(text), ground)).toBeGreaterThanOrEqual(AA);
        });
      }
    }

    // badge/alert: ข้อความสีเดียวกับพื้นโปร่ง (danger บน danger-soft) วางบนการ์ดหรือแถว
    for (const tone of ['accent', 'danger', 'warning', 'success']) {
      for (const [groundName, ground] of Object.entries(grounds)) {
        it(`${tone} บน ${tone}-soft (ทับ ${groundName}) ≥ ${AA}`, () => {
          const background = composite(color(`${tone}-soft`), ground);
          expect(contrastRatio(color(tone), background)).toBeGreaterThanOrEqual(AA);
        });
      }
    }

    it(`ปุ่มหลัก: primary-foreground บน primary ≥ ${AA}`, () => {
      expect(contrastRatio(color('primary-foreground'), color('primary'))).toBeGreaterThanOrEqual(
        AA,
      );
    });

    it(`text-tertiary ใช้ได้เฉพาะข้อความใหญ่บน canvas ≥ ${AA_LARGE}`, () => {
      expect(contrastRatio(color('text-tertiary'), grounds.canvas)).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
    });
  });
}

describe('contrast helpers', () => {
  it('ดำบนขาว = 21 : 1 และสีเดียวกัน = 1 : 1', () => {
    expect(contrastRatio(parseColor('#000'), parseColor('#fff'))).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColor('#6e6e73'), parseColor('#6e6e73'))).toBe(1);
  });

  it('ตัวอย่างในบทเรียน: #86868b บนขาว ≈ 3.6 · #6e6e73 บนขาว ≈ 5.1', () => {
    expect(contrastRatio(parseColor('#86868b'), parseColor('#ffffff'))).toBeCloseTo(3.62, 1);
    expect(contrastRatio(parseColor('#6e6e73'), parseColor('#ffffff'))).toBeCloseTo(5.07, 1);
  });

  it('composite: ดำโปร่ง 50% บนขาว = เทากลาง', () => {
    expect(composite(parseColor('rgba(0, 0, 0, 0.5)'), parseColor('#ffffff'))).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
      a: 1,
    });
  });
});
