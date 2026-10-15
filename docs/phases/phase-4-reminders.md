# Phase 4 · Reminder Engine + Worker (สัปดาห์ 12–13) 🔥

> เป้าหมาย: แจ้งเตือนตรงเวลา ไม่ซ้ำ ไม่หาย — PostgreSQL เป็น source of truth, Redis เป็นแค่ตัวตั้งเวลาระยะสั้น (≤ 5 นาที) — สเปก 6.2, 10, 15 Phase 4
> **DoD:** ตั้งเตือนล่วงหน้า 1 วัน → ได้รับ push จริงบนมือถือ ตรงเวลา ±60 วินาที · กด "จ่ายแล้ว" จาก notification ได้โดยไม่เปิดแอป
> ความรู้เบื้องหลัง: บท 17 (ยังไม่เขียน)

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                                              | Commit      | สถานะ |
| --- | ------------------------------------------------------------------------------------------------- | ----------- | ----- |
| 1   | API: reminder CRUD + `fireAt` ตามวันของ entry (แก้/เลื่อน) + reminder ใน template ของกฎการเกิดซ้ำ | `b8a1e31`   | ✅    |
| 2   | Worker: sweeper ทุก 1 นาที + processor (guard, quiet hours, retry, DLQ) + integration test        | (รอ commit) | ✅    |
| 3   | Web Push: VAPID · subscribe · service worker · ปุ่ม "จ่ายแล้ว / เลื่อน" โดยไม่เปิดแอป             |             | ⏳    |
| 4   | Email: Resend + React Email 6 แบบ · Mailpit ในเครื่อง                                             |             | ⏳    |
| 5   | Daily digest ตามโซนผู้ใช้ (สเปก 10.2) + ตั้งค่า quiet hours / digest ในหน้า Settings              |             | ⏳    |
| 6   | Metrics `reminder_delivery_lag_seconds` + alert                                                   |             | ⏳    |
| 7   | Staging: worker + Redis บน Fly.io (region sin) · DoD บนมือถือจริง · บท learn 17 · ADR             |             | ⏳    |

**ตัดสินใจก่อนเริ่ม:** worker บน staging รันที่ **Fly.io** (เจ้าของบัญชีเลือก 15 ต.ค. 2026) — Vercel Cron แผนฟรีรันได้วันละครั้ง
แต่ sweeper ต้องรันทุกนาที และ BullMQ poll Redis ตลอดเวลาจนโควตาฟรีของ Upstash ไม่พอ

---

## ขั้น 1 · API: reminder CRUD + fireAt ตามวันของ entry — `b8a1e31`

**เป้าหมาย:** จด "ต้องเตือนเมื่อไร" ลง PostgreSQL ให้ถูกเสมอ ไม่ว่ารายการจะถูกสร้าง เลื่อน หรือเกิดจากกฎการเกิดซ้ำ — worker (ขั้น 2) อ่านจากที่นี่อย่างเดียว

**สิ่งที่เปลี่ยน**

- 📁 `packages/contracts/src/reminders.ts` — `createReminderSchema`, `ReminderDto` · `recurrenceTemplateSchema.reminders`
- 📁 `apps/api/src/reminders/` — `GET/POST /entries/:id/reminders`, `DELETE /reminders/:id` ·
  `reminder-plan.ts` (ฟังก์ชันล้วน: `fireAtFor`, `reminderKey`, `rescheduleData`) · `RemindersService.createForEntries / rescheduleForEntries`
- 📁 `entries.service.ts` — สร้างรายการ + การเตือนใน transaction เดียว · PATCH ย้ายวัน / defer / bulk defer → เลื่อนการเตือนตาม
- 📁 `recurrence.service.ts` — materialize สร้างการเตือนของแต่ละรอบจาก `template.reminders`

**การตัดสินใจ**

- **key กันซ้ำ = `entryId:channel:offset`** (unique ใน DB) — กดเพิ่มซ้ำ, materialize ซ้ำ, หรือสร้างพร้อมรายการแล้วเพิ่มผ่าน endpoint อีก ก็ได้แถวเดิม
  · เดิมตอนสร้างรายการใช้ `clientId ?? uuid` ซึ่งไม่ผูกกับ entry — เปลี่ยนเป็นสร้าง entry ก่อนแล้วสร้างการเตือนใน transaction เดียวกัน
- **ลบ = `cancelled`** ไม่ลบแถว (เก็บประวัติ) · เพิ่มกลับ = upsert เป็น `scheduled`
- **ย้ายวัน:** fireAt ใหม่ยังไม่ถึง → ตั้งเตือนใหม่แม้เคยส่งแล้ว (เลื่อนบิลไปพรุ่งนี้ = อยากถูกเตือนตามวันใหม่) · ผ่านไปแล้ว → เลื่อนเวลาอย่างเดียว ·
  ที่ผู้ใช้ยกเลิกเองไม่แตะ · `jobId` ล้างทุกครั้ง — job ที่อยู่ในคิวแล้วกลายเป็นของเก่า (worker ต้องเทียบ fireAt ก่อนยิง — ขั้น 2)
- **ไม่ sync ตอน "ทำเสร็จ / ลบ / เอาวันออก"** — worker ตรวจสถานะ entry ล่าสุดก่อนยิงทุกครั้ง (guard ตามสเปก 6.2) จุดที่ต้อง sync จึงเหลือแค่การย้ายวัน
- `entry ไม่มีวันกำหนด` หรือโมดูลไม่รองรับการเตือน → 422

**วิธีตรวจ**

- unit `reminder-plan.spec.ts` 6 เคส · integration `test/reminders.int-spec.ts` 6 เคส: fireAt ล่วงหน้า 1 วัน + เพิ่มซ้ำได้แถวเดิม,
  สร้างพร้อมเตือนแล้วเพิ่มซ้ำไม่เกิดแถวใหม่, 422 ไม่มีวัน + ยกเลิกซ้ำได้ + เพิ่มกลับ, ย้ายวันทั้ง 3 ทาง (PATCH/defer/bulk),
  กฎวันที่ 31 + เตือนล่วงหน้า 1 วัน (รอบ ก.พ. เตือน 27 ก.พ. เวลาไทย) + materialize ซ้ำ, IDOR 404
- integration ทั้งชุด 71/71 · `pnpm verify`

**สิ่งที่ค้าง**

- ยังไม่มี UI ตั้งเตือน — ทำพร้อม Web Push (ขั้น 3)
- `PATCH /entries/:id?scope=series` ยังแก้ `template.reminders` ไม่ได้ (แก้ผ่าน `PATCH /recurrence-rules/:id` ได้)

---

## ขั้น 2 · Worker: sweeper + processor + retry + DLQ — (รอ commit)

**เป้าหมาย:** ยิงการเตือนตรงเวลา ไม่ซ้ำ ไม่หาย ตามสถาปัตยกรรม 2 ชั้นของสเปก 6.2 (transactional outbox + polling publisher)

**สิ่งที่เปลี่ยน**

- 📁 `packages/core/src/quiet-hours.ts` — `isInQuietHours`, `quietHoursEnd` (ข้ามเที่ยงคืน · ตามหน้าปัดโซนผู้ใช้ · ถูกต้องข้าม DST)
- 📁 `apps/worker/src/reminders/`
  - `sweeper.ts` — ทุกนาที: ปิดที่พลาดเกิน 1 ชม. → ส่งที่จะถึงใน 5 นาทีเข้าคิวพร้อม delay → จด jobId กลับ DB
  - `processor.ts` — guard (ไม่พบ / ไม่ใช่ scheduled / job เก่า / ลบ / ทำเสร็จ / ไม่มีวัน) → quiet hours → ส่ง → จดผล
  - `message.ts` — หัว/เนื้อความ ("ค่าเน็ต ฿799.00" · "ครบกำหนดพรุ่งนี้") · tag ต่อ entry · ปุ่ม "จ่ายแล้ว / เลื่อน 1 วัน"
  - `dispatcher.ts` — interface + `PermanentDeliveryError` + `LogDispatcher` (ช่องทางจริงมาขั้น 3–4)
  - `pipeline.ts` — ประกอบคิว `reminder-sweep` → `reminder` → `reminder-dlq` · `main.ts` เรียกใช้
- 📁 `apps/worker/vitest.config.ts` (unit / integration) · 📁 `turbo.json` — integration ของ worker รันต่อจากของ API

**การตัดสินใจ**

- **jobId = `reminderId-fireAtMs`** — BullMQ ไม่รับ id ซ้ำ: sweep ซ้อนกันหรือทุกนาทีก็ไม่เกิด job ซ้ำ · Redis ถูกล้าง = รอบถัดไปส่งเข้าคิวใหม่เอง
  (sweeper จึงไม่กรอง `jobId IS NULL` — ถ้ากรอง reminder ที่ job หายไปกับ Redis จะไม่ถูกส่งอีกเลย)
- **at-least-once ไม่ใช่ at-most-once** — ล้มกลางทางแล้ว retry อาจส่งซ้ำได้ (หายาก) แต่ notification ใช้ tag เดียวกันต่อ entry
  เครื่องปลายทางแสดงทับเป็นอันเดียว · กลับกัน at-most-once ทำให้การเตือนหายเงียบ ซึ่งแย่กว่า
- **job เก่า:** processor เทียบ `fireAt` ใน job กับ DB — ผู้ใช้เลื่อนวันหลังเข้าคิวแล้ว job เดิมถูกข้าม (คู่กับขั้น 1 ที่ล้าง jobId)
- **ทำเสร็จ / ลบ / ไม่มีวัน → `cancelled`** ตอนจะยิง ไม่ใช่ตอนเขียน — sweeper จะไม่หยิบซ้ำทุกนาที
- **quiet hours → เลื่อน `fireAt` ไปเวลาจบช่วง** แล้วให้ sweeper หยิบใหม่ (ไม่ทิ้ง) · ไม่ใช้กับ webhook (เครื่องคุยกับเครื่อง)
- **พลาดเกิน 1 ชม. → failed "ไม่ส่งย้อนหลัง"** _(ตัดสินเอง)_ — worker ล่มทั้งคืนแล้วเช้ามายิง "ครบกำหนดพรุ่งนี้" ของเมื่อวานสร้างความสับสน
- ล้มถาวร (`PermanentDeliveryError` เช่นไม่มี subscription / 410) → failed ทันที ไม่เผา retry และไม่เข้า DLQ
- retry: 5 ครั้ง backoff 30s→8m ตามสเปก · ครบแล้วคัดลอก job เข้า `reminder-dlq` ไว้ retry ด้วยมือ

**วิธีตรวจ**

- unit: quiet hours 13 เคส (รวมคืนเปลี่ยน DST ของนิวยอร์ก) · ข้อความ 9 เคส (วันตามโซนผู้ใช้ ไม่ใช่ UTC)
- integration worker 9 เคส กับ PostgreSQL + Redis จริงผ่าน pipeline ตัวจริง: **ยิงตรงเวลา** (lag < 1s จาก fireAt) ·
  **ไม่ยิงซ้ำ** (sweep พร้อมกัน 3 + ซ้ำ → ส่ง 1) · **retry** (ล้ม 2 แล้วสำเร็จ attempts=2) · ครบ 5 → failed + DLQ ·
  ล้มถาวร → 1 ครั้ง · guard (ทำเสร็จ/ลบ/job เก่า) · quiet hours 23:00 → 07:00 ไทย · sweeper (พลาด >1 ชม. / <5 นาที / >5 นาที)
- integration ทั้ง repo: API 71 + worker 9 · `pnpm verify`
- ⚠️ ยังไม่ได้รัน worker ค้างไว้จริงข้ามนาที (`pnpm dev`) — เทสต์เรียก sweep เอง ส่วน job scheduler ทุกนาทีตรวจตอน deploy (ขั้น 7)

**สิ่งที่ค้าง**

- ยังไม่มีหน้า admin retry DLQ (สเปก 6.2) — ดู/ลองใหม่ผ่าน Redis ได้ก่อน
- หลายช่องทาง (push + email) ของการเตือนเดียวกันเป็นคนละแถวอยู่แล้ว — ไม่ต้องทำเพิ่ม
