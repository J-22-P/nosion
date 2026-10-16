/**
 * สัปดาห์ ISO 8601 ↔ วันจันทร์ — pure (สเปก 7.3 `?week=2026-W32`)
 * ทำงานกับ 'YYYY-MM-DD' ล้วน (วันบนปฏิทินของผู้ใช้) ไม่ใช่จุดเวลา
 * กติกา ISO: สัปดาห์เริ่มวันจันทร์ · W1 = สัปดาห์ที่มีวันที่ 4 มกราคม (= มีวันพฤหัสแรกของปี)
 */
const DAY = 86_400_000;
const asDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(new Date(asDate(s).getTime() + n * DAY));

/** วันจันทร์ของสัปดาห์ที่มีวันนั้น */
export function mondayOf(day: string): string {
  return addDays(day, -((asDate(day).getUTCDay() + 6) % 7));
}

/** '2026-10-16' → '2026-W42' (ปีของสัปดาห์อาจไม่ใช่ปีของวันที่ เช่น 2027-01-01 → 2026-W53) */
export function isoWeekOf(day: string): string {
  const thursday = addDays(mondayOf(day), 3);
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor((asDate(thursday).getTime() - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** '2026-W42' → วันจันทร์ '2026-10-12' · สัปดาห์ที่ไม่มีจริง (W53 ของปีที่มี 52) → RangeError */
export function mondayOfIsoWeek(week: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new RangeError(`สัปดาห์ไม่ถูกต้อง: ${week}`);
  const year = Number(m[1]);
  const monday = addDays(mondayOf(`${year}-01-04`), (Number(m[2]) - 1) * 7);
  if (isoWeekOf(monday) !== week) throw new RangeError(`ปี ${year} ไม่มีสัปดาห์ W${m[2]}`);
  return monday;
}

export function shiftWeek(week: string, n: number): string {
  return isoWeekOf(addDays(mondayOfIsoWeek(week), n * 7));
}

export { addDays };
