# Phase 4 · Reminder Engine + Worker (สัปดาห์ 12–13) 🔥

> เป้าหมาย: แจ้งเตือนตรงเวลา ไม่ซ้ำ ไม่หาย — PostgreSQL เป็น source of truth, Redis เป็นแค่ตัวตั้งเวลาระยะสั้น (≤ 5 นาที) — สเปก 6.2, 10, 15 Phase 4
> **DoD:** ตั้งเตือนล่วงหน้า 1 วัน → ได้รับ push จริงบนมือถือ ตรงเวลา ±60 วินาที · กด "จ่ายแล้ว" จาก notification ได้โดยไม่เปิดแอป
> ความรู้เบื้องหลัง: บท 17 (ยังไม่เขียน)

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                                              | Commit | สถานะ |
| --- | ------------------------------------------------------------------------------------------------- | ------ | ----- |
| 1   | API: reminder CRUD + `fireAt` ตามวันของ entry (แก้/เลื่อน) + reminder ใน template ของกฎการเกิดซ้ำ |        | ▶     |
| 2   | Worker: sweeper ทุก 1 นาที + processor (guard, quiet hours, retry, DLQ) + integration test        |        | ⏳    |
| 3   | Web Push: VAPID · subscribe · service worker · ปุ่ม "จ่ายแล้ว / เลื่อน" โดยไม่เปิดแอป             |        | ⏳    |
| 4   | Email: Resend + React Email 6 แบบ · Mailpit ในเครื่อง                                             |        | ⏳    |
| 5   | Daily digest ตามโซนผู้ใช้ (สเปก 10.2) + ตั้งค่า quiet hours / digest ในหน้า Settings              |        | ⏳    |
| 6   | Metrics `reminder_delivery_lag_seconds` + alert                                                   |        | ⏳    |
| 7   | Staging: worker + Redis บน Fly.io (region sin) · DoD บนมือถือจริง · บท learn 17 · ADR             |        | ⏳    |

**ตัดสินใจก่อนเริ่ม:** worker บน staging รันที่ **Fly.io** (เจ้าของบัญชีเลือก 15 ต.ค. 2026) — Vercel Cron แผนฟรีรันได้วันละครั้ง
แต่ sweeper ต้องรันทุกนาที และ BullMQ poll Redis ตลอดเวลาจนโควตาฟรีของ Upstash ไม่พอ

---

## ขั้น 1 · API: reminder CRUD + fireAt ตามวันของ entry — (รอ commit)

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
