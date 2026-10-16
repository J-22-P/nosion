import type { SyncOperationInput, SyncPushDto, SyncResult } from '@nosion/contracts';
import { ApiError } from '@/lib/api-client';
import type { OutboxStorage } from './outbox-storage';

/** ต่อคำขอ — ตรงกับเพดานของ POST /sync/push */
const BATCH = 100;

export interface SyncState {
  /** จำนวน operation ที่รอส่ง (ของผู้ใช้ปัจจุบัน) */
  pending: number;
  status: 'idle' | 'syncing' | 'offline' | 'error';
  lastSyncedAt: string | null;
  lastError: string | null;
}

/** operation ที่ยังไม่มี opId/at — engine เติมให้ตอนเข้าคิว */
export type NewSyncOperation = SyncOperationInput extends infer T
  ? T extends SyncOperationInput
    ? Omit<T, 'opId' | 'at'>
    : never
  : never;

export interface SyncEngineDeps {
  storage: OutboxStorage;
  push: (operations: SyncOperationInput[]) => Promise<SyncPushDto>;
  isOnline: () => boolean;
  newId?: () => string;
  now?: () => Date;
}

/**
 * ตัวซิงก์ (สเปก 8.6 · Phase 7 ขั้น 2) — คิว operation ที่ทำตอนออฟไลน์ แล้วส่งเป็นชุดเมื่อเน็ตกลับมา
 *
 *  - ส่งตามลำดับที่ทำ ครั้งละ 100 · ทีละรอบ (single-flight) — เรียก flush ซ้อนกันได้ผลรอบเดียวกัน
 *  - ลบออกจากคิวเมื่อ server ตอบผลแล้วเท่านั้น (applied/merged/conflict/deleted/error ล้วนเป็นคำตอบสุดท้าย)
 *  - เน็ตหลุดกลางทาง / 5xx / 401 / 429 → คิวอยู่ครบ รอบหน้าส่งชุดเดิมซ้ำ — server ตัดซ้ำด้วย opId
 *  - 4xx อื่น (เช่น 422 ทั้งชุด) = ส่งซ้ำก็ได้ผลเดิม → ทิ้งแล้วรายงานเป็น error กันคิวค้างตลอดไป
 * engine ไม่รู้จัก React/toast/แคช — ผลส่งออกทาง listener ให้ชั้น UI ตัดสินใจเอง
 */
export class SyncEngine {
  private state: SyncState = { pending: 0, status: 'idle', lastSyncedAt: null, lastError: null };
  private userId: string | null = null;
  private running: Promise<void> | null = null;
  private readonly stateListeners = new Set<(state: SyncState) => void>();
  private readonly resultListeners = new Set<(results: SyncResult[]) => void>();
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(private readonly deps: SyncEngineDeps) {
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.now = deps.now ?? (() => new Date());
  }

  getState = (): SyncState => this.state;

  subscribe = (listener: (state: SyncState) => void): (() => void) => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };

  onResults(listener: (results: SyncResult[]) => void): () => void {
    this.resultListeners.add(listener);
    return () => this.resultListeners.delete(listener);
  }

  /** ผูกกับผู้ใช้ที่ล็อกอิน — นับคิวของคนนั้นใหม่ (null = ออกจากระบบ: คิวยังอยู่ในเครื่อง รอเจ้าของกลับมา) */
  async setUser(userId: string | null): Promise<void> {
    this.userId = userId;
    const pending = userId ? await this.deps.storage.count(userId) : 0;
    if (this.userId === userId) this.set({ pending });
  }

  async enqueue(op: NewSyncOperation): Promise<SyncOperationInput> {
    if (!this.userId) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
    const full = { ...op, opId: this.newId(), at: this.now().toISOString() } as SyncOperationInput;
    await this.deps.storage.add({
      userId: this.userId,
      op: full,
      createdAt: this.now().toISOString(),
    });
    this.set({
      pending: this.state.pending + 1,
      ...(this.deps.isOnline() ? {} : { status: 'offline' }),
    });
    return full;
  }

  flush(): Promise<void> {
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain(): Promise<void> {
    const userId = this.userId;
    if (!userId) return;
    if (!this.deps.isOnline()) {
      if (this.state.pending) this.set({ status: 'offline' });
      return;
    }
    const results: SyncResult[] = [];
    try {
      for (;;) {
        const batch = await this.deps.storage.list(userId, BATCH);
        if (!batch.length || this.userId !== userId) break;
        this.set({ status: 'syncing' });
        try {
          const res = await this.deps.push(batch.map((r) => r.op));
          results.push(...res.results);
        } catch (err) {
          if (!isPermanent(err)) {
            this.set({
              status: this.deps.isOnline() ? 'error' : 'offline',
              lastError: describe(err),
            });
            return;
          }
          // ส่งซ้ำก็ถูกปฏิเสธแบบเดิม — ทิ้งทั้งชุดแล้วรายงานรายตัว
          results.push(
            ...batch.map((r): SyncResult => ({
              opId: r.op.opId,
              status: 'error',
              error: describe(err),
            })),
          );
        }
        await this.deps.storage.remove(batch.map((r) => r.seq));
        this.set({ pending: Math.max(0, this.state.pending - batch.length) });
      }
      this.set({ status: 'idle', lastSyncedAt: this.now().toISOString(), lastError: null });
    } finally {
      // นับจากที่เก็บจริงอีกรอบ — ระหว่างส่งอาจมีการเข้าคิวเพิ่ม (แท็บนี้หรือแท็บอื่น)
      if (this.userId === userId) this.set({ pending: await this.deps.storage.count(userId) });
      if (results.length) for (const listener of this.resultListeners) listener(results);
    }
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.stateListeners) listener(this.state);
  }
}

/** เน็ตหลุด = fetch โยน TypeError (ไม่ได้คำตอบจาก server เลย) — ต่างจาก ApiError ที่ server ตอบมาแล้ว */
export function isNetworkError(err: unknown): boolean {
  return !(err instanceof ApiError) && err instanceof TypeError;
}

/** 4xx ที่ส่งซ้ำก็ได้ผลเดิม · ยกเว้น 401 (รอ token ใหม่) 408 429 (รอแล้วลองใหม่) */
function isPermanent(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status >= 400 &&
    err.status < 500 &&
    ![401, 408, 429].includes(err.status)
  );
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (isNetworkError(err)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
  return 'ซิงก์ไม่สำเร็จ';
}
