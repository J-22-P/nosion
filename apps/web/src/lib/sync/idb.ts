/**
 * เปิด IndexedDB แบบมีเวลาจำกัด — `indexedDB.open` บางครั้ง **ค้างเงียบ** ไม่ success ไม่ error
 * (Safari รอบแรกหลังอัปเดต · ดิสก์ใกล้เต็มแล้วเบราว์เซอร์จำกัด quota · แท็บอื่นถือ connection รุ่นเก่า)
 * แอปห้ามรอตลอดไป → เกินเวลาให้ถือว่าใช้ไม่ได้ ผู้เรียกถอยไปทางสำรอง (หน่วยความจำ / ไม่มีแคช)
 */
export function openDb(
  factory: IDBFactory,
  name: string,
  upgrade: (db: IDBDatabase) => void,
  timeoutMs = 2_000,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`เปิด IndexedDB "${name}" ไม่ทันเวลา`)),
      timeoutMs,
    );
    const req = factory.open(name, 1);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
  });
}
