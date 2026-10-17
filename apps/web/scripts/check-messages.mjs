#!/usr/bin/env node
/**
 * ตรวจข้อความแปล (Phase 8 ขั้น 6) — รันใน `pnpm --filter @nosion/web test:i18n` และใน CI
 *  1. th.json กับ en.json มี key ชุดเดียวกันพอดี (ไม่มีภาษาไหนขาด)
 *  2. key ที่โค้ดเรียก (`tr('a.b')` · `t('b')` ใต้ `useTranslations('a')`) มีอยู่จริง
 *     key แบบ template (`tr(\`rb.unit.${x}\`)`) ตรวจว่ามี namespace นั้น
 *  3. ICU ของทั้งสองภาษา parse ได้ และใช้ตัวแปรชุดเดียวกัน
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntlMessageFormat } from 'intl-messageformat';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (l) => JSON.parse(readFileSync(join(root, 'messages', `${l}.json`), 'utf8'));
const th = load('th');
const en = load('en');

/** { 'a.b.c': 'ข้อความ' } */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const flatTh = flatten(th);
const flatEn = flatten(en);
const errors = [];

for (const key of Object.keys(flatTh)) if (!(key in flatEn)) errors.push(`en ขาด ${key}`);
for (const key of Object.keys(flatEn)) if (!(key in flatTh)) errors.push(`th ขาด ${key}`);

/** ชื่อตัวแปรใน ICU message (รวมใน plural/select ซ้อน) */
function argsOf(message, locale) {
  const names = new Set();
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.value && typeof n.value === 'string' && n.type !== 0) names.add(n.value);
      if (n.options) for (const o of Object.values(n.options)) walk(o.value);
      if (n.children) walk(n.children);
    }
  };
  walk(new IntlMessageFormat(message, locale, undefined, { ignoreTag: false }).getAst());
  return names;
}
for (const [key, message] of Object.entries(flatTh)) {
  if (!(key in flatEn)) continue;
  try {
    const a = argsOf(message, 'th');
    const b = argsOf(flatEn[key], 'en');
    // ภาษาไทยไม่มีพหูพจน์ — อังกฤษอาจใช้ตัวแปรเดียวกันใน plural ได้ แต่ต้องไม่มีตัวแปรที่อีกภาษาไม่ส่งมา
    const missing = [...b].filter((x) => !a.has(x));
    const extra = [...a].filter((x) => !b.has(x));
    if (missing.length || extra.length) {
      errors.push(`ตัวแปรไม่ตรงกันที่ ${key}: th[${[...a]}] en[${[...b]}]`);
    }
  } catch (err) {
    errors.push(`ICU ผิดที่ ${key}: ${err.message}`);
  }
}

// ── key ที่โค้ดเรียกใช้ ─────────────────────────────
function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) yield p;
  }
}
const hasNamespace = (prefix) => Object.keys(flatTh).some((k) => k.startsWith(`${prefix}.`));

let checked = 0;
for (const file of files(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);
  for (const m of src.matchAll(/\btr(?:\.rich)?\(\s*'([^']+)'/g)) {
    checked++;
    if (!(m[1] in flatTh)) errors.push(`${rel}: ไม่มี key '${m[1]}'`);
  }
  for (const m of src.matchAll(/\btr(?:\.rich)?\(\s*`([^`$]+)\$\{/g)) {
    checked++;
    const prefix = m[1].replace(/\.$/, '');
    if (!hasNamespace(prefix)) errors.push(`${rel}: ไม่มี namespace '${prefix}'`);
  }
  // useTranslations('ns') + t('key') ในไฟล์เดียวกัน — ตัวแปรชื่ออื่น (tNav ฯลฯ) จับคู่ตามชื่อ
  const bindings = [...src.matchAll(/const (\w+) = useTranslations\('([^']+)'\)/g)].map((m) => ({
    name: m[1],
    ns: m[2],
  }));
  for (const { name, ns } of bindings) {
    const call = new RegExp(`\\b${name}(?:\\.rich)?\\(\\s*'([^']+)'`, 'g');
    for (const m of src.matchAll(call)) {
      checked++;
      // ไฟล์เดียวอาจมีหลาย component ที่ใช้ชื่อ t คนละ namespace — ผ่านถ้ามีในอย่างน้อยหนึ่ง namespace ของชื่อนี้
      const candidates = bindings.filter((b) => b.name === name).map((b) => `${b.ns}.${m[1]}`);
      if (!candidates.some((k) => k in flatTh)) errors.push(`${rel}: ไม่มี key '${candidates[0]}'`);
    }
    const tpl = new RegExp(`\\b${name}(?:\\.rich)?\\(\\s*\`([^\`$]+)\\$\\{`, 'g');
    for (const m of src.matchAll(tpl)) {
      checked++;
      const prefix = `${ns}.${m[1].replace(/\.$/, '')}`;
      if (!hasNamespace(prefix)) errors.push(`${rel}: ไม่มี namespace '${prefix}'`);
    }
  }
}

if (errors.length) {
  console.error(`✗ ข้อความแปลมีปัญหา ${errors.length} จุด:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `✓ ${Object.keys(flatTh).length} ข้อความ · th/en ตรงกัน · ตรวจการเรียกใช้ ${checked} จุด`,
);
