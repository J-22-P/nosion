# Phase 3 · Recurrence Engine (สัปดาห์ 10–11) 🔥

> เป้าหมาย: กฎการเกิดซ้ำที่ถูกต้องเรื่องโซนเวลา DST และวันสิ้นเดือน แล้วแปลงเป็น entry จริงแบบ lazy และ idempotent — สเปก 6.1, 15 Phase 3
> **DoD:** ตั้งบิลค่าเน็ตทุกวันที่ 31 → เห็นรายการเดือน ก.พ. เป็นวันที่ 28 ถูกต้อง
> ความรู้เบื้องหลัง: บท 16 (ยังไม่เขียน — ดู "สิ่งที่ค้าง")

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                                     | Commit    | สถานะ |
| --- | ---------------------------------------------------------------------------------------- | --------- | ----- |
| 1   | core: คำนวณรอบ (rrule + timezone/DST + clamp) + 7 เคสบังคับ                              | `36c9b08` | ✅    |
| 2   | API: CRUD + pause + preview (บันทึกแล้ว / ร่าง) + ลบเฉพาะรอบ                             | `d9ffaf0` | ✅    |
| 3   | API: lazy materialization + cron 03:00 UTC + `POST /recurrence-rules/materialize`        | `d9ffaf0` | ✅    |
| 4   | API: แก้รอบเดียว vs ทั้ง series จากฝั่ง entry (แก้ entry ที่มี recurrenceRuleId)         |           | ⏳    |
| 5   | Web: ตัวสร้าง rrule แบบไม่ต้องรู้ RFC 5545 + preview 10 รอบ                              |           | ⏳    |
| 6   | Web: ปุ่ม "เพิ่มรอบบิลใหม่" ในหน้า Expenses + เปิดปุ่ม "Materialize Recurrence" ใน Today |           | ⏳    |
| 7   | Staging: ตั้ง `CRON_SECRET` บน Vercel · บท learn 16 · ADR (floating time + clamp)        |           | ⏳    |

---

## ขั้น 1 · core: คำนวณรอบ — `36c9b08`

**เป้าหมาย:** ฟังก์ชันล้วน (ไม่แตะ DB) ที่ตอบได้ว่า rule หนึ่ง "เกิดเวลา UTC ไหนบ้าง" ในช่วงที่ขอ

**สิ่งที่เปลี่ยน**

- 📁 `packages/core/src/recurrence.ts`
  - `occurrencesBetween(spec, after, until)` — ช่วง `(after, until]` เปิดซ้าย ต่อกันได้ไม่ซ้ำ ไม่ขาด (ใช้กับ `materializedUntil`)
  - `nextOccurrences(spec, after, limit)` — preview · `slotOnLocalDate(spec, 'YYYY-MM-DD')` — หา slot จากวันที่ที่ผู้ใช้กด
  - `parseRecurrenceRule()` — ตรวจ input · `toFloating()` / `fromFloating()`
- dependency ใหม่: `rrule@2.8.1` (ใน `@nosion/core`)

**การตัดสินใจ**

- **คำนวณใน "floating time"** — ฟิลด์ UTC ของ `Date` แทนเวลาหน้าปัดในโซนของ rule แล้วแปลงเป็น UTC ทีละรอบด้วย `zonedTimeToUtc` ที่มีอยู่แล้ว
  ไม่ใช้ตัวเลือก `tzid` ของ rrule.js (พฤติกรรมข้าม DST ขึ้นกับ runtime และมีบั๊กที่รู้กันมานาน)
- **clamp วันสิ้นเดือน** ด้วย RFC 5545 ล้วน: `BYMONTHDAY=31` → `BYMONTHDAY=28,29,30,31;BYSETPOS=-1` = "วันสุดท้ายในชุดนี้ที่มีจริงในเดือนนั้น"
  ใช้กับ MONTHLY และ YEARLY ที่มีเดือนเดียว (29 ก.พ. → 28 ก.พ. ในปีปกติ) · ไม่แตะกฎที่มี `BYDAY` / `BYSETPOS` อยู่แล้ว
- **COUNT นับจากรอบแรกของ series เสมอ** — materialize กี่ช่วงก็ไม่เกิน `maxCount` · รอบที่ถูกลบ (exception) ยังนับใน COUNT ตาม RFC 5545
- ปฏิเสธ `FREQ` ต่ำกว่ารายวัน และ `DTSTART / UNTIL / COUNT / TZID / BYHOUR / BYMINUTE / BYSECOND` ในสตริง — engine คุมเองจาก `startsAt`, `timezone`, `endType`
- จำกัด 1000 รอบต่อการเรียก — กันขอ preview ช่วง 100 ปีของกฎรายวัน
- เวลาหน้าปัดที่ไม่มีจริงตอนเข้า DST (02:30 New York) → เลื่อนไปเวลาที่มีจริง ไม่ทิ้งทั้งรอบ

**วิธีตรวจ**

- `recurrence.test.ts` 34 เคส · coverage 97.5% statements / 97.2% branches (สเปกขอ ≥ 95%)
- 7 เคสบังคับจากสเปก 6.1: ที่เป็นเรื่อง DB (materialize 2 ครั้ง, แก้ template) ทดสอบจริงในขั้น 3

---

## ขั้น 2–3 · API: CRUD + lazy materialization — `d9ffaf0`

**เป้าหมาย:** endpoint ครบตามตาราง "Recurrence & Reminder" (สเปก 7.x) และ entry ถูกสร้างล่วงหน้า 90 วันโดยไม่ซ้ำ

**สิ่งที่เปลี่ยน**

- 📁 `packages/contracts/src/recurrence.ts` — `createRecurrenceRuleSchema`, `updateRecurrenceRuleSchema`, `previewDraftRuleSchema`,
  `recurrenceTemplateSchema`, `RecurrenceRuleDto`, `RecurrencePreviewDto`
- 📁 `apps/api/src/recurrence/`
  - `recurrence.controller.ts` — `GET/POST /recurrence-rules`, `GET/PATCH/DELETE /:id`, `POST /:id/pause` (`{ paused: false }` = เริ่มต่อ),
    `POST /:id/preview?limit=`, `POST /preview` (กฎที่ยังไม่บันทึก · 60/นาที), `DELETE /:id/occurrences/:date`,
    `POST /materialize` (7 วัน · 6 ครั้ง/นาที)
  - `recurrence.service.ts` — CRUD + `materialize()`, `materializeForUser()`, `materializeDue()`
  - `recurrence-cron.controller.ts` — `GET /internal/cron/recurrence` สำหรับ Vercel Cron
- 📁 `apps/api/vercel.json` — `crons: 0 3 * * *` · 📁 `env.ts` + `.env.example` — `CRON_SECRET`

**การตัดสินใจ**

- อยู่ที่ `src/recurrence/` ไม่ใช่ `src/core/recurrence/` ตามที่สเปกเขียน — ADR-006 lint ห้าม Prisma ใน `core/`
  (ส่วนคำนวณล้วนอยู่ใน `@nosion/core` แทน)
- **idempotency สองชั้น:** `createMany({ skipDuplicates })` บน unique `(recurrenceRuleId, recurrenceSlot)` +
  `materializedUntil` เลื่อนไปข้างหน้าเท่านั้น (`updateMany where materializedUntil < horizon`) — cron สองตัวซ้อนกันไม่ดึงค่ากลับ
- **ไม่สร้างรอบย้อนหลัง** — rule ที่ `startsAt` อยู่ในอดีตเริ่มสร้างจาก "เมื่อวาน" (บิลที่ตั้งย้อนหลังไม่ควรกลายเป็นรายการค้างจ่ายหลายเดือน) _(สเปกไม่ได้ระบุ — ตัดสินเอง)_
- **แก้ template อย่างเดียว** → entry ที่สร้างแล้วไม่เปลี่ยน รอบใหม่ใช้ template ใหม่ (สเปก 6.1)
- **แก้ตาราง / หยุด / ลบ rule** → ลบ "รอบอนาคตที่ยัง `pending` และ `version = 1`" (ผู้ใช้ไม่เคยแตะ) แบบลบจริง เพื่อคืน unique slot
  แล้วสร้างใหม่ตามตารางใหม่ · รอบที่ผ่านแล้ว ทำเสร็จแล้ว หรือถูกแก้แล้ว อยู่ต่อเสมอ _(ตัดสินเอง)_
- **ลบเฉพาะรอบ** = เพิ่ม slot เข้า `exceptions` + soft delete entry ของรอบนั้น · ระบุเป็นวันที่ตามปฏิทินของ rule ไม่ใช่ timestamp · ลบซ้ำได้ผลเท่าเดิม
- **cron บน Vercel:** API เป็น Function ไม่มี process ค้าง → Vercel Cron เรียก endpoint พร้อม `Bearer CRON_SECRET`
  ไม่ตั้ง secret = endpoint ตอบ 404 (ปิด) · เทียบ secret แบบ `timingSafeEqual` · worker (Phase 4) เรียก `materializeDue()` ตัวเดียวกันได้
- cron ทำทีละ 200 rule ตาม id และข้าม rule ที่ยังเหลือล่วงหน้า ≥ 60 วัน · rule เดียวพังไม่หยุดทั้งรอบ
- template ถูกตรวจด้วย `payloadSchema` ของโมดูลตอนบันทึก (ไม่ใช่ตอน cron) → payload ผิดได้ 422 ทันที
- `RateLimitGuard` ไม่ได้เป็น global — ต้อง `@UseGuards` เอง (ครั้งแรกลืม เทสต์ 429 จับได้)

**วิธีตรวจ**

- integration `test/recurrence.int-spec.ts` 21 เคส: DoD (31 ม.ค. → 28 ก.พ. → 31 มี.ค.), materialize ซ้ำและพร้อมกัน, ลบรอบซ้ำ,
  afterCount 5 ตลอดกาล, แก้ template, เปลี่ยนตาราง/หยุด/ลบ, preview, 422 เจ็ดแบบ, IDOR 404 ทุก endpoint, 429, cron ปิด
- integration ทั้งชุด 57/57 · unit ทั้ง repo · lint · typecheck · prettier
- ⚠️ เครื่องที่พัฒนาโหลด engine ของ Prisma ไม่ได้ (network) — รัน integration ด้วย WASM query compiler + `@prisma/adapter-pg`
  เฉพาะในเครื่อง (ไม่ commit) · CI รันด้วย engine ปกติ

**สิ่งที่ค้าง**

- ยังไม่ได้ตั้ง `CRON_SECRET` บน Vercel staging → cron ยังตอบ 404 จนกว่าจะตั้ง (ขั้น 7)
- Reminder ของรอบที่สร้างใหม่ (สเปกขั้น 5 ของอัลกอริทึม) รอ Reminder Engine ใน Phase 4
- `rrule` ถูก bundle เข้า web ด้วยเพราะ web import `@nosion/core` (CJS → tree-shake ไม่ได้) — วัดขนาดในขั้น 5
