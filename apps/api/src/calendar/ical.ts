import type { CalendarEventDto } from '@nosion/contracts';

/**
 * iCalendar (RFC 5545) จาก event ของปฏิทินรวม — pure function ไม่แตะฐานข้อมูล
 * subscribe ได้ใน Google Calendar / Apple Calendar / Outlook (สเปก 6.3 "iCal Export")
 *
 * กับดักของรูปแบบนี้:
 *  - บรรทัดต้องจบด้วย CRLF และยาวไม่เกิน 75 **octet** — ไทยหนึ่งตัว = 3 byte ใน UTF-8 จึงตัดตามจำนวนตัวอักษรไม่ได้
 *  - ข้อความต้อง escape `\` `;` `,` และขึ้นบรรทัดใหม่
 *  - รายการทั้งวันใช้ `VALUE=DATE` (ไม่มีโซนเวลา) และ DTEND เป็น **วันถัดไป** (exclusive)
 */

export interface IcalOptions {
  name: string;
  timeZone: string;
  /** DTSTAMP — ใส่จากข้างนอกเพื่อให้ทดสอบได้ */
  now: Date;
}

const CRLF = '\r\n';

export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** พับบรรทัดที่ยาวเกิน 75 byte — ต่อบรรทัดด้วย CRLF + ช่องว่าง โดยไม่ตัดกลางตัวอักษร UTF-8 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  // บรรทัดต่อมีช่องว่างนำหน้า 1 byte จึงเหลือที่ 74
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

const utcStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const dateValue = (ymd: string) => ymd.replace(/-/g, '');

function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** UID คงที่ข้ามการ sync — รอบของกฎใช้ ruleId + slot เพื่อให้รอบ projected กับตอนถูกสร้างจริงเป็นตัวเดียวกัน */
export function eventUid(event: CalendarEventDto): string {
  const base = event.ruleId ? `${event.ruleId}-${Date.parse(event.start)}` : event.id;
  return `${base.replace(/[^\w.-]/g, '-')}@nosion`;
}

export function buildIcal(events: CalendarEventDto[], options: IcalOptions): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NOSION//Calendar Feed//TH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.name)}`,
    `X-WR-TIMEZONE:${options.timeZone}`,
    // ขอให้ client ดึงใหม่ทุกชั่วโมง (Google ไม่สนค่านี้ — ดึงตามรอบของตัวเอง)
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const stamp = utcStamp(options.now);

  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${eventUid(event)}`, `DTSTAMP:${stamp}`);
    if (event.allDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${dateValue(event.date)}`,
        `DTEND;VALUE=DATE:${dateValue(nextDay(event.date))}`,
      );
    } else {
      lines.push(`DTSTART:${utcStamp(new Date(event.start))}`);
      if (event.end) lines.push(`DTEND:${utcStamp(new Date(event.end))}`);
    }
    lines.push(`SUMMARY:${escapeText(event.status === 'done' ? `✓ ${event.title}` : event.title)}`);
    lines.push(`CATEGORIES:${event.module.toUpperCase()}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
