import type { SyncOperationInput } from '@nosion/contracts';

/** operation หนึ่งตัวที่รอส่ง — seq เรียงตามเวลาที่ทำ (ลำดับสำคัญ: แก้รายการที่สร้างตอนออฟไลน์ต้องตามหลังการสร้าง) */
export interface OutboxRecord {
  seq: number;
  /** ของใครก็ส่งด้วย token ของคนนั้นเท่านั้น — ออกจากระบบแล้วคนอื่นเข้า จะไม่ส่งของคนก่อนไปปน */
  userId: string;
  op: SyncOperationInput;
  createdAt: string;
}

export interface OutboxStorage {
  add(record: Omit<OutboxRecord, 'seq'>): Promise<OutboxRecord>;
  /** เรียงตาม seq · เฉพาะของผู้ใช้คนนี้ */
  list(userId: string, limit?: number): Promise<OutboxRecord[]>;
  count(userId: string): Promise<number>;
  remove(seqs: number[]): Promise<void>;
}

/** ใช้ในเทสต์ และสำรองเมื่อเบราว์เซอร์ไม่มี IndexedDB (เช่น private mode บางตัว) — หายเมื่อปิดแท็บ */
export function memoryOutbox(): OutboxStorage {
  const records: OutboxRecord[] = [];
  let seq = 0;
  return {
    add: async (record) => {
      const saved = { ...record, seq: ++seq };
      records.push(saved);
      return saved;
    },
    list: async (userId, limit = Infinity) =>
      records.filter((r) => r.userId === userId).slice(0, limit),
    count: async (userId) => records.filter((r) => r.userId === userId).length,
    remove: async (seqs) => {
      const gone = new Set(seqs);
      for (let i = records.length - 1; i >= 0; i--)
        if (gone.has(records[i]!.seq)) records.splice(i, 1);
    },
  };
}

const DB_NAME = 'nosion-sync';
const STORE = 'outbox';

/**
 * outbox ใน IndexedDB — อยู่รอดข้ามการรีเฟรช/ปิดเบราว์เซอร์ (localStorage เขียนแบบ sync บล็อก UI และจำกัด ~5MB)
 * เขียนเองด้วย API ดิบ ~50 บรรทัด แทนการเพิ่ม dependency (idb ฯลฯ) — ใช้แค่ add/list/count/delete
 */
export function indexedDbOutbox(factory: IDBFactory = indexedDB): OutboxStorage {
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
        store.createIndex('userId', 'userId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));

  async function run<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T> | void,
  ): Promise<T> {
    const tx = (await open()).transaction(STORE, mode);
    const req = work(tx.objectStore(STORE));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    add: async (record) => {
      const seq = await run('readwrite', (s) => s.add(record));
      return { ...record, seq: seq as number };
    },
    // index ตาม userId ได้ผลเรียงตาม primary key (seq) ภายใน key เดียวกัน
    list: (userId, limit) =>
      run('readonly', (s) => s.index('userId').getAll(IDBKeyRange.only(userId), limit)),
    count: (userId) => run('readonly', (s) => s.index('userId').count(IDBKeyRange.only(userId))),
    remove: (seqs) =>
      run('readwrite', (s) => {
        for (const seq of seqs) s.delete(seq);
      }),
  };
}
