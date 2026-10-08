import { describe, expect, it } from 'vitest';
import {
  MAX_OCCURRENCES_PER_CALL,
  RecurrenceRuleError,
  fromFloating,
  isValidTimeZone,
  nextOccurrences,
  occurrencesBetween,
  parseRecurrenceRule,
  slotOnLocalDate,
  toFloating,
  type RecurrenceSpec,
} from './recurrence';

const utc = (iso: string) => new Date(iso);
const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

/** กฎ "ทุกวันที่ 31 เวลา 09:00 กรุงเทพฯ" เริ่ม 31 ม.ค. 2027 */
const monthly31: RecurrenceSpec = {
  rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
  startsAt: utc('2027-01-31T02:00:00Z'),
  timezone: 'Asia/Bangkok',
  end: { type: 'never' },
};

describe('RecurrenceEngine — เคสบังคับจากสเปก 6.1', () => {
  it('ทุกวันที่ 31 → เดือน ก.พ. ได้วันที่ 28 และวันที่ 29 ในปีอธิกสุรทิน', () => {
    const slots = occurrencesBetween(monthly31, null, utc('2027-05-01T00:00:00Z'));
    expect(iso(slots)).toEqual([
      '2027-01-31T02:00:00.000Z',
      '2027-02-28T02:00:00.000Z',
      '2027-03-31T02:00:00.000Z',
      '2027-04-30T02:00:00.000Z',
    ]);

    const leap = occurrencesBetween(
      monthly31,
      utc('2028-02-01T00:00:00Z'),
      utc('2028-03-01T00:00:00Z'),
    );
    expect(iso(leap)).toEqual(['2028-02-29T02:00:00.000Z']);
  });

  it('ทุกวัน 9 โมง Asia/Bangkok → 02:00 UTC เสมอ (ไทยไม่มี DST)', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=DAILY',
      startsAt: utc('2027-01-01T02:00:00Z'),
      timezone: 'Asia/Bangkok',
      end: { type: 'never' },
    };
    const slots = occurrencesBetween(spec, null, utc('2027-12-31T23:59:59Z'));
    expect(slots).toHaveLength(365);
    expect(slots.every((d) => d.getUTCHours() === 2 && d.getUTCMinutes() === 0)).toBe(true);
  });

  it('ทุกวัน 9 โมง America/New_York → 14:00 UTC ฤดูหนาว และ 13:00 UTC ฤดูร้อน', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=DAILY',
      startsAt: utc('2027-03-12T14:00:00Z'), // ศุกร์ 12 มี.ค. 09:00 EST
      timezone: 'America/New_York',
      end: { type: 'never' },
    };
    // DST ปี 2027 เริ่ม อาทิตย์ 14 มี.ค. 02:00
    const slots = occurrencesBetween(spec, null, utc('2027-03-16T23:00:00Z'));
    expect(iso(slots)).toEqual([
      '2027-03-12T14:00:00.000Z',
      '2027-03-13T14:00:00.000Z',
      '2027-03-14T13:00:00.000Z',
      '2027-03-15T13:00:00.000Z',
      '2027-03-16T13:00:00.000Z',
    ]);
    // และกลับเป็น 14:00 หลังสิ้นสุด DST (7 พ.ย. 2027)
    const autumn = occurrencesBetween(
      spec,
      utc('2027-11-05T00:00:00Z'),
      utc('2027-11-08T23:00:00Z'),
    );
    expect(iso(autumn)).toEqual([
      '2027-11-05T13:00:00.000Z',
      '2027-11-06T13:00:00.000Z',
      '2027-11-07T14:00:00.000Z',
      '2027-11-08T14:00:00.000Z',
    ]);
  });

  it('คำนวณช่วงเดิมซ้ำ → ได้ slot ชุดเดิมทุกครั้ง (พื้นฐานของ materialize ที่ idempotent)', () => {
    const until = utc('2027-12-31T00:00:00Z');
    expect(iso(occurrencesBetween(monthly31, null, until))).toEqual(
      iso(occurrencesBetween(monthly31, null, until)),
    );
  });

  it('เพิ่มวันเข้า exceptions → รอบนั้นไม่ถูกสร้าง', () => {
    const skipped = utc('2027-02-28T02:00:00Z');
    const slots = occurrencesBetween(
      { ...monthly31, exceptions: [skipped] },
      null,
      utc('2027-04-01T00:00:00Z'),
    );
    expect(iso(slots)).toEqual(['2027-01-31T02:00:00.000Z', '2027-03-31T02:00:00.000Z']);
  });

  it('endType=afterCount 5 → ไม่เกิน 5 รอบตลอดกาล แม้คำนวณแบ่งหลายช่วง', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=WEEKLY',
      startsAt: utc('2027-01-04T02:00:00Z'),
      timezone: 'Asia/Bangkok',
      end: { type: 'afterCount', maxCount: 5 },
    };
    const first = occurrencesBetween(spec, null, utc('2027-01-20T00:00:00Z'));
    const second = occurrencesBetween(
      spec,
      utc('2027-01-20T00:00:00Z'),
      utc('2030-01-01T00:00:00Z'),
    );
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(2);
    expect(iso(second).at(-1)).toBe('2027-02-01T02:00:00.000Z');
  });

  it('รอบที่ถูกลบ (exception) ยังนับรวมใน COUNT ตาม RFC 5545 — ลบรอบแล้วไม่มีรอบใหม่งอกมาแทน', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=DAILY',
      startsAt: utc('2027-01-01T02:00:00Z'),
      timezone: 'Asia/Bangkok',
      end: { type: 'afterCount', maxCount: 3 },
      exceptions: [utc('2027-01-02T02:00:00Z')],
    };
    expect(iso(occurrencesBetween(spec, null, utc('2027-02-01T00:00:00Z')))).toEqual([
      '2027-01-01T02:00:00.000Z',
      '2027-01-03T02:00:00.000Z',
    ]);
  });
});

describe('occurrencesBetween — ช่วงเวลาและเงื่อนไขสิ้นสุด', () => {
  it('ช่วง (a, b] ต่อกันแล้วได้ครบ ไม่ซ้ำ ไม่ขาด เทียบกับคำนวณรวดเดียว', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=DAILY',
      startsAt: utc('2027-03-01T14:00:00Z'),
      timezone: 'America/New_York',
      end: { type: 'never' },
    };
    const b = utc('2027-03-14T13:00:00Z'); // ตรงกับ slot พอดี → ต้องอยู่ช่วงแรกช่วงเดียว
    const c = utc('2027-04-01T00:00:00Z');
    const pieces = [...occurrencesBetween(spec, null, b), ...occurrencesBetween(spec, b, c)];
    expect(iso(pieces)).toEqual(iso(occurrencesBetween(spec, null, c)));
    expect(new Set(iso(pieces)).size).toBe(pieces.length);
  });

  it('endType=onDate → ไม่เกิน endsAt (รวมรอบที่ตรงกับ endsAt พอดี)', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=DAILY',
      startsAt: utc('2027-01-01T02:00:00Z'),
      timezone: 'Asia/Bangkok',
      end: { type: 'onDate', endsAt: utc('2027-01-03T02:00:00Z') },
    };
    expect(occurrencesBetween(spec, null, utc('2027-12-31T00:00:00Z'))).toHaveLength(3);
  });

  it('เริ่มนับจาก startsAt — ช่วงก่อนเริ่ม series ไม่มีรอบ', () => {
    expect(occurrencesBetween(monthly31, null, utc('2027-01-30T00:00:00Z'))).toEqual([]);
  });

  it('รายสัปดาห์หลายวัน (จันทร์ พุธ ศุกร์) ทุก 2 สัปดาห์', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR',
      startsAt: utc('2027-01-04T02:00:00Z'), // จันทร์
      timezone: 'Asia/Bangkok',
      end: { type: 'never' },
    };
    const days = occurrencesBetween(spec, null, utc('2027-01-31T00:00:00Z')).map((d) =>
      toFloating(d, 'Asia/Bangkok').toISOString().slice(0, 10),
    );
    expect(days).toEqual([
      '2027-01-04',
      '2027-01-06',
      '2027-01-08',
      '2027-01-18',
      '2027-01-20',
      '2027-01-22',
    ]);
  });

  it('MONTHLY ไม่ระบุ BYMONTHDAY แต่เริ่มวันที่ 31 → clamp เช่นกัน', () => {
    const slots = occurrencesBetween(
      { ...monthly31, rrule: 'FREQ=MONTHLY' },
      null,
      utc('2027-03-01T00:00:00Z'),
    );
    expect(iso(slots)).toEqual(['2027-01-31T02:00:00.000Z', '2027-02-28T02:00:00.000Z']);
  });

  it('YEARLY วันที่ 29 ก.พ. → ปีปกติได้ 28 ก.พ.', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=YEARLY',
      startsAt: utc('2028-02-29T02:00:00Z'),
      timezone: 'Asia/Bangkok',
      end: { type: 'never' },
    };
    const days = occurrencesBetween(spec, null, utc('2032-03-01T00:00:00Z')).map((d) =>
      toFloating(d, 'Asia/Bangkok').toISOString().slice(0, 10),
    );
    expect(days).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  });

  it('BYDAY แบบลำดับ ("ศุกร์สุดท้ายของเดือน") ใช้ได้และไม่ถูก clamp รบกวน', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=MONTHLY;BYDAY=-1FR',
      startsAt: utc('2027-01-29T02:00:00Z'),
      timezone: 'Asia/Bangkok',
      end: { type: 'never' },
    };
    const days = occurrencesBetween(spec, null, utc('2027-04-01T00:00:00Z')).map((d) =>
      toFloating(d, 'Asia/Bangkok').toISOString().slice(0, 10),
    );
    expect(days).toEqual(['2027-01-29', '2027-02-26', '2027-03-26']);
  });

  it('เวลาที่ไม่มีอยู่จริงตอนเข้า DST (02:30 New York) → เลื่อนไปเวลาที่มีจริง ไม่หายไปทั้งรอบ', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=DAILY',
      startsAt: utc('2027-03-13T07:30:00Z'), // 02:30 EST
      timezone: 'America/New_York',
      end: { type: 'never' },
    };
    const slots = occurrencesBetween(spec, null, utc('2027-03-15T23:00:00Z'));
    expect(slots).toHaveLength(3);
    const local = slots.map((d) => toFloating(d, 'America/New_York').toISOString().slice(0, 16));
    expect(local[0]).toBe('2027-03-13T02:30');
    expect(local[1]!.startsWith('2027-03-14')).toBe(true);
    expect(local[2]).toBe('2027-03-15T02:30');
  });

  it('ช่วงกว้างเกินขีดจำกัด → โยน error แทนที่จะคำนวณไม่จบ', () => {
    const spec: RecurrenceSpec = { ...monthly31, rrule: 'FREQ=DAILY' };
    expect(() => occurrencesBetween(spec, null, utc('2040-01-01T00:00:00Z'))).toThrow(
      RecurrenceRuleError,
    );
    expect(MAX_OCCURRENCES_PER_CALL).toBe(1000);
  });
});

describe('nextOccurrences — preview 10 รอบถัดไป', () => {
  it('คืน 10 รอบหลังเวลาที่ให้ ข้าม exceptions', () => {
    const preview = nextOccurrences(
      { ...monthly31, exceptions: [utc('2027-04-30T02:00:00Z')] },
      utc('2027-03-01T00:00:00Z'),
    );
    expect(preview).toHaveLength(10);
    expect(iso(preview).slice(0, 3)).toEqual([
      '2027-03-31T02:00:00.000Z',
      '2027-05-31T02:00:00.000Z',
      '2027-06-30T02:00:00.000Z',
    ]);
  });

  it('ไม่รวมรอบที่ตรงกับ after พอดี และหยุดที่เงื่อนไขสิ้นสุด', () => {
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=DAILY',
      startsAt: utc('2027-01-01T02:00:00Z'),
      timezone: 'Asia/Bangkok',
      end: { type: 'afterCount', maxCount: 4 },
    };
    expect(iso(nextOccurrences(spec, utc('2027-01-02T02:00:00Z')))).toEqual([
      '2027-01-03T02:00:00.000Z',
      '2027-01-04T02:00:00.000Z',
    ]);
    const onDate: RecurrenceSpec = {
      ...spec,
      end: { type: 'onDate', endsAt: utc('2027-01-02T12:00:00Z') },
    };
    expect(nextOccurrences(onDate, utc('2026-12-01T00:00:00Z'))).toHaveLength(2);
  });

  it('after ก่อน startsAt → เริ่มที่รอบแรก', () => {
    expect(iso(nextOccurrences(monthly31, utc('2020-01-01T00:00:00Z'), 1))).toEqual([
      '2027-01-31T02:00:00.000Z',
    ]);
  });

  it('limit นอกช่วง 1–100 → error', () => {
    expect(() => nextOccurrences(monthly31, utc('2027-01-01T00:00:00Z'), 0)).toThrow(
      RecurrenceRuleError,
    );
    expect(() => nextOccurrences(monthly31, utc('2027-01-01T00:00:00Z'), 101)).toThrow(
      RecurrenceRuleError,
    );
  });
});

describe('slotOnLocalDate — หา slot จากวันที่ที่ผู้ใช้เลือก', () => {
  it('ใช้วันที่ตามโซนของ rule ไม่ใช่วันที่ UTC', () => {
    // 09:00 โตเกียว = 00:00 UTC วันเดียวกัน · 07:00 โตเกียว = 22:00 UTC "เมื่อวาน"
    const spec: RecurrenceSpec = {
      rrule: 'FREQ=DAILY',
      startsAt: utc('2026-12-31T22:00:00Z'),
      timezone: 'Asia/Tokyo',
      end: { type: 'never' },
    };
    expect(slotOnLocalDate(spec, '2027-01-05')?.toISOString()).toBe('2027-01-04T22:00:00.000Z');
  });

  it('วันที่ไม่มีรอบ → null · รูปแบบผิด → error', () => {
    expect(slotOnLocalDate(monthly31, '2027-02-15')).toBeNull();
    expect(slotOnLocalDate(monthly31, '2027-02-28')?.toISOString()).toBe(
      '2027-02-28T02:00:00.000Z',
    );
    expect(() => slotOnLocalDate(monthly31, '28/02/2027')).toThrow(RecurrenceRuleError);
  });

  it('หา slot ได้แม้วันนั้นอยู่ใน exceptions แล้ว (ลบซ้ำต้อง idempotent)', () => {
    const slot = utc('2027-02-28T02:00:00Z');
    expect(slotOnLocalDate({ ...monthly31, exceptions: [slot] }, '2027-02-28')?.toISOString()).toBe(
      slot.toISOString(),
    );
  });
});

describe('parseRecurrenceRule — ตรวจ input', () => {
  it.each([
    ['FREQ=HOURLY', 'รองรับเฉพาะ'],
    ['FREQ=DAILY;COUNT=3', 'ห้ามมี'],
    ['FREQ=DAILY;UNTIL=20270101T000000Z', 'ห้ามมี'],
    ['DTSTART=20270101T000000Z;FREQ=DAILY', 'ห้ามมี'],
    ['FREQ=DAILY;BYHOUR=9', 'ห้ามมี'],
    ['FREQ=DAILY;INTERVAL=0', 'INTERVAL'],
    ['BYDAY=MO', 'รองรับเฉพาะ'],
    ['', 'ต้องระบุ'],
  ])('ปฏิเสธ %j', (rrule, message) => {
    expect(() => parseRecurrenceRule(rrule)).toThrow(message);
  });

  it('ยอมรับ prefix "RRULE:" และตัวพิมพ์เล็ก', () => {
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;BYDAY=MO').interval ?? 1).toBe(1);
    expect(() => parseRecurrenceRule('freq=daily')).not.toThrow();
  });

  it('timezone / startsAt / maxCount ผิด → RecurrenceRuleError', () => {
    expect(isValidTimeZone('Asia/Bangkok')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    const until = utc('2027-02-01T00:00:00Z');
    expect(() =>
      occurrencesBetween({ ...monthly31, timezone: 'Mars/Olympus' }, null, until),
    ).toThrow('timezone');
    expect(() =>
      occurrencesBetween({ ...monthly31, startsAt: new Date('x') }, null, until),
    ).toThrow('startsAt');
    expect(() =>
      occurrencesBetween({ ...monthly31, end: { type: 'afterCount', maxCount: 0 } }, null, until),
    ).toThrow('maxCount');
  });
});

describe('toFloating / fromFloating', () => {
  // ไม่รวม 01:00–01:59 ของวันออกจาก DST: เวลาหน้าปัดนั้นเกิดสองครั้ง แปลงกลับได้ค่าเดียวโดยธรรมชาติ
  it('ไป-กลับได้ค่าเดิม รวมช่วงข้าม DST', () => {
    for (const at of [
      '2027-03-14T06:59:00Z',
      '2027-03-14T07:00:00Z',
      '2027-11-07T04:30:00Z',
      '2027-11-07T07:30:00Z',
    ]) {
      const d = utc(at);
      expect(
        fromFloating(toFloating(d, 'America/New_York'), 'America/New_York').toISOString(),
      ).toBe(d.toISOString());
    }
  });
});
