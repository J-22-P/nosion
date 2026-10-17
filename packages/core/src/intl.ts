/**
 * Intl formatter แบบแคช — สร้าง `Intl.DateTimeFormat` / `NumberFormat` ใหม่แพงราว 60 µs ต่อครั้ง
 * (ต้องโหลดข้อมูล locale + timezone) แต่ `.format()` ของตัวที่สร้างแล้วใช้ไม่ถึง 1 µs
 *
 * หน้า Tasks เรียกหาวันที่/เลยกำหนดหลายครั้งต่องานหนึ่งรายการต่อการ render หนึ่งรอบ
 * บนมือถือที่ CPU ช้า 4 เท่า ตัวนี้ตัวเดียวกิน long task ระดับร้อย ms (TBT ของ Lighthouse · Phase 8)
 *
 * key = locale + options · จำนวน key จำกัดอยู่แล้ว (โซนเวลาของผู้ใช้ × รูปแบบที่โค้ดใช้) จึงไม่ต้องมีการลบออก
 */
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();

export function dateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = dateFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, f);
  }
  return f;
}

export function numberFormat(
  locale: string,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, f);
  }
  return f;
}
