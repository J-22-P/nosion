import type { SyncResult } from '@nosion/contracts';
import { tr } from '@/i18n/current';

const KNOWN_FIELDS = new Set([
  'title',
  'description',
  'status',
  'priority',
  'occurredAt',
  'isAllDay',
  'projectId',
]);

export const fieldLabel = (field: string): string =>
  KNOWN_FIELDS.has(field)
    ? tr(`syncUi.field.${field}`)
    : field.startsWith('payload.')
      ? field.slice('payload.'.length)
      : field;

export interface SyncSummary {
  /** applied + merged */
  saved: number;
  conflicts: { title: string; fields: string[] }[];
  /** รายการถูกลบจากที่อื่นก่อน — operation ไม่ทำ (ลบชนะ) */
  deleted: number;
  errors: string[];
}

/** ผลจาก /sync/push → สิ่งที่ต้องบอกผู้ใช้ (pure — เทสต์ได้โดยไม่ต้องมี toast) */
export function summarizeResults(results: SyncResult[]): SyncSummary {
  const summary: SyncSummary = { saved: 0, conflicts: [], deleted: 0, errors: [] };
  for (const r of results) {
    if (r.status === 'applied' || r.status === 'merged') summary.saved++;
    else if (r.status === 'deleted') summary.deleted++;
    else if (r.status === 'error') summary.errors.push(r.error ?? tr('syncUi.processFailed'));
    else
      summary.conflicts.push({
        title: r.entry?.title ?? '',
        fields: (r.conflicts ?? []).map((c) => fieldLabel(c.field)),
      });
  }
  return summary;
}
