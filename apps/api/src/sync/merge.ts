import type { SyncEditableFields, SyncFieldConflict } from '@nosion/contracts';

/**
 * ตัดสิน conflict ระดับ field ของ operation `update` จาก outbox (สเปก 7.4) — pure
 *
 * server ไม่มีประวัติการแก้รายฟิลด์ จึงใช้ "ค่าก่อนแก้ของ client" (`base`) แทน:
 *  - ค่าบน server ตอนนี้ **เท่ากับ base** → ไม่มีใครแก้ field นี้ระหว่างที่ client ออฟไลน์ → ใช้ค่าของ client
 *  - ค่าบน server ตอนนี้ **เท่ากับค่าของ client** → แก้ตรงกันอยู่แล้ว (เช่น ติ๊กเสร็จจากสองเครื่อง) → ไม่ใช่ conflict
 *  - นอกนั้น = แก้ field เดียวกันคนละค่า → **server ชนะ** แล้วรายงาน diff ให้ UI แสดง
 * payload เทียบทีละ key (แก้ amountMinor กับ category คนละเครื่องรวมกันได้)
 */
export interface MergeOutcome {
  /** field ที่จะเขียน (เฉพาะที่ client ชนะ) */
  apply: SyncEditableFields;
  conflicts: SyncFieldConflict[];
}

/** เทียบค่าแบบโครงสร้าง (JSON) — ลำดับ key ของ object ไม่มีผล */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) =>
    sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** occurredAt: เทียบเป็นจุดเวลา ("…+07:00" กับ "…Z" ที่เป็นเวลาเดียวกันคือค่าเดียวกัน) */
function sameField(field: string, a: unknown, b: unknown): boolean {
  if (field === 'occurredAt' && typeof a === 'string' && typeof b === 'string') {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb;
  }
  return sameValue(a, b);
}

export function mergeFields(
  server: SyncEditableFields,
  client: SyncEditableFields,
  base: SyncEditableFields,
): MergeOutcome {
  const apply: SyncEditableFields = {};
  const conflicts: SyncFieldConflict[] = [];

  const decide = (
    field: string,
    serverValue: unknown,
    clientValue: unknown,
    baseValue: unknown,
  ) => {
    if (sameField(field, serverValue, clientValue)) return 'same' as const;
    if (baseValue === undefined || sameField(field, serverValue, baseValue))
      return 'client' as const;
    conflicts.push({ field, client: clientValue, server: serverValue });
    return 'server' as const;
  };

  for (const [field, clientValue] of Object.entries(client) as [
    keyof SyncEditableFields,
    unknown,
  ][]) {
    if (field === 'payload') continue;
    if (decide(field, server[field], clientValue, base[field]) === 'client') {
      (apply as Record<string, unknown>)[field] = clientValue;
    }
  }

  if (client.payload) {
    const serverPayload = server.payload ?? {};
    const basePayload = base.payload ?? {};
    const merged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(client.payload)) {
      if (decide(`payload.${key}`, serverPayload[key], value, basePayload[key]) === 'client') {
        merged[key] = value;
      }
    }
    // เขียน payload ทั้งก้อน (ค่าบน server + key ที่ client ชนะ) — payload validate ทั้งก้อนด้วย schema ของโมดูล
    if (Object.keys(merged).length) apply.payload = { ...serverPayload, ...merged };
  }

  return { apply, conflicts };
}
