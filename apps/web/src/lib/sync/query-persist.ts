import {
  dehydrate,
  hydrate,
  type DehydratedState,
  type Query,
  type QueryClient,
} from '@tanstack/react-query';

/**
 * เก็บแคชของ TanStack Query ลง IndexedDB → เปิดแอปตอนออฟไลน์แล้วเห็นข้อมูลล่าสุด (สเปก 8.6 · Phase 7 ขั้น 3)
 * เขียนเองด้วย dehydrate/hydrate ที่มากับ react-query (ไม่เพิ่ม @tanstack/query-persist-client)
 *  - เก็บเฉพาะ query ที่สำเร็จ · ตัด preview ของ parser / ค้นหา / push (ชั่วคราวหรือผูกกับเครื่อง)
 *  - hydrate ทับเฉพาะเมื่อข้อมูลที่เก็บใหม่กว่าในแคช (กติกาของ hydrate เอง) — ออนไลน์อยู่ก็ไม่ทับของสด
 *  - อายุ 7 วัน · BUSTER เปลี่ยนเมื่อรูปร่างข้อมูลเปลี่ยนแบบเข้ากันไม่ได้
 */
const DB_NAME = 'nosion-cache';
const STORE = 'kv';
const KEY = 'query-cache';
const BUSTER = 'v1';
const MAX_AGE_MS = 7 * 86_400_000;
const SAVE_DELAY_MS = 1_000;
const SKIP = new Set(['parse', 'push', 'calendar-feed']);

interface Saved {
  buster: string;
  savedAt: number;
  state: DehydratedState;
}

export interface KvStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export function indexedDbKv(factory: IDBFactory = indexedDB): KvStorage {
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const run = async <T>(
    mode: IDBTransactionMode,
    work: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const tx = (await open()).transaction(STORE, mode);
    const req = work(tx.objectStore(STORE));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (key) => run('readonly', (s) => s.get(key)),
    set: async (key, value) => void (await run('readwrite', (s) => s.put(value, key))),
    remove: async (key) => void (await run('readwrite', (s) => s.delete(key))),
  };
}

export const shouldPersist = (query: Query): boolean =>
  query.state.status === 'success' &&
  !SKIP.has(String(query.queryKey[0])) &&
  !(query.queryKey[0] === 'entries' && query.queryKey[1] === 'search');

let restored: Promise<void> = Promise.resolve();
let wipe: () => Promise<void> = async () => undefined;

/** query ที่ต้องรอแคชจากดิสก์ก่อนตัดสินใจ (session ตอนออฟไลน์) await ตัวนี้ */
export const whenRestored = (): Promise<void> => restored;
/** ออกจากระบบ — ลบแคชบนดิสก์ (ข้อมูลของคนก่อนต้องไม่ค้างในเครื่อง) */
export const wipePersistedQueries = (): Promise<void> => wipe();

export function persistQueryClient(
  queryClient: QueryClient,
  storage: KvStorage = indexedDbKv(),
  now: () => number = Date.now,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const save = () => {
    timer = null;
    const state = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersist });
    const value: Saved = { buster: BUSTER, savedAt: now(), state };
    storage.set(KEY, value).catch(() => undefined); // ดิสก์เต็ม/ถูกบล็อก — แอปยังใช้ได้ แค่ไม่มีแคชออฟไลน์
  };
  const schedule = () => {
    if (!stopped && !timer) timer = setTimeout(save, SAVE_DELAY_MS);
  };

  let unsubscribe = () => {};
  restored = storage
    .get(KEY)
    .then((raw) => {
      const saved = raw as Saved | undefined;
      if (saved?.buster === BUSTER && now() - saved.savedAt < MAX_AGE_MS) {
        hydrate(queryClient, saved.state);
      }
    })
    .catch(() => undefined)
    .finally(() => {
      if (!stopped) unsubscribe = queryClient.getQueryCache().subscribe(schedule);
    });

  wipe = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    await storage.remove(KEY).catch(() => undefined);
  };

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
