# Phase 6 · Habit (สัปดาห์ 15) ⭐ — ตัด Workout

> เป้าหมายที่แท้จริง: **พิสูจน์สถาปัตยกรรม** — เพิ่มโมดูลใหม่แล้ว Today, Calendar, Review, ⌘K รองรับทันทีโดยแก้ `core/` 0 บรรทัด (สเปก 15 Phase 6)
> **ขอบเขตใหม่ (เจ้าของสั่ง 16 ต.ค. 2026):** ทำเฉพาะ **HabitModule** · ตัด WorkoutModule — เมนู "ออกกำลังกาย" คงไว้เป็น "เร็ว ๆ นี้"
> (ตรงกับทางตัดในสเปก: "Phase 6 (เหลือแค่ Habit)") · ทำต่อ Phase 7 → 8
> **DoD (ปรับ):** เขียนใน README ได้ว่า _"เพิ่มโมดูลใหม่ (Habit ≈ N บรรทัด) โดยแก้โค้ดใน `core/` 0 บรรทัด — Today, Calendar, Review, ⌘K รองรับทันทีโดยอัตโนมัติ"_

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                                                | Commit    | สถานะ |
| --- | --------------------------------------------------------------------------------------------------- | --------- | ----- |
| 1   | API: HabitModule — trackable (Today/Calendar/Week/NL) · streak · `/habits` (list, increment, check) | `02e62c5` | ✅    |
| 2   | เว็บ: หน้า `/habits` + สร้างนิสัย · เปิด/ปิดโมดูลในหน้าตั้งค่า · เมนู                               | `02e62c5` | ✅    |
| 3   | การ์ดนิสัยในหน้า Today (count −1/+1 · check · before_time) + นิสัยบนปฏิทิน                          | `02e62c5` | ✅    |
| 4   | Weekly Review รวมทุกโมดูล — `GET /review/weekly` + หน้า `/review`                                   | —         | ⬜    |
| 5   | demo มีนิสัย · นับบรรทัดที่แก้ใน `core/` · README                                                   | —         | ⬜    |
| 6   | บท learn 19 + ADR-013                                                                               | —         | ⬜    |

**การออกแบบหลัก:** นิสัยหนึ่งตัว = **กฎการเกิดซ้ำ** (template `module: habit`) · หนึ่งรอบ (วัน) = **entry** ที่ถือ `currentValue` ของวันนั้น
→ ใช้ Recurrence Engine (Phase 3), การเตือน (Phase 4), ปฏิทิน / ⌘K / parser (Phase 5) ที่มีอยู่ทั้งหมด

---

## ขั้น 1–3 · HabitModule (API) + หน้า `/habits` + การ์ด Today — `02e62c5`

**สิ่งที่เปลี่ยน**

- 📁 `apps/api/src/modules/habit/` (655 บรรทัด + เทสต์ 208)
  - `habit.trackable.ts` — `@RegisterModule()` · Today: เฉพาะรอบของวันนี้ ("ทำแล้ว 2 จาก 4") + `data.habits` ให้เว็บวาดปุ่ม ·
    ปฏิทิน: ชื่อ + ความคืบหน้า ("ดื่มน้ำ 5/8 แก้ว"), นับจำนวน = ลิงก์ "บันทึกจำนวน" · check = checkbox (ใช้ `calendarActions` เดิม ไม่เพิ่มชนิดใน core) ·
    สรุปสัปดาห์: อัตราความสำเร็จ (ข้ามโดยตั้งใจไม่นับ) · parser: ดูด้านล่าง
  - `habit-text.ts` — "ดื่มน้ำ 8 แก้ว ทุกวัน" → นับ 8 แก้ว · "นอนก่อน 23:45 ทุกวัน" → before_time · "วิ่ง 3 ครั้งต่อสัปดาห์" → weekly เป้า 3 ·
    มีเวลานัด (ไม่มี "ก่อน") = น่าจะเป็นงาน → ความมั่นใจลด · มีเงิน = ไม่ใช่นิสัย · รอบแรก = เที่ยงคืนของวันตามโซนผู้ใช้
  - `habit-streak.ts` (pure) — นับบน "รอบ" ไม่ใช่ทุกวันในปฏิทิน · ข้ามโดยตั้งใจไม่ตัด · **วันนี้ยังไม่ทำไม่ตัด** · รายสัปดาห์นับสัปดาห์ที่ครบเป้า
  - `habits.service.ts` / `controller` — `GET /habits` (นิสัย + รอบวันนี้ + streak + แถบ 7 วัน ใน 2 query) · `POST /habits/:id/increment` · `POST /habits/:id/check`
  - `AppModule` +1 import (2 บรรทัด) — **`core/` (apps/api/src/core + packages/core) 0 บรรทัด · entries/ calendar/ parse/ 0 บรรทัด**
- 📁 `packages/contracts/src/habits.ts` — `HabitDto`, `HabitListDto`, schema ของ increment/check
- 📁 เว็บ `features/habits/` — หน้า `/habits`: สร้างด้วยประโยคเดียว (chip จาก parser · `/parse/commit` `module: habit`) หรือฟอร์มละเอียด
  (`POST /recurrence-rules` template นิสัย) · การ์ดต่อนิสัย: ปุ่มตาม kind, 🔥 streak, แถบ 7 วัน (✓ × – บอกด้วยรูปทรงไม่พึ่งสี), หยุดไว้ก่อน / ลบ ·
  ยังไม่เปิดโมดูล = การ์ด "เปิดใช้นิสัย"
- การ์ดนิสัยในหน้า Today ลงทะเบียนใน `WIDGET_VIEW` (หน้า Today ไม่รู้จักโมดูล) · `features/settings/modules-card.tsx` เปิด/ปิดโมดูล
  (Workout = "เร็ว ๆ นี้" กดไม่ได้) · เมนู "นิสัย" เปิดใช้

**การตัดสินใจ**

- **นิสัย = กฎการเกิดซ้ำ, หนึ่งวัน = entry** — ได้ materialize ล่วงหน้า, การเตือน, ปฏิทิน, iCal, ⌘K, หยุด/ลบ จาก Phase 3–5 ฟรี ·
  ไม่ต้องมีตาราง habits แยก (ADR-003 JSONB payload)
- ทำครบ = `status: done` **หรือ** `currentValue ≥ targetValue` — ติ๊กจากปฏิทิน (`/entries/:id/complete` ตัวกลาง) ก็นับว่าครบ
- **+1 แบบ atomic ใน SQL** — `UPDATE … SET payload = jsonb_set(…, currentValue + 1)` ให้ Postgres คำนวณจากแถวล่าสุดภายใต้ row lock ·
  รุ่นแรก (อ่าน → คำนวณใน Node → เขียนด้วยเงื่อนไข version + retry 3 รอบ) **นับหายเมื่อกด +1 พร้อมกัน 8 ครั้ง** — integration test จับได้
- รวม `/habits/streaks` ของสเปกไว้ใน `GET /habits` — หน้าเดียวใช้ข้อมูลทั้งสองพร้อมกัน ลดคำขอ
- โมดูลใหม่ปิดไว้เป็นค่าเริ่มต้น (`enabledModules` เดิม `[task, expense]`) — เปิดเองที่หน้าตั้งค่าหรือการ์ดในหน้านิสัย

**วิธีตรวจ**

- unit: streak 7 · trackable/parser 7 (ตัวอย่างสเปก "ดื่มน้ำ 8 แก้ว ทุกวัน" ชนะงาน · before_time รอบแรกเป็นทั้งวัน · weekly · งานมีเวลายังเป็นงาน)
- integration `test/habits.int-spec.ts` 5 เคส: **โมดูลปิด → parser ไม่เสนอนิสัย · เปิดแล้วเสนอ** (registry + enabledModules) ·
  สร้างจาก ⌘K → รอบวันนี้ · **+1 พร้อมกัน 8 ครั้ง = 8** · −1 ไม่ต่ำกว่า 0 · streak 1 · check + **Today/ปฏิทินเห็นนิสัยโดยไม่แก้โค้ดของหน้าเหล่านั้น** ·
  weekly · ของคนอื่น 404 · 422 — API 108 + worker 19 ผ่าน
- e2e (mock) 4 เคส + axe หน้า `/habits` ทั้ง 2 ธีม — UI suite 48/48 · ดูภาพหน้า `/habits` และ Today แล้ว · `pnpm verify` exit 0
- ⚠️ **visual baseline ยังไม่ได้สร้างใหม่** (หน้า Today มีการ์ดนิสัย, หน้าตั้งค่ามีการ์ดโมดูล → ภาพเดิมไม่ตรง) — รอพื้นที่ดิสก์บนเครื่อง (ด้านล่าง)

**เจอระหว่างทาง (เครื่อง dev)**

- Docker Desktop ตอบ 500 ทุกคำสั่ง → ย้ายไป **colima** · VM ของ colima ดับ (`The virtual machine is no longer live`) แต่ hostagent ยังค้าง
  `colima stop` จึง ssh เข้า VM ที่ตายแล้วรอไม่จบ · แก้: `pkill -f limactl` แล้ว start ใหม่ (CPU 4 · RAM 8 GiB) · ดิสก์ Mac เหลือ 7.5 GB (97%)
  — น่าจะเป็นเหตุให้ VM ดับ · ข้อมูลเก่าของ Docker Desktop 22 GB
- Docker Desktop เปิดขึ้นมาเองแล้วเปลี่ยน docker context กลับเป็น `desktop-linux` — ต้อง `docker context use colima`

---

## ขั้น 4 · Weekly Review รวมทุกโมดูล — `0fd0354`

- 📁 `apps/api/src/entries/review/` — `GET /review/weekly?week=2026-W42` · entry ทุกโมดูลของสัปดาห์ใน query เดียว
  ("ของสัปดาห์นี้" = เกิดในสัปดาห์ **หรือ** ทำเสร็จในสัปดาห์) แล้ว `summarizeWeek()` ของแต่ละโมดูล · ส่วนหนึ่งพังไม่ลากทั้งหน้า (`failedModules`)
  · ไม่มีชื่อโมดูลในไฟล์ (เหมือน Today) · `iso-week.ts` (pure): วันที่ ↔ สัปดาห์ ISO รวมข้ามปี (2027-01-01 = 2026-W53) · สัปดาห์ที่ไม่มีจริง 422
- 📁 `packages/contracts/src/review.ts` · เว็บ `features/review/` หน้า `/review` — การ์ดต่อโมดูล (stats + highlights) · ‹ สัปดาห์นี้ › ผ่าน `?week=` · เมนูเปิดใช้
- **บั๊กที่ integration จับได้:** ส่วนของนิสัยนับรอบล่วงหน้าของวันที่ยังมาไม่ถึง (materialize แล้ว) เป็น "ยังไม่ทำ" → กลางสัปดาห์ได้ 1/7 แทน 1/1 ·
  แก้ใน `HabitTrackableModule.summarizeWeek` ให้นับเฉพาะรอบถึงวันนี้
- ตรวจ: unit ISO week 3 · integration 2 (งาน/การเงิน/นิสัยครบ เรียงตาม order · สัปดาห์ก่อนว่าง · previous/next ต่อกัน · 422) — API 110 + worker 19 ·
  e2e: axe `/review` 2 ธีม + เลื่อนสัปดาห์ — UI 51/51 · `pnpm verify` exit 0

---

## ขั้น 5 · demo มีนิสัย · นับบรรทัดที่แก้ใน `core/` · README — (รอ commit)

- 📁 `auth/demo/` — นิสัย 4 ตัว (ดื่มน้ำ 5/8 · อ่านหนังสือทำแล้ว · นอนก่อน 23:45 · วิ่ง 3 ครั้ง/สัปดาห์) พร้อมประวัติ 14 วัน + รอบล่วงหน้า 7 วัน ·
  `materializedUntil` ตั้งตามรอบสุดท้าย — cron/ปุ่ม Materialize สร้างต่อเองเหมือนกฎของผู้ใช้จริง · บัญชี demo เปิดโมดูลนิสัยให้
- **ตัวเลขพิสูจน์สถาปัตยกรรม** (`git diff --numstat ca4f3e4` — ก่อนเริ่ม Phase 6):
  | ส่วน                                             | บรรทัด                                                             |
  | ------------------------------------------------ | ------------------------------------------------------------------ |
  | `apps/api/src/core` + `packages/core/src`        | **0**                                                              |
  | `AppModule`                                      | +2 (import + ลงทะเบียน)                                            |
  | `entries/` `calendar/` `parse/` เพื่อรองรับนิสัย | 0 (`today.module.ts` +5 เป็นของ Weekly Review ซึ่งเป็นฟีเจอร์ใหม่) |
  | HabitModule (API)                                | 662 · เทสต์ 213 unit + 175 integration                             |
  | เว็บ `features/habits`                           | 832 (หน้า `/habits` + การ์ด Today — UI ของโมดูลเป็นของโมดูล)       |
- README: สถานะ Phase 0–6 · สิ่งที่ใช้งานได้ · ตัวเลขข้างบนในหัวข้อ Plugin Architecture · checklist ของแผน
- ตรวจ: unit demo 18 (+1) · integration "บัญชี demo: 4 นิสัยพร้อม streak ตามประวัติ (4 · 15 · 2 · …) และ Today มีการ์ดนิสัย" — API 111 + worker 19
