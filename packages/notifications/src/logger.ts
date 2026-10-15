/**
 * logger ที่แพ็กเกจนี้ใช้ — ผู้ใช้ส่งตัวจริงเข้ามา (worker: pino · API: Logger ของ Nest)
 * รูปแบบเดียวกับ pino (object ก่อน ข้อความทีหลัง) เพื่อให้ log มีโครงสร้างค้นได้
 */
export interface NotifyLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object, msg?: string): void;
}

const fallback: NotifyLogger = {
  info: (obj, msg) => console.warn(msg ?? '', obj),
  warn: (obj, msg) => console.warn(msg ?? '', obj),
  error: (obj, msg) => console.error(msg ?? '', obj),
};

export let logger: NotifyLogger = fallback;

/** เรียกครั้งเดียวตอนเริ่มโปรแกรม */
export function configureNotifyLogger(next: NotifyLogger): void {
  logger = next;
}
