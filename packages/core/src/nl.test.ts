import { describe, expect, it } from 'vitest';
import { parseNaturalText, type NlResult } from './nl';

/** ศุกร์ 16 ต.ค. 2026 เวลา 10:00 น. ตามเวลาไทย */
const ctx = { now: new Date('2026-10-16T03:00:00Z'), timeZone: 'Asia/Bangkok', weekStartsOn: 1 };

type View = Pick<
  NlResult,
  | 'title'
  | 'date'
  | 'time'
  | 'rrule'
  | 'priority'
  | 'tags'
  | 'project'
  | 'amount'
  | 'durationMinutes'
  | 'quantities'
>;

const DEFAULTS: Omit<View, 'title'> = {
  date: null,
  time: null,
  rrule: null,
  priority: null,
  tags: [],
  project: null,
  amount: null,
  durationMinutes: null,
  quantities: [],
};

function view(r: NlResult): View {
  const { title, date, time, rrule, priority, tags, project, amount, durationMinutes, quantities } =
    r;
  return { title, date, time, rrule, priority, tags, project, amount, durationMinutes, quantities };
}

/** เพิ่มเคสใหม่ = เพิ่ม 1 บรรทัด · ฟิลด์ที่ไม่ระบุต้องเป็นค่าว่าง (กันการกินคำเกิน) */
const CASES: [string, Partial<View> & { title: string }][] = [
  // ── ตัวอย่างในสเปก 6.4 ──
  ['กาแฟ 65', { title: 'กาแฟ', amount: '65' }],
  [
    'ค่าเน็ต 799 ทุกวันที่ 5',
    { title: 'ค่าเน็ต', amount: '799', rrule: 'FREQ=MONTHLY;BYMONTHDAY=5', date: '2026-11-05' },
  ],
  [
    'fix login bug พรุ่งนี้ 5 โมง !high',
    { title: 'fix login bug', date: '2026-10-17', time: '17:00', priority: 'high' },
  ],
  [
    'วิ่ง 5km 30 นาที',
    { title: 'วิ่ง', durationMinutes: 30, quantities: [{ value: 5, unit: 'km' }] },
  ],
  [
    'ดื่มน้ำ 8 แก้ว ทุกวัน',
    {
      title: 'ดื่มน้ำ',
      quantities: [{ value: 8, unit: 'แก้ว' }],
      rrule: 'FREQ=DAILY',
      date: '2026-10-16',
    },
  ],

  // ── วันที่แบบสัมพัทธ์ ──
  ['ส่งรายงานพรุ่งนี้', { title: 'ส่งรายงาน', date: '2026-10-17' }],
  ['ทำการบ้าน !ด่วน มะรืน', { title: 'ทำการบ้าน', priority: 'urgent', date: '2026-10-18' }],
  ['ทำงานเมื่อวาน', { title: 'ทำงาน', date: '2026-10-15' }],
  ['เตรียมสไลด์วันนี้', { title: 'เตรียมสไลด์', date: '2026-10-16' }],
  ['meeting tomorrow 5pm', { title: 'meeting', date: '2026-10-17', time: '17:00' }],
  ['report today', { title: 'report', date: '2026-10-16' }],
  ['จ่ายบัตร สิ้นเดือน', { title: 'จ่ายบัตร', date: '2026-10-31' }],
  ['วางแผน สัปดาห์หน้า', { title: 'วางแผน', date: '2026-10-19' }],
  ['ประชุม เดือนหน้า', { title: 'ประชุม', date: '2026-11-01' }],
  ['plan next week', { title: 'plan', date: '2026-10-19' }],

  // ── วันในสัปดาห์ (วันนี้ = ศุกร์) ──
  ['ประชุมทีม วันจันทร์ 10:00', { title: 'ประชุมทีม', date: '2026-10-19', time: '10:00' }],
  ['ประชุมวันพุธ', { title: 'ประชุม', date: '2026-10-21' }],
  ['ส่งงาน ศุกร์นี้', { title: 'ส่งงาน', date: '2026-10-16' }],
  ['ส่งงาน ศุกร์หน้า', { title: 'ส่งงาน', date: '2026-10-23' }],
  ['สรุปงาน วันอาทิตย์หน้า', { title: 'สรุปงาน', date: '2026-10-25' }],
  ['ไปทะเล อาทิตย์หน้า', { title: 'ไปทะเล', date: '2026-10-19' }],
  ['next friday demo', { title: 'demo', date: '2026-10-23' }],
  ['on monday review', { title: 'review', date: '2026-10-19' }],
  ['พระจันทร์ เต็มดวง', { title: 'พระจันทร์ เต็มดวง' }],

  // ── วันที่ชัดเจน ──
  ['จ่ายค่าห้อง วันที่ 1', { title: 'จ่ายค่าห้อง', date: '2026-11-01' }],
  ['วันที่ 16', { title: '', date: '2026-10-16' }],
  ['นัดหมอ 20 ต.ค.', { title: 'นัดหมอ', date: '2026-10-20' }],
  ['นัดหมอ 20 ตุลาคม 2569', { title: 'นัดหมอ', date: '2026-10-20' }],
  ['ไปญี่ปุ่น 3 ม.ค.', { title: 'ไปญี่ปุ่น', date: '2027-01-03' }],
  ['สอบ 5 ก.ย 70', { title: 'สอบ', date: '2027-09-05' }],
  ['tax 15/9', { title: 'tax', date: '2027-09-15' }],
  ['tax 15/9/2026', { title: 'tax', date: '2026-09-15' }],
  ['party 25 dec', { title: 'party', date: '2026-12-25' }],
  ['dec 25 party', { title: 'party', date: '2026-12-25' }],
  ['March 3rd 2027 trip', { title: 'trip', date: '2027-03-03' }],
  ['เลขไทย ๑๕ ต.ค.', { title: 'เลขไทย', date: '2027-10-15' }],
  ['ประชุม 31/2', { title: 'ประชุม 31/2' }],
  ['ส่งของ 1 ธ.ค. 10 โมง', { title: 'ส่งของ', date: '2026-12-01', time: '10:00' }],

  // ── เวลา (ตอนนี้ 10:00 — เวลาที่เลยแล้วโดยไม่ระบุวัน = พรุ่งนี้) ──
  ['call mom at 7:30pm', { title: 'call mom', date: '2026-10-16', time: '19:30' }],
  ['standup 9am', { title: 'standup', date: '2026-10-17', time: '09:00' }],
  ['lunch noon', { title: 'lunch', date: '2026-10-16', time: '12:00' }],
  ['ส่งงาน บ่าย 2', { title: 'ส่งงาน', date: '2026-10-16', time: '14:00' }],
  ['ประชุม บ่ายโมงครึ่ง', { title: 'ประชุม', date: '2026-10-16', time: '13:30' }],
  ['กินข้าว 2 ทุ่ม', { title: 'กินข้าว', date: '2026-10-16', time: '20:00' }],
  ['ตื่น ตี 5 พรุ่งนี้', { title: 'ตื่น', date: '2026-10-17', time: '05:00' }],
  ['วิ่ง 6 โมงเช้า', { title: 'วิ่ง', date: '2026-10-17', time: '06:00' }],
  ['ซื้อของ 4 โมงเย็น', { title: 'ซื้อของ', date: '2026-10-16', time: '16:00' }],
  ['โทรหาลูกค้า 10 โมงครึ่ง', { title: 'โทรหาลูกค้า', date: '2026-10-16', time: '10:30' }],
  ['ประชุม 14.30 น.', { title: 'ประชุม', date: '2026-10-16', time: '14:30' }],
  ['สัมภาษณ์ เวลา15:00', { title: 'สัมภาษณ์', date: '2026-10-16', time: '15:00' }],
  ['นอน เที่ยงคืน', { title: 'นอน', date: '2026-10-17', time: '00:00' }],

  // ── การเกิดซ้ำ ──
  ['gym every monday', { title: 'gym', rrule: 'FREQ=WEEKLY;BYDAY=MO', date: '2026-10-19' }],
  [
    'ประชุม ทุกวันจันทร์ 9 โมง',
    { title: 'ประชุม', rrule: 'FREQ=WEEKLY;BYDAY=MO', date: '2026-10-19', time: '09:00' },
  ],
  [
    'ทุกจันทร์ พุธ ศุกร์ วิ่ง',
    { title: 'วิ่ง', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', date: '2026-10-16' },
  ],
  [
    'ล้างรถ ทุกเสาร์อาทิตย์',
    { title: 'ล้างรถ', rrule: 'FREQ=WEEKLY;BYDAY=SA,SU', date: '2026-10-17' },
  ],
  [
    'standup weekdays 10:30',
    {
      title: 'standup',
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      date: '2026-10-16',
      time: '10:30',
    },
  ],
  ['ประชุมใหญ่ ทุกอาทิตย์', { title: 'ประชุมใหญ่', rrule: 'FREQ=WEEKLY', date: '2026-10-16' }],
  ['ตัดผม ทุก 2 สัปดาห์', { title: 'ตัดผม', rrule: 'FREQ=WEEKLY;INTERVAL=2', date: '2026-10-16' }],
  [
    'every 3 days water plants',
    { title: 'water plants', rrule: 'FREQ=DAILY;INTERVAL=3', date: '2026-10-16' },
  ],
  ['ต่อภาษีรถ ทุกปี 1 ธ.ค.', { title: 'ต่อภาษีรถ', rrule: 'FREQ=YEARLY', date: '2026-12-01' }],
  [
    'netflix 419 monthly',
    { title: 'netflix', amount: '419', rrule: 'FREQ=MONTHLY', date: '2026-10-16' },
  ],
  [
    'ค่าน้ำ 150 ทุกเดือนวันที่ 31',
    { title: 'ค่าน้ำ', amount: '150', rrule: 'FREQ=MONTHLY;BYMONTHDAY=31', date: '2026-10-31' },
  ],
  [
    'every day at 8:00 meditate',
    { title: 'meditate', rrule: 'FREQ=DAILY', date: '2026-10-17', time: '08:00' },
  ],
  [
    'อ่านหนังสือ 30 นาที ทุกวัน 2 ทุ่ม',
    {
      title: 'อ่านหนังสือ',
      durationMinutes: 30,
      rrule: 'FREQ=DAILY',
      date: '2026-10-16',
      time: '20:00',
    },
  ],
  [
    'ผ่อนรถ 8500 ทุกวันที่ 25 #car',
    {
      title: 'ผ่อนรถ',
      amount: '8500',
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=25',
      date: '2026-10-25',
      tags: ['car'],
    },
  ],
  [
    'จ่ายประกัน ทุกวันที่ 16 9 โมง',
    { title: 'จ่ายประกัน', rrule: 'FREQ=MONTHLY;BYMONTHDAY=16', date: '2026-11-16', time: '09:00' },
  ],

  // ── จำนวนเงิน / ปริมาณ ──
  ['ค่าไฟ 1,250.50 บาท', { title: 'ค่าไฟ', amount: '1,250.50' }],
  ['฿120 ชาไข่มุก', { title: 'ชาไข่มุก', amount: '120' }],
  ['เงินเดือน +45000', { title: 'เงินเดือน', amount: '45000' }],
  ['iphone 15 pro 35900', { title: 'iphone 15 pro', amount: '35900' }],
  ['ซื้อ 2 ขวด 50 บาท', { title: 'ซื้อ', amount: '50', quantities: [{ value: 2, unit: 'ขวด' }] }],
  ['yoga 1 ชม.', { title: 'yoga', durationMinutes: 60 }],
  [
    'run 5 km tomorrow 6am',
    { title: 'run', quantities: [{ value: 5, unit: 'km' }], date: '2026-10-17', time: '06:00' },
  ],
  ['ไปเที่ยว ais5g', { title: 'ไปเที่ยว ais5g' }],

  // ── สัญลักษณ์ ──
  [
    'เขียน blog #writing +side-project',
    { title: 'เขียน blog', tags: ['writing'], project: 'side-project' },
  ],
  ['deploy !!!', { title: 'deploy', priority: 'urgent' }],
  ['review PR !!', { title: 'review PR', priority: 'high' }],
  ['C# tutorial', { title: 'C# tutorial' }],
  ['1+1 quiz', { title: '1+1 quiz' }],
  ['!important note', { title: '!important note' }],
  ['#a #A #b', { title: '', tags: ['a', 'b'] }],
  ['   ', { title: '' }],
];

describe('parseNaturalText — table-driven', () => {
  it('มีอย่างน้อย 60 เคส (สเปก 15 Phase 5)', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(60);
  });

  it.each(CASES)('%s', (input, expected) => {
    expect(view(parseNaturalText(input, ctx))).toEqual({ ...DEFAULTS, ...expected });
  });
});

describe('parseNaturalText — รายละเอียด', () => {
  it('occurredAt เป็น UTC ของเวลาหน้าปัดผู้ใช้ · ไม่มีเวลา = ทั้งวัน', () => {
    const timed = parseNaturalText('ประชุม พรุ่งนี้ 5 โมง', ctx);
    expect(timed.occurredAt?.toISOString()).toBe('2026-10-17T10:00:00.000Z');
    expect(timed.isAllDay).toBe(false);

    const allDay = parseNaturalText('ส่งงาน พรุ่งนี้', ctx);
    expect(allDay.occurredAt?.toISOString()).toBe('2026-10-16T17:00:00.000Z');
    expect(allDay.isAllDay).toBe(true);

    expect(parseNaturalText('กาแฟ 65', ctx).occurredAt).toBeNull();
  });

  it('"พรุ่งนี้" เป็นของผู้ใช้ ไม่ใช่ของ server — 23:30 ที่ New York ยังเป็นวันเดิม', () => {
    const ny = { now: new Date('2026-10-17T03:30:00Z'), timeZone: 'America/New_York' };
    const r = parseNaturalText('call tomorrow 9am', ny);
    expect(r.date).toBe('2026-10-17');
    expect(r.occurredAt?.toISOString()).toBe('2026-10-17T13:00:00.000Z');
  });

  it('token ชี้ตำแหน่งในข้อความเดิมได้ตรง (ใช้ highlight ใน ⌘K)', () => {
    const input = 'จ่ายค่าเน็ต 799 บาท ทุกวันที่ 5 #บ้าน';
    const r = parseNaturalText(input, ctx);
    for (const t of r.tokens) expect(input.slice(t.start, t.end)).toBe(t.raw);
    expect(r.tokens.map((t) => [t.kind, t.raw])).toEqual([
      ['amount', '799 บาท'],
      ['recurrence', 'ทุกวันที่ 5'],
      ['tag', '#บ้าน'],
    ]);
  });

  it('รายรับ: "+" นำหน้าตัวเลข', () => {
    expect(parseNaturalText('โบนัส +5000', ctx).income).toBe(true);
    expect(parseNaturalText('กาแฟ 65', ctx).income).toBe(false);
  });

  it('สัปดาห์เริ่มวันอาทิตย์ → "ศุกร์หน้า" ยังเป็นศุกร์สัปดาห์หน้าเหมือนกัน แต่ "สัปดาห์หน้า" = อาทิตย์', () => {
    const sunday = { ...ctx, weekStartsOn: 0 };
    expect(parseNaturalText('x สัปดาห์หน้า', sunday).date).toBe('2026-10-18');
    expect(parseNaturalText('x ศุกร์หน้า', sunday).date).toBe('2026-10-23');
  });

  it('วันที่ 31 ในเดือนที่ไม่มี 31 → วันสุดท้ายของเดือน (ADR-010)', () => {
    const nov = { ...ctx, now: new Date('2026-11-02T03:00:00Z') };
    expect(parseNaturalText('ค่าห้อง ทุกวันที่ 31', nov).date).toBe('2026-11-30');
  });
});
