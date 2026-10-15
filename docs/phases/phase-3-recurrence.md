# Phase 3 · Recurrence Engine (สัปดาห์ 10–11) 🔥

> เป้าหมาย: กฎการเกิดซ้ำที่ถูกต้องเรื่องโซนเวลา DST และวันสิ้นเดือน แล้วแปลงเป็น entry จริงแบบ lazy และ idempotent — สเปก 6.1, 15 Phase 3
> **DoD:** ตั้งบิลค่าเน็ตทุกวันที่ 31 → เห็นรายการเดือน ก.พ. เป็นวันที่ 28 ถูกต้อง
> ความรู้เบื้องหลัง: [บท 16](../learn/16-phase3-recurrence-floating-time-and-materialization.md) · [ADR-010](../adr/010-floating-time-and-month-end-clamp.md)

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                                     | Commit    | สถานะ |
| --- | ---------------------------------------------------------------------------------------- | --------- | ----- |
| 1   | core: คำนวณรอบ (rrule + timezone/DST + clamp) + 7 เคสบังคับ                              | `8b66813` | ✅    |
| 2   | API: CRUD + pause + preview (บันทึกแล้ว / ร่าง) + ลบเฉพาะรอบ                             | `2f36fa3` | ✅    |
| 3   | API: lazy materialization + cron 03:00 UTC + `POST /recurrence-rules/materialize`        | `2f36fa3` | ✅    |
| 4   | API: แก้รอบเดียว vs ทั้ง series จากฝั่ง entry (แก้ entry ที่มี recurrenceRuleId)         | `5686937` | ✅    |
| 5   | Web: ตัวสร้าง rrule แบบไม่ต้องรู้ RFC 5545 + preview 10 รอบ                              | `2af62d8` | ✅    |
| 6   | Web: ปุ่ม "เพิ่มรอบบิลใหม่" ในหน้า Expenses + เปิดปุ่ม "Materialize Recurrence" ใน Today | `180d47c` | ✅    |
| 7   | Staging: ตั้ง `CRON_SECRET` บน Vercel · บท learn 16 · ADR (floating time + clamp)        | `3781aae` | 🟡    |

---

## ขั้น 1 · core: คำนวณรอบ — `8b66813`

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

## ขั้น 2–3 · API: CRUD + lazy materialization — `2f36fa3`

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

---

## ขั้น 4 · API: แก้รอบเดียว vs ทั้ง series จากฝั่ง entry — `5686937`

**เป้าหมาย:** ผู้ใช้แก้/ลบรายการที่มาจากกฎได้ทั้งแบบ "เฉพาะครั้งนี้" และ "ทุกรอบ" จากหน้ารายการเอง ไม่ต้องไปแก้ที่กฎ (สเปก 6.1 แถวสุดท้ายของตารางปัญหา)

**สิ่งที่เปลี่ยน**

- 📁 `packages/contracts/src/recurrence.ts` — `recurrenceScopeSchema` (`this` | `series`), `entryScopeQuerySchema`
- 📁 `apps/api/src/entries/entries.controller.ts` — `PATCH /entries/:id?scope=` และ `DELETE /entries/:id?scope=` (ค่าเริ่มต้น `this` → client เดิมไม่กระทบ)
- 📁 `apps/api/src/entries/entries.service.ts`
  - `update(…, scope)` → `scope=series` ไปที่ `updateSeries()` · ส่วนแปลง dto เป็นข้อมูลแยกเป็น `buildUpdate()` ใช้ร่วมกัน
  - เลื่อนวัน (`PATCH occurredAt`, `defer`, `bulk defer`) และลบ (`DELETE`, `bulk delete`) ของรอบจากกฎ → `detachFromSeries()` เพิ่ม slot เข้า exceptions ใน transaction เดียวกับการเขียน entry
  - `remove(…, scope=series)` → ลบรายการนี้ + `endSeries()` จบกฎ
  - แก้ tag ย้ายเข้า transaction เดียวกับการแก้ entry · `projectId` เขียนเป็น scalar แทน `connect` (updateMany ไม่รองรับ relation)
- 📁 `apps/api/src/recurrence/recurrence.service.ts` — `excludeSlot`, `seriesTemplateFor`, `replaceTemplate`, `endSeries`, `materializeRule`
  (เมธอดที่รับ `tx` ทำงานใน transaction ของ EntriesService) · `remove()` ใช้ `endSeries()` ร่วม
- 📁 `entries.module.ts` import `RecurrenceModule` (ทางเดียว — recurrence ไม่รู้จัก entries จึงไม่เกิด cycle)

**การตัดสินใจ**

- **scope เป็น query string** ไม่ใช่ field ใน body — ใช้แบบเดียวกันได้ทั้ง PATCH และ DELETE (DELETE ไม่มี body) และไม่ปน payload ของ entry
- **มีแค่ `this` / `series`** ไม่มี "รอบนี้และรอบถัดไป" แบบ Google Calendar — `series` ในที่นี้ก็มีผลแค่ "ตั้งแต่ตอนนี้" อยู่แล้ว
  เพราะรอบที่ผ่านไปเป็นประวัติของผู้ใช้ (สเปก: แก้ template → entry เก่าไม่เปลี่ยน) การแยก series ออกเป็นสองกฎยังไม่จำเป็น _(ตัดสินเอง)_
- **"เลื่อนเฉพาะครั้งนี้" = แก้ entry ตรง ๆ + slot เดิมเข้า exceptions** ตามสเปก — เพิ่ม exception เฉพาะเมื่อวันเวลาเปลี่ยนจริง
  (แก้ชื่อ/จำนวนเงินของรอบเดียวไม่แตะ exceptions) · ผลที่เห็นได้: preview ไม่แสดงวันเดิมอีก
- `excludeSlot` กันซ้ำด้วย `NOT exceptions has slot` ใน `updateMany` — ไม่ต้องอ่านก่อนเขียน เรียกซ้ำหรือพร้อมกันได้
- **แก้ทั้ง series ↔ PATCH /recurrence-rules ต่างกันโดยตั้งใจ:** จาก entry = เปลี่ยน template **และ** สร้างรอบอนาคตที่ยังไม่ถูกแตะใหม่ทันที
  (ผู้ใช้กด "แก้ทุกรอบ" คาดว่าจะเห็นเดือนหน้าเปลี่ยน ไม่ใช่อีก 90 วัน) · จากกฎ = template อย่างเดียวตามเทสต์บังคับข้อ 7 _(ตัดสินเอง)_
- แก้ทั้ง series **ห้าม** `occurredAt` / `isAllDay` / `status` → 422 — เป็นของรอบใดรอบหนึ่ง เปลี่ยนตารางต้องทำที่ `/recurrence-rules/:id`
- ลำดับใน `updateSeries`: ตรวจ template (404/422) **ก่อน** เปิด transaction → ใน transaction: แก้ entry ด้วย version check (แพ้ = rollback ทั้งก้อน → 409, กฎไม่เปลี่ยน)
  → ลบรอบอนาคตที่ไม่ถูกแตะ → เขียน template + `materializedUntil = now` · materialize **หลัง** commit (พังได้โดยไม่เสียข้อมูล — cron เติมให้)
  · entry ที่ถูกแก้มี version 2 แล้วภายใน transaction จึงไม่ถูกลบไปพร้อมรอบอนาคต
- `bulk defer/delete` = "เฉพาะรอบนี้" ของแต่ละรายการ — หา id ก่อนอัปเดตเพื่อไม่แตะรายการที่ถูกลบไปก่อนแล้ว

**วิธีตรวจ**

- integration `test/recurrence.int-spec.ts` เพิ่ม 8 เคส: เลื่อนรอบเดียว (exceptions + preview), แก้ชื่อรอบเดียวไม่แตะ exceptions,
  ลบรอบเดียวซ้ำได้และไม่ถูกสร้างกลับ, defer/bulk → exceptions, แก้ทั้ง series (ม.ค. ผ่านแล้วไม่เปลี่ยน · ก.พ. ที่กด + เม.ย. ใหม่ใช้ template ใหม่ · มี.ค. ที่แก้เองอยู่ต่อ),
  422/409 ของ series (กฎไม่เปลี่ยนเมื่อแพ้ version), ลบทั้ง series, IDOR 404
- integration ทั้งชุด 65/65 (Docker ในเครื่อง · engine ปกติ) · `pnpm verify` ผ่าน (lint รวมกฎ ADR-006 · prettier · typecheck · unit · build)

**สิ่งที่ค้าง**

- **กู้คืน (restore) รอบที่ลบไปแล้ว** ไม่ดึง slot ออกจาก exceptions — รายการกลับมา แต่ preview ยังไม่แสดงวันนั้น (ไม่กระทบการสร้าง entry เพราะ unique slot ยังถูกจองอยู่)
- `EntryDto` ยังไม่ส่ง `recurrenceSlot` — web ใช้ `recurrenceRuleId` แยกว่าเป็นรอบจากกฎได้แล้ว จะเพิ่มถ้าขั้น 5–6 ต้องใช้
- Web ยังไม่มีตัวเลือก "เฉพาะครั้งนี้ / ทุกรอบ" — ทำพร้อมขั้น 6
- ~~📚 บท 16~~ → เขียนแล้วในขั้น 7

---

## ขั้น 5 · Web: ตัวสร้าง rrule + preview 10 รอบ — `2af62d8`

**เป้าหมาย:** ผู้ใช้ตั้งการเกิดซ้ำได้ด้วยตัวเลือกภาษาคน ไม่ต้องรู้ RFC 5545 และเห็น 10 รอบถัดไปจริงก่อนบันทึก

**สิ่งที่เปลี่ยน**

- 📁 `apps/web/src/features/recurrence/builder.ts` — ฟังก์ชันล้วน: `RecurrenceDraft` → `buildRrule()`, `validateDraft()`, `toRuleInput()`,
  `describeDraft()` (สรุปเป็นประโยค "ทุกเดือน วันที่ 31 · ไม่มีวันสิ้นสุด"), `weekdayOf()`, `formatLocalDate()`
- 📁 `recurrence-builder.tsx` — controlled component: วันเริ่ม · ความถี่ (segmented) · ทุก n หน่วย · วันในสัปดาห์ (toggle) ·
  วันที่ของเดือน · เงื่อนไขสิ้นสุด + แผง preview (`aria-live`) และ RRULE ดิบตัวเล็กใต้แผง
- 📁 `api.ts` (`recurrenceApi`: list / create / previewDraft / materialize) · `use-recurrence.ts` (`useDraftPreview` debounce 300ms)
- 📁 `packages/core/package.json` — subpath `@nosion/core/money`, `/time`, `/recurrence` ·
  📁 `packages/eslint-config/next.mjs` — ห้าม import `@nosion/core` ตัว index ในฝั่ง web

**การตัดสินใจ**

- **preview คำนวณที่ API (`POST /recurrence-rules/preview`) ไม่ใช่ในเบราว์เซอร์** — engine ตัวเดียวกับตอน materialize จริง
  ผลจึงตรงกันแน่นอน (โซนเวลาผู้ใช้ / DST / clamp) และ web ไม่ต้องโหลด rrule · debounce 300ms + `keepPreviousData` ไม่ให้รายการกระพริบ
- **ไม่มีตัวเลือก "วันสุดท้ายของเดือน" แยก** — เลือกวันที่ 31 ก็คือวันสุดท้ายอยู่แล้วเพราะ engine clamp (บอกผู้ใช้ใต้ช่องเมื่อเลือก 29–31)
- weekly ที่ไม่เลือกวัน = วันเดียวกับวันเริ่ม · กดวันสุดท้ายออกไม่ได้ (กฎต้องมีอย่างน้อยหนึ่งวัน) · BYDAY เรียงตามสัปดาห์เสมอ
- yearly ไม่ส่ง BYMONTH/BYMONTHDAY — engine ใช้วันของ startsAt และ clamp 29 ก.พ. เอง
- ค่าเริ่มต้นเหมาะกับบิล: รายเดือน วันเดียวกับวันเริ่ม ไม่มีวันจบ · วันที่ของเดือนตามวันเริ่มไปจนกว่าผู้ใช้จะเลือกเอง
- **ปิดเรื่องค้างของขั้น 1 (rrule ใน bundle web):** วัดแล้ว rrule ~45 kB (13 kB gzip) ติดไปทุกหน้าที่ใช้ `formatMoney`
  เพราะ index ของ core เป็น CJS → แยก subpath export + กฎ lint · First Load: /expenses 189 → 173 kB, /today 188 → 171 kB

**วิธีตรวจ**

- `builder.test.ts` 29 เคส รวม **DoD ฝั่ง web**: rrule ที่ builder สร้างจากวันที่ 31 → engine จริงให้ 31 ม.ค., 28 ก.พ., 31 มี.ค.
  และ rrule ทุกแบบที่ builder สร้างผ่าน `parseRecurrenceRule`
- `next build` แล้ว grep chunk — ไม่พบโค้ด rrule ใน `.next/static` · กฎ lint ใหม่ทดสอบด้วยไฟล์ตัวอย่าง (จับได้)
- web unit 65/65 · lint · typecheck
- ⚠️ ยังไม่ได้เปิดดูในเบราว์เซอร์ — component ยังไม่ถูกวางในหน้าใด (ตรวจในขั้น 6 แล้ว — ดูด้านล่าง)

**สิ่งที่ค้าง**

- ยังไม่รองรับ "วันจันทร์แรกของเดือน" (BYDAY + BYSETPOS) — engine รองรับแล้ว แต่ UI ยังไม่มีตัวเลือก
- ~~📚 บท 16~~ → เขียนแล้วในขั้น 7

---

## ขั้น 6 · Web: "เพิ่มรอบบิลใหม่" + ปุ่ม Materialize ใน Today — `180d47c`

**เป้าหมาย:** บิลรายเดือนใช้งานได้ครบวงจรจากหน้าเว็บ (สเปก 8.11.3 · 15 Phase 3) และปุ่ม Developer Quick Action ที่ปิดไว้ตั้งแต่ Phase 2 ใช้ได้จริง

**สิ่งที่เปลี่ยน**

- 📁 `apps/web/src/features/expenses/new-bill-dialog.tsx` — `<dialog>` ชื่อบิล · จำนวนเงิน · หมวด · วิธีจ่าย + `RecurrenceBuilder`
  → `POST /recurrence-rules` ด้วย template `expense` (`isBill: true`, `costType: 'fixed'`)
- 📁 `bills-card.tsx` — ปุ่ม "เพิ่มรอบบิลใหม่" ใช้ได้ และอยู่นอกรายการ (ยังไม่มีบิลก็กดได้) · ข้อความ empty state ใหม่
- 📁 `today-view.tsx` — "Materialize Recurrence" เรียก `POST /recurrence-rules/materialize` แล้ว toast จำนวนที่สร้าง
- 📁 `features/recurrence/use-recurrence.ts` — `useCreateRule`, `useMaterialize` · `useDraftPreview` คืน `isOutdated`
- 📁 `e2e/support/mock-api.ts` — mock preview ด้วย engine จริง (`@nosion/core/recurrence`) · create · materialize
- 📁 `e2e/a11y.spec.ts` — 4 เคสใหม่ · baseline visual ของ /expenses และ /today (linux) อัปเดตผ่าน `test:ui:docker`

**การตัดสินใจ**

- หลังบันทึกไม่ต้องทำอะไรเพิ่ม — API materialize 90 วันทันที และ mutation invalidate `['entries']` การ์ดบิล/KPI/Today จึงสดเอง
- วันเริ่มเริ่มต้น = วันนี้ตามโซนผู้ใช้ (`Intl` + `DEFAULT_TIME_ZONE`) ไม่ใช่วันที่ของเครื่อง
- **โฟกัสแรกของ dialog:** `autoFocus` ของ React ทำงานตอน mount ก่อน `showModal()` แล้วเบราว์เซอร์ย้ายโฟกัสไปปุ่มปิด
  → โฟกัส `[data-autofocus]` เองหลัง `showModal()` (e2e จับได้)
- **preview ระหว่าง debounce:** key ของ query ยังไม่เปลี่ยน รายการที่เห็นเป็นของค่าเก่าโดยไม่มีสัญญาณ (เห็นจาก screenshot)
  → `isOutdated = ค่าที่ debounce แล้ว !== ค่าปัจจุบัน || isPlaceholderData` ทำให้รายการจางลงทันทีที่แก้
- ข้อความรองในแผง preview ใช้ `fg-secondary` — `fg-tertiary` บนพื้น sunken ได้ contrast 3.3:1 (axe จับได้)

**วิธีตรวจ**

- Playwright `ui` (API ปลอม): **DoD ในหน้าเว็บ** — ตั้งบิลวันที่ 31 → preview รอบที่ 2 = 28 ก.พ. 2027 · body ที่ส่งมี
  `FREQ=MONTHLY;BYMONTHDAY=31` และ payload บิลครบ · ฟอร์มว่างไม่ยิง API · axe ใน dialog ทั้ง 2 ธีม ·
  รายสัปดาห์ (กดวันสุดท้ายออกไม่ได้ · BYDAY ตาม) · ปุ่ม Materialize เรียก API แล้วแจ้งผล → a11y 21/21 บน macOS
- Linux container (`test:ui:docker`) 41/41 · เปลี่ยน baseline เฉพาะ /expenses และ /today ตามที่คาด — ตรวจภาพด้วยตาแล้ว
- ดู screenshot dialog desktop/mobile ทั้ง 2 ธีมด้วยตา · `pnpm verify` ผ่าน
- ⚠️ ยังไม่ได้ลองกับ API + DB จริงในเบราว์เซอร์ (smoke) — ฝั่ง API ครอบด้วย integration ของขั้น 2–4 แล้ว

**สิ่งที่ค้าง**

- ยังไม่มีหน้า/เมนูจัดการกฎ (ดูรายการกฎ · หยุด · ลบ) และตัวเลือก "เฉพาะครั้งนี้ / ทุกรอบ" ตอนแก้หรือลบบิล — API พร้อมแล้ว (ขั้น 2, 4)
- quick capture "ค่าเน็ต 799 ทุกวันที่ 5" ยังสร้างรายการเดียว ไม่สร้างกฎ (NL parser อยู่ Phase 5)

---

## ขั้น 7 · ปิด Phase: เอกสาร + staging cron — `3781aae`

**เป้าหมาย:** บันทึก "ทำไม" ของ engine ให้อ่านทีหลังได้ และให้ cron ทำงานจริงบน staging

**สิ่งที่เปลี่ยน**

- 📁 `docs/adr/010-floating-time-and-month-end-clamp.md` — ADR-010 (ทางเลือกที่ไม่เลือก + ข้อเสียที่ยอมรับ)
- 📁 `docs/learn/16-phase3-recurrence-floating-time-and-materialization.md` — บท 16 (9 หัวข้อ + แบบฝึกหัด 15 ข้อ) · ลงใน `00-how-to-read.md` และ `index.html`
- 📁 `docs/adr/README.md` · 📁 `NOSION-SPEC.md` roadmap Phase 3 ✅

**การตัดสินใจ**

- ADR ใช้เลข 010 — 007/008 ยังจองไว้ตามสเปกภาคผนวก

**Staging**

- [x] ตั้ง `CRON_SECRET` ใน Vercel → project API (เจ้าของบัญชีตั้งเอง 15 ต.ค. 2026)
- [x] push Phase 3 ขึ้น main (`180d47c`) — CI รอบแรกแดงที่ Security scan จาก advisory ใหม่ของ handlebars (dev) → `bbfdd87`
- [x] Deploy staging ผ่าน (migrate · api · web · smoke) · `GET /api/v1/internal/cron/recurrence` ไม่มี header → **401** · secret ผิด → **401** (ก่อน deploy ได้ 404 เพราะ staging ยังไม่มี endpoint นี้)
- [x] **DoD บน staging** (บัญชีทดลอง): preview กฎวันที่ 31 เริ่ม 31 ม.ค. 2027 → 31 ม.ค. · **28 ก.พ.** · 31 มี.ค. ·
      สร้างกฎเริ่ม 31 ต.ค. 2026 → entry จริงใน DB: 31 ต.ค. · **30 พ.ย.** (clamp) · 31 ธ.ค. (ก.พ. อยู่นอก horizon 90 วัน — เห็นใน preview)
- [ ] ดู log ของ Cron Job ใน Vercel หลัง 03:00 UTC (10:00 น. เวลาไทย) 16 ต.ค. 2026 — กฎทดสอบ `r145opyc9805e17l327yeaej` ของบัญชีทดลองยังอยู่ (หมดอายุพร้อมบัญชีใน 24 ชม.)

> ✅ Phase 3 เสร็จฝั่งโค้ด (15 ต.ค. 2026) — เหลือตรวจบน staging ด้านบน
