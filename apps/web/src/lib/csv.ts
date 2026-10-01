/**
 * CSV ตาม RFC 4180 — ช่องที่มี , " หรือขึ้นบรรทัดใหม่ต้องครอบด้วย " และ " ข้างในกลายเป็น ""
 * ขึ้นต้นด้วย BOM (U+FEFF) ไม่งั้น Excel เปิดภาษาไทยเป็นตัวอ่านไม่ออก
 * ช่องที่ขึ้นต้นด้วย = + - @ ใส่ ' นำหน้า กันสูตรรันเองตอนเปิดใน Excel (CSV injection)
 * — ยกเว้นตัวเลขติดลบล้วน เช่น -145.00 ที่เป็นข้อมูลจริง
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined): string => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

/** ให้เบราว์เซอร์ดาวน์โหลดไฟล์ — สร้าง object URL ชั่วคราวแล้วคืนหน่วยความจำ */
export function downloadText(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
