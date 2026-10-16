import type { EntryDto, SyncOperationInput } from '@nosion/contracts';
import { localId } from './offline';

export interface PendingView {
  /** รายการที่สร้างตอนออฟไลน์ (ยังไม่ถึง server) — ภาพหลังทำทุก operation ในคิวที่อ้างถึงมัน */
  created: EntryDto[];
  /** id ของรายการที่มี operation ค้างอยู่ (รวม `local:<clientId>`) → จุด "รอซิงก์" */
  touched: ReadonlySet<string>;
}

function blank(id: string, at: string): EntryDto {
  return {
    id,
    module: 'task',
    title: '',
    description: null,
    status: 'pending',
    priority: 'none',
    occurredAt: null,
    isAllDay: true,
    completedAt: null,
    payload: {},
    projectId: null,
    parentId: null,
    recurrenceRuleId: null,
    tags: [],
    sortOrder: 0,
    version: 1,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

/**
 * คิว outbox → สิ่งที่ UI ต้องแสดง (pure)
 * รายการที่สร้างตอนออฟไลน์ไม่อยู่ในแคชของ query (ไม่เคยมาจาก server) จึงประกอบจากคิวเอง:
 * create/parse ให้กำเนิด → update/complete/delete ที่อ้าง clientId เดียวกันแก้ภาพต่อตามลำดับ
 * parse ใช้ข้อความดิบเป็นชื่อ — server จะ parse จริงตอนซิงก์ (วัน/จำนวนเงินจะตามมาหลังซิงก์)
 */
export function pendingView(queue: readonly SyncOperationInput[]): PendingView {
  const created = new Map<string, EntryDto>();
  const touched = new Set<string>();
  const idOf = (target: { id?: string; clientId?: string }) =>
    target.id ?? localId(target.clientId!);

  for (const op of queue) {
    switch (op.op) {
      case 'create': {
        const id = localId(op.data.clientId);
        const d = op.data;
        created.set(id, {
          ...blank(id, op.at),
          module: d.module,
          title: d.title,
          description: d.description ?? null,
          status: d.status ?? 'pending',
          priority: d.priority ?? 'none',
          occurredAt: typeof d.occurredAt === 'string' ? d.occurredAt : null,
          isAllDay: d.isAllDay ?? true,
          payload: d.payload ?? {},
          projectId: d.projectId ?? null,
        });
        touched.add(id);
        break;
      }
      case 'parse': {
        const id = localId(op.clientId);
        created.set(id, {
          ...blank(id, op.at),
          module: op.module ?? 'task',
          title: op.text.trim(),
          payload: op.payloadPatch ?? {},
        });
        touched.add(id);
        break;
      }
      default: {
        const id = idOf(op.target);
        touched.add(id);
        const local = created.get(id);
        if (!local) break;
        if (op.op === 'delete') created.delete(id);
        else if (op.op === 'complete') {
          created.set(id, { ...local, status: 'done', completedAt: op.at });
        } else if (op.op === 'update') {
          created.set(id, { ...local, ...(op.data as Partial<EntryDto>) });
        }
      }
    }
  }
  return { created: [...created.values()], touched };
}
