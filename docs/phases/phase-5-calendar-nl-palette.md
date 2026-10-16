# Phase 5 · Calendar + NL Parser + ⌘K (สัปดาห์ 14)

> เป้าหมาย: พิมพ์ประโยคเดียวแล้วได้รายการที่ถูกโมดูล ถูกวัน ถูกรอบ พร้อมการเตือน · เห็นทุกโมดูลบนปฏิทินเดียว — สเปก 6.3, 6.4, 8.3, 8.4, 8.11.4, 15 Phase 5
> **DoD:** พิมพ์ "ค่าเน็ต 799 ทุกวันที่ 5" ใน ⌘K แล้วได้บิลรายเดือนพร้อมการเตือน ครบในคำสั่งเดียว

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                                                        | Commit      | สถานะ |
| --- | ----------------------------------------------------------------------------------------------------------- | ----------- | ----- |
| 1   | NL Parser กลาง `@nosion/core/nl` (ไทย + อังกฤษ) + table-driven test 80 เคส                                  | `7d94b1f`   | ✅    |
| 2   | โมดูล task/expense ใช้ parser กลาง · `POST /parse` วนทุกโมดูล + `POST /parse/commit` (entry + rule + เตือน) | `bc6d4b9`   | ✅    |
| 3   | Calendar Aggregator `GET /calendar` (+ `countsByModule`, การเตือนของวัน, `calendarActions()`)               | `9ebcf05`   | ✅    |
| 4   | iCal feed `GET /calendar/:token.ics` + rotate token                                                         | `bf26ac8`   | ✅    |
| 5   | หน้า `/calendar` — month / week / agenda · module filter · day panel · Quick Snapshot                       | `598b289`   | ✅    |
| 6   | ลากรายการเปลี่ยนวัน (optimistic + rollback)                                                                 | `fe52eef`   | ✅    |
| 7   | Command Palette ⌘K 3 โหมด (ค้นหา / คำสั่ง / สร้าง) — **DoD**                                                | `a797d05`   | ✅    |
| 8   | `<QuickCapture>` ใน Tasks/Expenses ใช้ parser เต็ม + chip แก้ได้                                            | `4e2beca`   | ✅    |
| 9   | Keyboard shortcut ครบตาม 8.4 + หน้าต่าง `?`                                                                 | (รอ commit) | ✅    |
| 10  | บท learn 18 + ADR-012 (parser แบบ mask-and-scan)                                                            | —           | ⬜    |

**ค้างฝั่งเจ้าของ (สเปก 8.11.5):** mockup ของ ⌘K และปฏิทินบนมือถือยังไม่มี — ถ้ายังไม่มีตอนถึงขั้น 5/7 จะประกอบจาก token + component ใน 8.7
ตาม pattern ของหน้าที่มี mockup แล้ว และบันทึกไว้ในขั้นนั้น

---

## ขั้น 1 · NL Parser กลาง `@nosion/core/nl` — `7d94b1f`

**เป้าหมาย:** parser ชุดเดียวที่ทั้งเบราว์เซอร์ (preview ทันทีใน ⌘K) และ API (ตัดสินจริง) ใช้ — ก่อนหน้านี้ task กับ expense
ต่างคนต่างเขียน regex ของตัวเอง ("พรุ่งนี้" ของ task บวก 24 ชม. จาก server ไม่ใช่พรุ่งนี้ของผู้ใช้)

**สิ่งที่เปลี่ยน**

- 📁 `packages/core/src/nl.ts` — `parseNaturalText(input, { now, timeZone, weekStartsOn })` คืน `title` ที่เหลือ + วันที่, เวลา, `occurredAt` (UTC),
  `rrule`, priority, แท็ก, โปรเจกต์, จำนวนเงิน (+ รายรับ), ระยะเวลา, ปริมาณพร้อมหน่วย และ `tokens` พร้อมตำแหน่ง start/end
- รองรับ: วันนี้/พรุ่งนี้/มะรืน/เมื่อวาน/สิ้นเดือน/สัปดาห์หน้า/เดือนหน้า · วันในสัปดาห์ (`ศุกร์นี้`, `ศุกร์หน้า`, `next friday`) ·
  `20 ต.ค.`, `20 ตุลาคม 2569`, `15/9`, `25 dec`, `March 3rd 2027`, `วันที่ 20` · เวลา `5 โมง`, `บ่าย 2`, `2 ทุ่ม`, `ตี 5`, `10 โมงครึ่ง`,
  `เที่ยง`, `14.30 น.`, `7:30pm` · การเกิดซ้ำ `ทุกวัน`, `ทุกวันที่ 5`, `ทุกจันทร์ พุธ ศุกร์`, `ทุกเสาร์อาทิตย์`, `ทุก 2 สัปดาห์`, `weekdays`,
  `every monday`, `monthly`, `ทุกปี` · `!high` `!ด่วน` `!!!` · `#tag` · `+project` · เลขไทย ๐–๙
- 📁 `packages/core/package.json` — subpath `./nl` (ไม่ import rrule และไม่แตะ Node → web ใช้ได้ตามกฎ lint ของ `eslint-config/next`)
- ยังไม่มีโค้ดเรียกใช้ — โมดูลย้ายมาใช้ในขั้น 2

**การตัดสินใจ**

- **mask-and-scan** — matcher แต่ละกลุ่มรันตามลำดับ (เกิดซ้ำ → วันที่ → เวลา → สัญลักษณ์ → ตัวเลข) ส่วนที่ match แล้วถูกทับด้วยช่องว่างที่ยาวเท่าเดิม
  · ตัวหลังจึงไม่หยิบซ้ำ ("ทุกวันที่ 5" ไม่กลายเป็นเงิน 5 บาท) และ `start/end` ชี้กลับข้อความเดิมได้ตรงสำหรับ highlight
- **parser ไม่รู้จักโมดูล** — คืนแค่ชิ้นส่วน · การตัดสินว่า "กาแฟ 65" เป็นรายจ่าย (และความมั่นใจ) เป็นของโมดูลตามสเปก 6.4
- คำไทยไม่ใช้ word boundary (ไทยไม่เว้นวรรค: "ส่งรายงานพรุ่งนี้") · อังกฤษและตัวเลขต้องอยู่ต้นคำ (กัน "ais5g", "C#", "1+1")
- **วันในสัปดาห์นับวันนี้ด้วย** ("ส่งงานศุกร์" ตอนวันศุกร์ = วันนี้) · `หน้า/next` = ถ้าวันนั้นยังอยู่ในสัปดาห์นี้ให้เลื่อนไป 7 วัน (ขึ้นกับ `weekStartsOn`)
- **"อาทิตย์" ไม่มี "วัน" นำหน้า = สัปดาห์** (`ทุกอาทิตย์` = ทุกสัปดาห์, `อาทิตย์หน้า` = สัปดาห์หน้า) · มี "วัน" = วันอาทิตย์
- `5 โมง` ไม่ระบุช่วง: 1–6 = บ่าย/เย็น, 7–11 = เช้า (ตัวอย่างในสเปก "พรุ่งนี้ 5 โมง" = 17:00)
- **ระบุเวลาแต่ไม่ระบุวัน แล้วเวลาเลยไปแล้ว = รอบถัดไป** ("standup 9am" ตอน 10 โมง = พรุ่งนี้) — การเตือนของเวลาที่ผ่านไปแล้วไม่มีประโยชน์ ·
  ใช้กับรอบแรกของการเกิดซ้ำด้วย
- ไม่ระบุปีแล้ววันที่ผ่านไปแล้ว = ปีหน้า · ระบุปีเองแล้วผ่านไปแล้ว = ใช้ตามนั้น (บันทึกย้อนหลัง) · วันที่ไม่มีจริง (31/2) = ไม่ใช่วันที่
- ปีหลังชื่อเดือนไทย 2 หลักรับเฉพาะ 50–99 (พ.ศ.) — "1 ธ.ค. 10 โมง" เลข 10 คือเวลา
- จำนวนเงิน: ตัวเลขที่มีหน่วยเงินชนะ ไม่งั้นเอาตัวเลขลอยตัวสุดท้าย ("iphone 15 pro 35900") · ตัวเลขที่มีหน่วยอื่น (นาที, km, แก้ว) ไม่ใช่เงิน
- รอบแรกของ `ทุกวันที่ 31` ในเดือนที่ไม่มีวันที่ 31 = วันสุดท้ายของเดือน (ตาม ADR-010)

**วิธีตรวจ**

- `packages/core/src/nl.test.ts` — table-driven 80 เคส (ครบ 5 ตัวอย่างของสเปก 6.4) · ทุกเคสเทียบ **ทุกฟิลด์** (ฟิลด์ที่ไม่ระบุต้องว่าง → จับการกินคำเกิน)
  - 6 เคสรายละเอียด: UTC/ทั้งวัน · "พรุ่งนี้" ตามโซนผู้ใช้ (New York 23:30) · ตำแหน่ง token · รายรับ · `weekStartsOn` · clamp วันที่ 31
- `pnpm --filter @nosion/core typecheck lint test build` ผ่าน (180 เคสทั้งแพ็กเกจ)
- ⚠️ ยังไม่มีผู้เรียกใช้จริง — ผลบน API/เว็บตรวจในขั้น 2 และ 7

**สิ่งที่ค้าง**

- [x] ขั้น 2: ย้าย `parseNaturalLanguage` ของ task/expense มาใช้ parser กลาง

📚 ความรู้เบื้องหลัง: บท 18 (เขียนในขั้น 10)

---

## ขั้น 2 · โมดูลใช้ parser กลาง + `POST /parse` · `POST /parse/commit` — `bc6d4b9`

**เป้าหมาย:** ฝั่ง API ของ DoD — ประโยคเดียว → รายการที่ถูกโมดูล + กฎการเกิดซ้ำ + การเตือน + แท็ก/โปรเจกต์ ในคำขอเดียว
(⌘K ในขั้น 7 แค่เรียก endpoint นี้)

**สิ่งที่เปลี่ยน**

- 📁 `packages/core` — `TrackableModule.parseNaturalLanguage(text: NlResult, ctx)` รับผลที่แยกชิ้นแล้วแทนข้อความดิบ ·
  `ParsedEntry.rrule` ใหม่ · `remainingText(result, keep)` ให้แต่ละโมดูลเลือกว่าตัวเลขชนิดไหนเป็นส่วนของชื่อ
- 📁 `apps/api/src/core/parser/parser.service.ts` — `ParserService.parse()` แยกชิ้นครั้งเดียว ถามทุกโมดูลที่ผู้ใช้เปิด เรียงตามความมั่นใจ (best + ทางเลือก ≤ 2)
- 📁 `apps/api/src/parse/` (โมดูลใหม่) — `POST /parse` (preview, 60/นาที/ผู้ใช้ ตามสเปก 7.5) · `POST /parse/commit` (`module?` เลือกทางเลือกรอง, `clientId?`)
- 📁 `packages/contracts/src/parse.ts` — `ParseResultDto`, `ParsedEntryDto`, `ParseCommitDto`
- **expense** — `interpretExpense(nl)` แทน regex เดิม · รายเดือน/รายปี = บิล + เตือนล่วงหน้า 1 วัน 09:00 (ค่าเริ่มต้นเดียวกับ "เพิ่มรอบบิลใหม่") ·
  รายวัน/สัปดาห์ = รายจ่ายซ้ำแต่ไม่ใช่บิล · ระบุวันเอง ("เมื่อวาน") = บันทึกย้อนหลังทั้งวัน · ปริมาณเป็นส่วนของชื่อ ("ซื้อน้ำ 2 ขวด")
- **task** — "พรุ่งนี้" = ทั้งวันของพรุ่งนี้ตามโซนผู้ใช้ (เดิม = ตอนนี้ + 24 ชม.) · ระบุเวลา → เตือนตอนนั้น · ระยะเวลา → `estimateMinutes` ·
  ข้อความไหนก็เป็นงานได้ (ทางเลือกสุดท้ายของ ⌘K) แต่มีเงินไม่มีวัน → ความมั่นใจ ≤ 0.25 และชื่อเก็บตัวเลขไว้ ("งาน 'กาแฟ 65'" ตาม mock 8.3)
- `POST /expenses/parse` (quick capture หน้า Expenses) ใช้ parser กลางด้วย — หน้าเว็บไม่ต้องแก้

**การตัดสินใจ**

- **commit parse ใหม่ที่ server เสมอ** ไม่รับ payload จาก client — preview กับของที่บันทึกมาจากกฎชุดเดียว และ client แต่งข้อมูลข้ามการตรวจไม่ได้
- **parse ครั้งเดียว แล้วส่งผลเดียวกันให้ทุกโมดูล** (เปลี่ยน signature จากสเปก 6.4 ที่ส่งข้อความดิบ) — โมดูลไม่ต้องเขียน regex วันที่ซ้ำ
  และ "พรุ่งนี้" ของทุกโมดูลตรงกันแน่นอน
- มี `rrule` = สร้างผ่าน `RecurrenceService.create` (materialize ล่วงหน้าทันที การเตือนอยู่ใน template ของทุกรอบ) แล้วคืนรอบแรกเป็น `entry`
- แท็ก/โปรเจกต์ผูกกับของเดิมแบบไม่สนตัวพิมพ์และ `-` = ช่องว่าง (กติกาเดียวกับ quick capture หน้า Tasks) ไม่มีก็สร้าง
- โมดูล parse แยกเป็น `src/parse/` ไม่อยู่ใต้ `entries/` — กฎ boundaries (ADR-006) ไม่ให้ `entries` import `auth` (rate-limit guard)

**วิธีตรวจ**

- unit: `parser.service.spec.ts` 3 เคส (เรียงอันดับ · ส่งผลเดียวกันทุกโมดูล · โมดูลที่ปิดไม่ถูกถาม) · spec ของ task/expense ปรับตามพฤติกรรมใหม่
- integration `test/parse.int-spec.ts` 6 เคส: preview ไม่บันทึก + token · **DoD "ค่าเน็ต 799 ทุกวันที่ 5"** → กฎ `FREQ=MONTHLY;BYMONTHDAY=5`
  - entry รอบแรกวันที่ 5 + การเตือน `fireAt` 09:00 ของวันที่ 4 · เลือกทางเลือกรอง + แท็ก/โปรเจกต์ (ไม่สร้างแท็กซ้ำ) · งานมีเวลาเตือนตอนนั้น +
    `clientId` ซ้ำไม่สร้างซ้ำ · 422 · 401
- `pnpm verify` ผ่าน · integration API 93 + worker 19 ผ่าน (`pnpm test:int:local`)
- ⚠️ ยังไม่มี UI เรียก `/parse` (ขั้น 7–8) · ยังไม่ได้ลองบน staging

---

## ขั้น 3 · Calendar Aggregator `GET /calendar` — `9ebcf05`

**เป้าหมาย:** API ของหน้าปฏิทินรวม (สเปก 6.3 · 8.11.4) — ทุกโมดูลในคำขอเดียว พร้อมทุกอย่างที่ grid / day panel / chip ต้องใช้

**สิ่งที่เปลี่ยน**

- 📁 `apps/api/src/calendar/` (โมดูลใหม่) — `GET /calendar?from=&to=&module=` · `from`/`to` เป็นวันบนปฏิทินของผู้ใช้ รวมทั้งสองวัน ไม่เกิน 93 วัน
  (month grid 6 สัปดาห์ = 42 วัน) · header `Server-Timing: calendar;dur=…` สำหรับบรรทัด "Sync latency"
- `calendar-events.ts` — `buildCalendar()` ส่วนคำนวณล้วน: เรียก `toCalendarEvent` + `calendarActions` ของแต่ละโมดูล · `date` ของ event ตามโซนผู้ใช้ ·
  `countsByModule` (ทุกโมดูลที่เปิด รวม 0) · `reminders` ในช่วง (จุด accent + หัว day panel)
- 📁 `packages/core` — `TrackableModule.calendarActions?(entry)` (optional) + type `CalendarAction` (`complete` checkbox/button · `open`)
- task: ยังไม่เสร็จ = checkbox "ทำเสร็จ" · expense: บิลที่ยังไม่จ่าย = ปุ่ม "จ่ายแล้ว" · meta ของบิลมี `amountMinor`/`currency` สำหรับ Quick Snapshot
- 📁 `RecurrenceService.projectedEntries()` — รอบที่เลย horizon 90 วันคำนวณจากกฎโดยไม่เขียน DB → event `projected: true, entryId: null, actions: []`
- 📁 `packages/contracts/src/calendar.ts` — `calendarQuerySchema`, `CalendarDto`, `CalendarEventDto`, `CalendarReminderDto`

**การตัดสินใจ**

- **ดึง entry ทุกโมดูลใน query เดียว** (ตามสเปก 6.3) รวมการเตือนด้วย `include` — ไม่ใช่ N query ต่อโมดูล
- **projected events** — เดิมเลื่อนปฏิทินไปเกิน 3 เดือนแล้วบิลรายเดือนหายไปเฉย ๆ (ยังไม่ถูก materialize) ·
  เลือก "คำนวณแสดง" แทน "materialize ตามช่วงที่เปิดดู" เพราะการเปิดดูไม่ควรเขียน DB และ cron เติมให้เองเมื่อใกล้ถึง
- `?module=` กรองเฉพาะ events แต่ `countsByModule` นับทุกโมดูล — chip ที่ไม่ได้เลือกยังบอกได้ว่ามีกี่รายการ
- Quick Snapshot ไม่ทำเป็น endpoint แยก — หน้าเว็บคำนวณจาก events ของสัปดาห์ (ตัวเลขตรงกับที่เห็นบน grid เสมอ)
- การเตือนนับเฉพาะของ entry ที่อยู่ในช่วง — การเตือนล่วงหน้าของรายการวันแรกของเดือนถัดไปที่ยิงในวันสุดท้ายของช่วงจะไม่ติดจุด (ยอมรับได้)
- โมดูลอยู่ที่ `src/calendar/` ไม่ใช่ `core/calendar/` อย่างตัวอย่างในสเปก — อ่าน Prisma ซึ่ง ADR-006 ห้ามใน `core/` (แบบเดียวกับ Today)

**วิธีตรวจ**

- unit `calendar-events.spec.ts` 6 เคส: วันที่ตามโซน · ลำดับ (วัน → ทั้งวัน → เวลา) · filter vs counts · โมดูลปิด/ปุ่มจากโมดูล · projected · การเตือนที่ยกเลิก
- integration `test/calendar.int-spec.ts` 5 เคส: งาน + บิล (จาก `/parse/commit`) ในคำขอเดียวพร้อมปุ่มและการเตือน · รายจ่ายจรไม่ขึ้น · `?module=` ·
  **เลย horizon → projected และไม่เขียน DB** · แยกผู้ใช้ · 422
- `pnpm verify` ผ่าน · integration API 98 + worker 19 ผ่าน

---

## ขั้น 4 · iCal feed `GET /calendar/:token.ics` + rotate — `bf26ac8`

**เป้าหมาย:** subscribe ปฏิทินของ NOSION ใน Google / Apple Calendar ได้จริง (สเปก 6.3 "iCal Export" · ปุ่ม Subscribe iCal ใน 8.11.4)

**สิ่งที่เปลี่ยน**

- 📁 `apps/api/src/calendar/ical.ts` — `buildIcal()` pure: VCALENDAR/VEVENT · ทั้งวัน `VALUE=DATE` + DTEND วันถัดไป · มีเวลาเป็น UTC ·
  escape `\ ; ,` และขึ้นบรรทัด · **พับบรรทัดที่ 75 byte ของ UTF-8** · งานเสร็จขึ้น `✓` · `CATEGORIES` = โมดูล · `REFRESH-INTERVAL` 1 ชม.
- `GET /calendar/feed` → `{ url, webcalUrl }` · `POST /calendar/feed/rotate` (10 ครั้ง/ชม.) · `GET /calendar/:token.ics` (`@Public`, 120 ครั้ง/นาที/IP)
- feed ครอบคลุมย้อน 30 วัน – ล่วงหน้า 180 วัน ใช้ `CalendarService.range` ตัวเดียวกับหน้าเว็บ (รวมรอบ projected ของบิล)
- ไม่มี migration — คอลัมน์ `user_settings.calendarFeedToken` (unique, default cuid2) มีมาตั้งแต่ init

**การตัดสินใจ**

- **token เก็บแบบอ่านได้ (ไม่ hash)** — สเปกให้ dialog "คัดลอก URL" ได้ทุกเมื่อ ถ้า hash ต้อง rotate ทุกครั้งที่อยากดูลิงก์ซึ่งตัด subscription เดิม ·
  ความเสี่ยงคือ DB หลุดแล้วอ่านปฏิทินได้ — แต่ DB หลุดก็อ่านข้อมูลเดียวกันได้ตรง ๆ อยู่แล้ว · token ใหม่สุ่ม 192 bit
- ไม่ใช้ token แบบเซ็น (เหมือน action token) — rotate ต้องมี state อยู่ดี และลิงก์ subscribe ต้องไม่มีวันหมดอายุ
- token ผิดรูปแบบไม่ query DB · ทุกกรณีที่ใช้ไม่ได้ตอบ 404 เหมือนกัน (ไม่บอกว่ามีหรือไม่มี)
- **UID ของรอบจากกฎ = ruleId + เวลา slot** — รอบ projected กับตอนถูกสร้างจริงเป็น event เดียวกันในแอปปฏิทิน ไม่ซ้ำ
- URL ใช้ `API_URL` แบบเดียวกับลิงก์เลิกรับอีเมล
- `Cache-Control: private, max-age=300` — ลดการดึงซ้ำจาก client ที่ refresh ถี่

**วิธีตรวจ**

- unit `ical.spec.ts` 5 เคส: escape · พับบรรทัดไทยไม่เกิน 75 byte และต่อกลับได้เดิม · เวลา/ทั้งวัน · ✓ · UID ของ projected = ของจริง
- integration +3 เคส: ลิงก์ → `.ics` ไม่ต้องล็อกอิน (content-type, มีงาน+บิล, ไม่มีรายจ่ายจร) · rotate แล้วลิงก์เดิม 404 / ใหม่ 200 / token มั่ว 404 · แยกผู้ใช้
- `pnpm verify` ผ่าน · integration API 101 + worker 19 ผ่าน
- ⚠️ ยังไม่ได้ลอง subscribe จริงใน Google/Apple Calendar — ทำได้หลังขึ้น staging (ต้องเป็น URL สาธารณะ)

---

## ขั้น 5 · หน้า `/calendar` — `598b289`

**เป้าหมาย:** หน้าปฏิทินรวมตามสเปก 8.11.4 บน API ของขั้น 3–4

**สิ่งที่เปลี่ยน**

- 📁 `apps/web/src/features/calendar/`
  - `grid.ts` (pure) — grid เดือน 42 วันตาม `weekStartsOn` · สัปดาห์ · สัปดาห์ ISO (`W36 – W41`) · เลื่อน ‹ › · ป้ายภาษาไทย · `weekSnapshot()` ของ Quick Snapshot
  - `use-calendar.ts` — สถานะใน URL (`?view=` `?date=` `?module=`) · query key `['entries','calendar',from,to]` ·
    ติ๊ก/จ่ายแล้วแบบ optimistic + ย้อนกลับ · อ่าน `Server-Timing` ผ่าน Resource Timing API สำหรับ "Sync latency"
  - `views.tsx` — Month grid (สูงสุด 3 รายการ + "+N", prefix `T:/E:/W:/H:`, วันนี้เป็น cell ยก + badge วงกลม, จุด accent วันที่มีการเตือน,
    รอบ projected เป็นกรอบประ) · Week (time grid 06:00–24:00 + แถวทั้งวัน) · Agenda · แถบสัปดาห์มือถือ
  - `day-panel.tsx` — timeline ของวันที่เลือก · หัวแสดงการเตือนของวัน (`Push 09:00 · ส่งแล้ว`) · ปุ่มตาม `actions` ของโมดูล
    (checkbox / ปุ่ม / ลิงก์ — **ไม่มีชื่อโมดูลในการตัดสินปุ่ม**) · Quick Snapshot (งานค้าง + progress, บิลครบกำหนด + "ถัดไปอีก N วัน")
  - `feed-dialog.tsx` — คัดลอกลิงก์ iCal · เปิดใน Apple Calendar (`webcal://`) · สร้างลิงก์ใหม่ต้องกดยืนยันสองครั้ง
- 📁 `app/(app)/calendar/page.tsx` · เมนู "ปฏิทิน" เปิดใช้ (sidebar + แท็บมือถือ)
- e2e: mock `/calendar` + `/calendar/feed` · axe ทั้ง 2 ธีม · visual 4 ภาพ · เทสต์พฤติกรรม 2 เคส

**การตัดสินใจ**

- **มือถือใช้แถบสัปดาห์ + agenda ทุก view** (ยังไม่มี mockup มือถือ — ทำตามที่สเปก 8.11.4 กำหนด) · month/week grid เฉพาะ `md` ขึ้นไป
- month กับ agenda ขอช่วง 42 วันเดียวกัน — สลับ view ไม่โหลดใหม่ · กรองโมดูลฝั่ง client (ไม่ยิง API ซ้ำ chip ยังได้ตัวเลขครบ)
- เลือกวัน = เปลี่ยน `?date=` (วันนี้ = ไม่มีพารามิเตอร์) — ลิงก์แชร์ได้ / back กลับมาที่เดิม
- **ปรับจาก mockup เพื่อผ่าน axe:** วันนอกเดือนและรายการที่เสร็จใช้ `text-fg-secondary` (+ ขีดฆ่า) แทน `--text-tertiary`
  — tertiary ได้ contrast ไม่ถึง 4.5:1 (axe แจ้ง serious ทั้ง 2 ธีม)
- `weekStartsOn` / timezone อ่านจาก `/me` (ใช้ `timezone` ที่ API ส่งกลับใน `/calendar` เป็นหลัก)
- "Sync latency" แสดงเมื่อเบราว์เซอร์อ่าน `Server-Timing` ได้ (same-origin — staging proxy ผ่านโดเมนของเว็บ) · dev ที่เว็บกับ API คนละพอร์ตจะไม่แสดง
  (ต้องเพิ่ม `Timing-Allow-Origin` ถ้าต้องการ)

**วิธีตรวจ**

- unit `grid.test.ts` 6 เคส (grid จันทร์/อาทิตย์ · range · เลื่อนข้ามปี · ISO week ข้ามปี · ป้ายไทย/เวลา · snapshot)
- axe 0 serious ทั้ง light/dark · เทสต์พฤติกรรม: ติ๊กงานจาก panel ยิง `POST /entries/:id/complete` · เลือกวัน → URL + panel + ปุ่ม "จ่ายแล้ว" ·
  chip กรองโมดูล (บิลหาย, ตัวเลขยังอยู่) · iCal dialog ต้องยืนยันก่อน rotate
- visual baseline สร้างใหม่ใน Docker (Linux เหมือน CI) 50/50 ผ่าน — **ภาพเดิม 16 ภาพเปลี่ยนเพราะเมนูปฏิทินเปิดใช้** (ตรวจ diff แล้ว: ต่างเฉพาะไอคอนเมนู)
- ดูภาพจริงแล้วทั้ง month / week / มือถือ · `pnpm verify` ผ่าน
- ⚠️ ยังไม่ได้ลองกับ API จริงในเบราว์เซอร์ (ใช้ mock) และยังไม่ได้ลองบนมือถือจริง

---

## ขั้น 6 · ลากรายการเปลี่ยนวัน (optimistic + rollback) — `fe52eef`

**เป้าหมาย:** ลากรายการบน month / week ไปวันอื่น เห็นผลทันที บันทึกพลาดแล้วกลับที่เดิม (สเปก 8.11.4)

**สิ่งที่เปลี่ยน**

- 📁 `CalendarEventDto.version` (API + contracts) — PATCH `/entries/:id` ต้องใช้ (optimistic concurrency) · projected = `null`
- 📁 `grid.ts` — `moveTarget(event, toDate, tz)`: ทั้งวันส่ง `'YYYY-MM-DD'` · มีเวลา **คงเวลาหน้าปัด** (14:30 → 14:30 วันใหม่ ข้าม DST ก็ยัง 14:30) ·
  `canMove()` (มี entry จริง ยังไม่เสร็จ)
- 📁 `use-calendar.ts` — `useMoveEvent`: ย้ายในแคชทันที → PATCH → พลาดย้อนแคช + toast (409 บอกว่ามีการแก้จากที่อื่น)
- 📁 `views.tsx` — HTML5 drag-and-drop (ไม่เพิ่ม library) · ช่องเดือน/แถวทั้งวัน/คอลัมน์เวลาเป็นที่วาง ไฮไลต์ตอนลากผ่าน ·
  ช่องเดือนเปลี่ยนจาก `<button>` ทั้งช่องเป็น div + ปุ่มปูเต็มช่อง (ของที่ลากได้ซ้อนในปุ่มลากไม่ขึ้นในบางเบราว์เซอร์)
- 📁 `day-panel.tsx` — ช่อง "ย้ายไปวัน" (`<input type="date">`) ทุกรายการที่ย้ายได้

**การตัดสินใจ**

- **ทางเลือกของการลาก = ช่องเลือกวันใน day panel** — การลากใช้เมาส์อย่างเดียว (WCAG 2.1.1 ต้องทำได้ด้วยคีย์บอร์ด)
  และ HTML5 drag ใช้นิ้วบนมือถือไม่ได้ ช่องเดียวกันจึงแก้ทั้งสองกรณี
- ลากเปลี่ยน **วัน** อย่างเดียว ไม่เปลี่ยนเวลา (week view วางที่ไหนในคอลัมน์ก็คงเวลาเดิม) — เปลี่ยนเวลาทำในหน้ารายละเอียด
- รายการจากกฎการเกิดซ้ำย้าย **เฉพาะรอบนั้น** (scope `this` ค่าเริ่มต้นของ API: วันเดิมเข้า exceptions ของกฎ + เลื่อนการเตือน) — ไม่ถาม "ทั้ง series?"
  เพราะการลากคือการจัดตารางของวันนั้น
- รายการที่เสร็จแล้วและรอบ projected ลากไม่ได้

**วิธีตรวจ**

- unit `grid.test.ts` +2 (ทั้งวัน/มีเวลา/ข้าม DST New York/วันเดิม · `canMove`)
- e2e +3: **ลากแล้วย้ายทันทีก่อน server ตอบ** (ค้างคำตอบไว้ตรวจ) + body PATCH `{ occurredAt: 14:30 เดิม, isAllDay, version }` ·
  server 409 → กลับที่เดิม + toast · ช่องเลือกวันใน panel → บิลทั้งวันส่งวันที่ล้วน · axe ยัง 0 serious
- integration +1: version จาก `/calendar` ใช้ PATCH ได้ · version เก่า → 409 · รอบอื่นของกฎเดียวกันไม่ขยับ
- `pnpm verify` ผ่าน · integration API 102 + worker 19 · visual baseline (Docker) 55/55 — เปลี่ยนเฉพาะ 4 ภาพของปฏิทิน (มีช่องย้ายวัน)
- ⚠️ ช่องเลือกวันแสดงรูปแบบตาม locale ของเบราว์เซอร์ (ภาพ baseline เป็น `09/30/2026`) · ยังไม่ได้ลองลากกับ API จริงในเบราว์เซอร์

---

## ขั้น 7 · Command Palette ⌘K 3 โหมด — **DoD** — `a797d05`

**เป้าหมาย:** DoD ของ Phase 5 — พิมพ์ "ค่าเน็ต 799 ทุกวันที่ 5" ใน ⌘K แล้วได้บิลรายเดือนพร้อมการเตือน ครบในคำสั่งเดียว (สเปก 8.3)

**สิ่งที่เปลี่ยน**

- 📁 `apps/web/src/features/command-palette/`
  - `palette-model.ts` (pure) — โหมด (`""` idle · `>` คำสั่ง · อื่น ๆ สร้าง+ค้นหา) · รายการคำสั่ง (ไปหน้า…, Standup, ธีม 3 แบบ, ออกจากระบบ) ·
    `createLabel` ("สร้างบิลประจำ") · `describeParsed` ("ค่าเน็ต · ฿799 · สาธารณูปโภค · ↻ ทุกเดือน วันที่ 5 · 🔔 เตือน 1") ·
    `describeRrule` · `highlightSegments` · `entryHref` (มีวันที่ → `/calendar?date=` · ไม่มี → หน้าโมดูล)
  - `command-palette.tsx` — `<dialog>` · highlight ส่วนที่เข้าใจ **ทันทีจาก parser ฝั่ง client** (`@nosion/core/nl` ตัวเดียวกับ server) ·
    debounce 250ms แล้ว `POST /parse` + `GET /entries?q=` พร้อมกัน · หมวด "สร้าง" (ความมั่นใจ %) / "หรือสร้างเป็น…" / "ผลการค้นหา" ·
    `↵` บันทึก · `⇧↵` บันทึกแล้วเปิดวันนั้นในปฏิทิน · `⌘↵` บันทึกแล้วสร้างต่อ (batch) · `↑↓` · `tab` สลับหมวด · `esc` / คลิกนอกกล่องปิด
- ⌘K / Ctrl+K ทั้งแอป (ใช้ได้แม้กำลังพิมพ์ในช่องอื่น) · ช่อง "ค้นหาหรือสั่งการ…" บน top bar และปุ่มแว่นขยายบนมือถือเปิด palette (เลิก toast "มาใน Phase 5")
- ARIA combobox + listbox (`aria-activedescendant`, option/group) — โฟกัสอยู่ที่ช่องพิมพ์ตลอด

**การตัดสินใจ**

- **สร้าง + ค้นหาแสดงพร้อมกัน** ไม่ต้องสลับโหมดเอง (mock ในสเปก 8.3 เป็นแบบนี้) · ↵ = ตัวเลือกบนสุดเสมอ
- **commit ส่งข้อความ ไม่ส่ง payload** — server parse ใหม่ (ขั้น 2) · ถ้า preview ยังไม่ตามทันข้อความล่าสุด (กด ↵ ภายใน 250ms) ไม่ส่ง `module` ให้ server เลือกเอง
  · `clientId` ต่อหนึ่งข้อความ กด ↵ รัวไม่สร้างซ้ำ
- **"เปิดหน้ารายละเอียด" (⇧↵) = เปิดวันนั้นในปฏิทิน** — ยังไม่มีหน้ารายละเอียดของรายการ (สเปก 8.11.5) · day panel แสดงรายการพร้อมปุ่มของโมดูล
- ข้อความรองในแถวที่เลือกเปลี่ยนเป็นสีหลัก — สีรองบนพื้น `wash-active` ไม่ถึง 4.5:1 (axe)
- ช่องพิมพ์ไม่มีกรอบโฟกัส — `:focus-visible` ใน globals.css อยู่นอก layer จึงชนะ `outline-none` · ช่องนี้เป็นช่องเดียวที่โฟกัสใน dialog
- ↵ ระหว่างเลือกคำใน IME ไม่นับเป็นการยืนยัน (`isComposing`)

**วิธีตรวจ**

- unit `palette-model.test.ts` 7 เคส (โหมด · กรองคำสั่ง · ข้อความตัวอย่างของสเปก 8.3 · ข้อความของ DoD · rrule → ภาษาคน · highlight · ลิงก์ของผลค้นหา)
- e2e (mock) 6 เคส: DoD ฝั่ง UI (highlight → preview บิลประจำ → ↵ → body `{ text, module: expense, clientId }` → toast → ปิด) ·
  ↓ เลือกทางเลือกรอง + ⌘↵ กล่องยังเปิด · tab ไปผลค้นหา → ↵ เปิด `/calendar?date=` · `>` ธีมมืด / ไปหน้าปฏิทิน / ปุ่มบน top bar / esc ·
  **axe ตอน palette เปิดพร้อมผลลัพธ์ทั้ง 2 ธีม** — รวม UI suite 37/37
- **smoke (API + DB จริง) — DoD ผ่าน:** demo → ⌘K → "ค่าเน็ต 799 ทุกวันที่ 5" → `⇧↵` → toast "สร้างบิลประจำแล้ว" → `/calendar?date=…-05` แสดง
  "ค่าเน็ต · ฿799.00" + ปุ่ม "จ่ายแล้ว" → วันก่อนหน้าแสดง "Push 09:00 · รอส่ง" · ดูภาพจริงของ palette กับ API จริงแล้ว
- `pnpm verify` ผ่าน
- ⚠️ CI ยังไม่รัน project `smoke` (ต้องยก API + DB) — DoD ตรวจบนเครื่อง (API ชี้ฐาน `nosion_test`) · ยังไม่ได้ลองบน staging / มือถือจริง

**เจอระหว่างทาง (เครื่อง dev)**

- มี **Redis ของ Homebrew** ฟังอยู่ที่ `127.0.0.1:6379` บังตัวใน Docker — โปรเซสในเครื่องที่ต่อ `localhost:6379` ได้ Redis ของ Homebrew
  (rate limit ของ `/auth/demo` 5 ครั้ง/ชม. จึงค้างอยู่ที่นั่น) · ไม่ได้แก้อะไร — แจ้งเจ้าของเครื่อง
- smoke เดิมกด "ลองใช้ทันที" แล้ว `waitForURL` — URL เปลี่ยนก่อน shell mount ปุ่มลัดที่กดทันทีจึงหายได้ → รอช่อง "ชื่องานใหม่" ก่อน

---

## ขั้น 8 · `<QuickCapture>` ของ Tasks / Expenses ใช้ parser เต็ม + chip แก้ได้ — `4e2beca`

**เป้าหมาย:** แทน regex ก่อน Phase 5 (`!priority #tag +project` เท่านั้น) ด้วย NL parser ตัวเดียวกับ ⌘K ·
chip ที่ parse ได้แก้ไขได้ (วันที่ เวลา priority แท็ก โปรเจกต์ หมวด) — สเปก 8.11.2 · 8.11.3 · 15 Phase 5

**สิ่งที่เปลี่ยน**

- 📁 `apps/web/src/features/capture/`
  - `nl-chips.ts` (pure) — `buildChips` จาก token ของ `@nosion/core/nl` · `replaceSpan` (แทน/ลบตามตำแหน่ง — ใช้กับไทยที่ไม่เว้นวรรคได้) ·
    `rawFor` (ค่าที่แก้ → ข้อความที่ parser อ่านกลับได้ชนิดเดิม: วันที่ `9/10/2026`, เวลา `09:30`, `!low`, `#a-b`) · `withDate` · `sameName`
  - `parsed-chips.tsx` — แถว "PARSED:" · กด chip = ตัวแก้ในที่ (date / time / select / text) · Enter ยืนยัน · Esc ยกเลิก (ไม่ล้างทั้งช่อง) · × ลบ
- **Tasks** (`quick-capture.tsx`) — chip วัน/เวลา/การเกิดซ้ำ/priority/แท็ก/โปรเจกต์/ระยะเวลา · ตัวเลือกวันที่ข้างช่องเขียนลงข้อความ ·
  บันทึกผ่าน `POST /parse/commit` (`module: task`) — server สร้างแท็ก/โปรเจกต์ที่ยังไม่มี, กฎการเกิดซ้ำ, การเตือนเอง
  (ลบโค้ด resolve แท็ก/โปรเจกต์ฝั่ง client และ `quick-capture-parser.ts` + เทสต์ของมัน)
- **Expenses** (`expense-capture.tsx`) — chip เงิน/วัน/การเกิดซ้ำ/แท็ก/โปรเจกต์ + หมวดที่ server เดาเป็น select ·
  บันทึกผ่าน `POST /parse/commit` (`module: expense`, `payloadPatch: { category }` เมื่อเปลี่ยนหมวด) —
  **"ค่าน้ำ 150 ทุกวันที่ 20" ได้กฎบิลรายเดือน + การเตือน** (เดิมได้รายการเดียว ไม่เกิดซ้ำ)
- API: `POST /parse/commit` รับ `payloadPatch` (merge ทับ payload แล้วตรวจด้วย payloadSchema ของโมดูล) ·
  `ParsedEntry.status` — โมดูลกำหนดสถานะตอนบันทึก: **รายจ่ายทั่วไป = `done`** บิล = `pending`
  (แก้บั๊กของขั้น 2: "กาแฟ 65" จาก ⌘K เคยเป็น `pending` ต่างจากบันทึกด่วนหน้า Expenses ที่เป็น `done`)

**การตัดสินใจ**

- **ข้อความคือแหล่งความจริงเดียว** — แก้ chip / เลือกวันจาก date picker = เขียนข้อความส่วนนั้นใหม่ · server parse ข้อความเดียวกัน
  สิ่งที่เห็นใน chip จึงเป็นสิ่งที่ถูกบันทึก ไม่มี state สองชุดให้ไม่ตรงกัน · ข้อยกเว้นเดียวคือหมวด (ไม่ได้มาจากข้อความ) → `payloadPatch`
- เงิน/ปริมาณไม่เป็น chip ของงาน ("ซื้อของ 500" = ชื่องาน) — กติกาเดียวกับ task module ฝั่ง API
- หน้า Expenses ยังขอ preview จาก `/expenses/parse` (หมวด, บิล, รายรับ) — `/parse` คืนหลายโมดูลซึ่งหน้านี้ไม่ต้องใช้

**วิธีตรวจ**

- unit `nl-chips.test.ts` 5 เคส — **round-trip**: แก้ chip แล้ว parse ข้อความใหม่ได้ค่าใหม่ชนิดเดิม · ลบในไทยไม่เว้นวรรค · date picker แทน/ต่อท้าย/ลบ
- e2e (mock) +2: Tasks — chip, แก้เวลาใน chip, ลบ priority, date picker เขียนลงข้อความ, ↵ ส่ง `{ text, module: task }` · Expenses — เปลี่ยนหมวด → `payloadPatch`
- integration +1: รายจ่ายทั่วไป `done` · `payloadPatch` แก้หมวดได้ · หมวดที่ไม่มีจริง 422 · บิล `pending` — API 103 + worker 19
- **smoke (API จริง) 4/4** — รวมบันทึกงานจากหน้า Tasks ผ่าน `/parse/commit` และบิลรายเดือนจากหน้า Expenses → "ตั้งบิลประจำแล้ว"
- visual baseline (Docker) 63/63 — 6 ภาพเปลี่ยนเฉพาะ placeholder ของช่องบันทึกด่วน (ตรวจ diff แล้ว) · `pnpm verify` ผ่าน

---

## ขั้น 9 · Keyboard shortcut ครบตาม 8.4 + หน้าต่าง `?` — (รอ commit)

**เป้าหมาย:** ทุกปุ่มในตารางสเปก 8.4 ทำงานจริง และมีหน้าต่างบอกว่ามีปุ่มอะไรบ้าง

**สิ่งที่เปลี่ยน**

- 📁 `apps/web/src/lib/shortcuts/`
  - `keymap.ts` (pure) — ตาราง `SHORTCUTS` (หน้าต่าง `?` อ่านจากที่นี่) · `createKeyReader()` อ่านปุ่มรวม chord `g` + ปุ่ม (ภายใน 1 วินาที) ·
    `PRIORITY_BY_DIGIT` (1 ต่ำ → 4 ด่วน ตาม `PRIORITY_ORDER` ของ contracts)
  - `use-global-shortcuts.ts` — ติดตั้งครั้งเดียวที่ AppShell (แทน handler `[` และ ⌘K เดิม): `⌘K` `n` `/` `g t|k|m|c` `j` `k` `?` `[` `⌘Z`
  - `undo-store.ts` — stack ย้อนกลับ 20 รายการ (หน่วยความจำ) · ผู้กระทำลงทะเบียนวิธีย้อนตอนสำเร็จ
- 📁 `components/shell/shortcuts-dialog.tsx` — หน้าต่าง `?` จัดกลุ่ม ทั่วไป / ไปที่ / รายการ
- 📁 TaskCard — `data-shortcut-item` + `tabIndex` · `e` เสร็จ/เปิดกลับ · `t` พรุ่งนี้ · `x` เลือก · `1–4` ความสำคัญ (ทำงานเมื่อการ์ดเองถูกโฟกัส)
- 📁 TaskBoard — แถบ "เลือก N รายการ" (ทำเสร็จ / เลื่อนไปพรุ่งนี้ / ลบ / ยกเลิกเลือก) ผ่าน `POST /entries/bulk` ·
  ⌘Z ของ ติ๊กเสร็จ → เปิดกลับ · เลื่อน → ย้ายกลับวันเดิม · ลบ → `restore` · ความสำคัญ → ค่าเดิม
- 📁 ปฏิทิน — ⌘Z ของการลากเปลี่ยนวัน (ย้ายกลับ) และติ๊กเสร็จ/จ่ายแล้ว
- `data-shortcut="new"` บนช่องบันทึกด่วนของ Tasks/Expenses · `data-shortcut="search"` บนช่องค้นหางาน
- **แก้ race ของ `<dialog>`**: event `close` มาแบบ async — กด ⌘K เปิด palette ใหม่ก่อน event ของการปิดครั้งก่อนมาถึง palette จะถูกปิดทันที ·
  `onClose` ตั้งสถานะปิดเฉพาะเมื่อ dialog ปิดจริง (palette + หน้าต่าง `?`) — เจอจากเทสต์ ⌘K ที่ล้มเฉพาะตอนเครื่องโหลดหนัก

**การตัดสินใจ**

- **หน้าไม่ต้องลงทะเบียนปุ่ม** — `n` / `/` หา element ที่ติด `data-shortcut` ตัวแรกที่มองเห็น (ช่องเดียวกันมีชุดมือถือ/desktop) ไม่มี = เปิด palette ·
  `j` / `k` เดินตาม `[data-shortcut-item]` ตามลำดับในหน้า — เพิ่มหน้าใหม่ได้โดยไม่แก้ตัวจัดการปุ่ม
- ปุ่มระดับรายการอยู่ที่การ์ด (รู้ว่าตัวเองคือรายการไหนและมี handler อยู่แล้ว) · ไม่จับเมื่อโฟกัสอยู่ที่ปุ่มข้างในการ์ด
- ไม่แย่งปุ่มตอนพิมพ์ (⌘Z ในช่องพิมพ์ = undo ข้อความ) และตอนมี dialog เปิด — ยกเว้น ⌘K
- **⌘Z ใช้ version ที่ server คืนหลังทำสำเร็จ** จึงลงทะเบียนใน `onSuccess` — กด ⌘Z ก่อน server ตอบ = "ไม่มีอะไรให้ย้อนกลับ"
  · การทำหลายรายการพร้อมกัน (bulk) ยังย้อนไม่ได้
- `1–4` = ต่ำ → ด่วน ตาม comment ของ `PRIORITY_ORDER` ("map ปุ่ม 1-4") — ต่างจาก Todoist ที่ p1 สูงสุด

**วิธีตรวจ**

- unit `keymap.test.ts` 5 เคส (chord ภายใน/เกินเวลา · g ตามด้วยปุ่มอื่น · modifier · ตารางครบทุกปุ่มของ 8.4)
- e2e +3: `?` + axe ของหน้าต่าง · `g c` / `g k` · `n` / `/` โฟกัสช่องของหน้า · ไม่มีช่องสร้าง `n` เปิด palette ·
  `j`/`k` → `e` (complete) → ⌘Z (PATCH `status: pending`) → `3` (`priority: high`) → `x` สองรายการ → bulk complete
- UI suite 42/42 สองรอบติด · ใน Linux container (เหมือน CI) เทสต์ปุ่มลัด 10/10 หลังแก้เทสต์ให้รอ toast ก่อน ⌘Z ·
  visual baseline ไม่เปลี่ยน (65 ผ่าน) · `pnpm verify` ผ่าน
