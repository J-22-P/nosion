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

/**
 * สีโปร่งทับพื้น แล้วปัดเป็น 8 บิตต่อช่อง — แบบเดียวกับที่เบราว์เซอร์วาดลงจอและที่ axe วัด
 * (ไม่ปัด = ได้ 4.51 แต่ axe วัดได้ 4.49 แล้วล้ม)
 */
const onScreen = (top: Rgba, ground: Rgba): Rgba => {
  const c = composite(top, ground);
  return { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b), a: 1 };
};
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
          const background = onScreen(color(`${tone}-soft`), ground);
          expect(contrastRatio(color(tone), background)).toBeGreaterThanOrEqual(AA);
        });
      }
    }

    // kbd, status pill, input วันที่ และแถวที่ hover: ข้อความรองบน hover-wash ที่ทับพื้นทุกชั้น
    // (hover-wash โปร่ง → ต้อง composite ก่อน · เคยตกที่ 4.0–4.3 แล้ว axe จับได้ใน e2e)
    for (const text of ['text-primary', 'text-secondary']) {
      for (const [groundName, ground] of Object.entries(grounds)) {
        it(`${text} บน hover-wash (ทับ ${groundName}) ≥ ${AA}`, () => {
          const background = onScreen(color('hover-wash'), ground);
          expect(contrastRatio(color(text), background)).toBeGreaterThanOrEqual(AA);
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

describe('สีกราฟ (--chart-1..6)', () => {
  it('ครบ 6 slot ทั้งสองธีม', () => {
    for (const tokens of Object.values(THEMES)) {
      for (let i = 1; i <= 6; i++) expect(tokens[`chart-${i}`]).toBeDefined();
    }
  });

  // ขั้นเทาต้องเรียงความเด่นจริง: ช่อง 1 ตัดกับพื้นมากสุด แล้วลดลงทีละขั้นทั้งสองธีม
  // (ถ้าสลับลำดับ แท่งซ้อน/ตารางจะอ่านลำดับผิด)
  for (const [theme, tokens] of Object.entries(THEMES)) {
    it(`${theme}: contrast กับ surface ลดลงทีละช่อง 1 → 6 และช่อง 1 ≥ 4.5`, () => {
      const ratios = [1, 2, 3, 4, 5, 6].map((i) =>
        contrastRatio(parseColor(tokens[`chart-${i}`]!), parseColor(tokens.surface!)),
      );
      expect(ratios[0]).toBeGreaterThanOrEqual(4.5);
      for (let i = 1; i < 6; i++) expect(ratios[i]).toBeLessThan(ratios[i - 1]!);
    });
  }
});

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
