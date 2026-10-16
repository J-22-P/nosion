import type { SyncOperationInput } from '@nosion/contracts';
import { describe, expect, it } from 'vitest';
import { pendingView } from './pending';

const at = '2026-10-16T10:00:00.000Z';
let n = 0;
const op = (o: Record<string, unknown>) => ({ opId: `op-${++n}`, at, ...o }) as SyncOperationInput;

describe('pendingView', () => {
  it('create/parse → รายการชั่วคราว (local:<clientId>) · operation ต่อจากนั้นแก้ภาพตามลำดับ', () => {
    const view = pendingView([
      op({ op: 'create', data: { module: 'task', title: 'A', clientId: 'a', priority: 'high' } }),
      op({ op: 'parse', text: ' กาแฟ 65 ', module: 'expense', clientId: 'b' }),
      op({ op: 'parse', text: 'ลบทิ้ง', clientId: 'c' }),
      op({ op: 'update', target: { clientId: 'a' }, data: { title: 'A2' }, base: {} }),
      op({ op: 'complete', target: { clientId: 'b' } }),
      op({ op: 'delete', target: { clientId: 'c' } }),
    ]);
    expect(view.created.map((e) => [e.id, e.module, e.title, e.status, e.priority])).toEqual([
      ['local:a', 'task', 'A2', 'pending', 'high'],
      ['local:b', 'expense', 'กาแฟ 65', 'done', 'none'],
    ]);
    expect([...view.touched].sort()).toEqual(['local:a', 'local:b', 'local:c']);
  });

  it('operation กับรายการจริง → แค่ทำเครื่องหมายรอซิงก์ ไม่สร้างรายการชั่วคราว', () => {
    const view = pendingView([
      op({ op: 'complete', target: { id: 'e1' } }),
      op({ op: 'defer', target: { id: 'e2' }, to: 'tomorrow' }),
    ]);
    expect(view.created).toEqual([]);
    expect([...view.touched]).toEqual(['e1', 'e2']);
  });
});
