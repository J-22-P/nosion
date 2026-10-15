# Phase 4 · Reminder Engine + Worker (สัปดาห์ 12–13) 🔥

> เป้าหมาย: แจ้งเตือนตรงเวลา ไม่ซ้ำ ไม่หาย — PostgreSQL เป็น source of truth, Redis เป็นแค่ตัวตั้งเวลาระยะสั้น (≤ 5 นาที) — สเปก 6.2, 10, 15 Phase 4
> **DoD:** ตั้งเตือนล่วงหน้า 1 วัน → ได้รับ push จริงบนมือถือ ตรงเวลา ±60 วินาที · กด "จ่ายแล้ว" จาก notification ได้โดยไม่เปิดแอป
> ความรู้เบื้องหลัง: [บท 17](../learn/17-phase4-reminders-push-email-and-worker.md) · [ADR-011](../adr/011-reminders-outbox-polling.md)

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                                              | Commit                              | สถานะ                 |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------- |
| 1   | API: reminder CRUD + `fireAt` ตามวันของ entry (แก้/เลื่อน) + reminder ใน template ของกฎการเกิดซ้ำ | `b8a1e31`                           | ✅                    |
| 2   | Worker: sweeper ทุก 1 นาที + processor (guard, quiet hours, retry, DLQ) + integration test        | `3a3daae`                           | ✅                    |
| 3   | Web Push: VAPID · subscribe · service worker · ปุ่ม "จ่ายแล้ว / เลื่อน" โดยไม่เปิดแอป             | `f2b699e` · `c257537`               | ✅                    |
| 4   | Email: Resend + React Email 6 แบบ · Mailpit ในเครื่อง                                             | `7e58335`                           | ✅                    |
| 5   | Daily digest ตามโซนผู้ใช้ (สเปก 10.2) + ตั้งค่า quiet hours / digest ในหน้า Settings              | `aea4a10`                           | ✅                    |
| 6   | Metrics `reminder_delivery_lag_seconds` + alert                                                   | `07f048d`                           | ✅                    |
| 7   | Staging: worker + Redis บน Fly.io (region sin) · DoD บนมือถือจริง · บท learn 17 · ADR             | `aa4f460` · `bc0dd63` · (รอ commit) | 🟡 รอรัน wizard + DoD |

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

## ขั้น 2 · Worker: sweeper + processor + retry + DLQ — `3a3daae`

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

---

## ขั้น 3a · Web Push ฝั่ง server + ปุ่มใน notification — `f2b699e`

**เป้าหมาย:** worker ส่ง push จริงถึงทุกเครื่องของผู้ใช้ และกด "จ่ายแล้ว / เลื่อน 1 วัน" จาก notification ได้โดยไม่ต้องล็อกอิน

**สิ่งที่เปลี่ยน**

- 📁 `packages/contracts/src/push.ts` — subscribe / unsubscribe / notification action / `PushConfigDto`
- 📁 `packages/core/src/action-token.ts` — `signActionToken` / `verifyActionToken` (HMAC-SHA256 · ผูก user + entry · 7 วัน) · core ได้ `@types/node`
- 📁 `apps/api/src/push/` — `GET /push/config`, `POST /push/subscribe`, `DELETE /push/unsubscribe`,
  `POST /notifications/actions` (`@Public` · rate limit 30/นาที) · env `VAPID_PUBLIC_KEY`, `NOTIFICATION_ACTION_SECRET`
- 📁 `apps/worker/src/reminders/web-push.dispatcher.ts` — `web-push@3.6.7` · `main.ts` เลือก dispatcher ตาม env
- 📁 `scripts/setup-dev.mjs` สุ่มคู่กุญแจ VAPID (ECDH P-256 ด้วย `node:crypto` ไม่ต้องลง lib) + secret ให้ · `.env.example`, `docker-compose.yml`, `turbo.json` (env ของ `dev`)

**การตัดสินใจ**

- **ปุ่มใน notification ยืนยันตัวด้วย action token ไม่ใช่ access token** — service worker เข้าถึง access token ไม่ได้ (เก็บใน memory ของหน้าเว็บตามสเปก 9.1)
  token ผูก user + entry และทำได้แค่ complete/defer → หลุดไปก็แตะได้รายการเดียว · payload ของ Web Push เข้ารหัสถึงเบราว์เซอร์อยู่แล้ว (RFC 8291)
  · ทางเลือกที่ไม่เลือก: device token ต่อ subscription เก็บใน IndexedDB — ไม่ต้องแชร์ secret ระหว่าง API/worker แต่โค้ดฝั่ง SW มากกว่ามาก
  · ข้อเสียที่ยอมรับ: logout แล้ว token ใน notification ที่ค้างอยู่ยังใช้ได้จนหมดอายุ
- token ผิด/หมดอายุ → 401 ข้อความเดียว (ไม่บอกเหตุผล) · token ถูกแต่ entry ไม่ใช่ของ user ใน token → 404 ตามกฎ IDOR เดิม
- **endpoint เป็นของเครื่อง ไม่ใช่ของบัญชี** — subscribe เครื่องเดิมด้วยบัญชีอื่น = ย้ายเจ้าของ (กันการเตือนของคนเก่าเด้งบนเครื่องคนใหม่)
- dispatcher: ไม่มีเครื่องเลย / ทุกเครื่องตอบ 404·410 → ล้มถาวร (ลบ subscription ที่ตาย) · สำเร็จ ≥ 1 เครื่อง = สำเร็จ · 5xx ทุกเครื่อง → retry
- ไม่ตั้ง VAPID = บันทึก log แทนส่ง · ไม่ตั้ง secret = notification ไม่มีปุ่ม (กดแล้วเปิดแอป) — ระบบยังขึ้นได้ทุกกรณี

**วิธีตรวจ**

- unit: action token 10 เคส (หมดอายุ · secret ผิด · แก้ entryId ใน body · รูปแบบผิด) · WebPushDispatcher 7 เคส (ทุกเครื่อง · ไม่มี secret · 410 ลบ · 5xx retry · fallback)
- integration API `test/push.int-spec.ts` 6 เคส: config · subscribe ซ้ำ/ย้ายเจ้าของ/unsubscribe เฉพาะของตัวเอง · 422 ·
  **กด "จ่ายแล้ว" โดยไม่มี access token → done** · "เลื่อน 1 วัน" → วัน + การเตือนเลื่อนตาม · token ปลอม/หมดอายุ/secret ผิด 401 · token ของคนอื่น 404
- กุญแจที่ `setup:dev` สร้างผ่าน `webpush.setVapidDetails` (ตรวจความยาว/รูปแบบ) · integration ทั้งชุด API 77 + worker 9 · `pnpm verify`
- ⚠️ ยังไม่ได้ส่งถึง push service จริง (FCM / APNs) — ทำพร้อมฝั่งเว็บ (3b)

---

## ขั้น 3b · Web Push ฝั่งเว็บ: service worker + เปิดการแจ้งเตือน + เตือนบิล — `c257537`

**เป้าหมาย:** ผู้ใช้เปิดการแจ้งเตือนบนเครื่องได้เอง ตั้ง "เตือนล่วงหน้า" ตอนสร้างรอบบิล และกดปุ่มใน notification ได้โดยไม่เปิดแอป

**สิ่งที่เปลี่ยน**

- 📁 `apps/web/public/sw.js` — `push` → แสดง notification (tag ต่อรายการ · ปุ่มจาก payload) ·
  `notificationclick` → ปุ่ม = `POST /api/v1/notifications/actions` เบื้องหลัง แล้วบอกแท็บที่เปิดอยู่ให้รีเฟรช · แตะตัว notification = เปิด/โฟกัสแอปที่หน้าของโมดูล
- 📁 `features/notifications/` — `push.ts` (ตรวจความพร้อมเป็นฟังก์ชันล้วน · subscribe/unsubscribe), `use-push.ts` (`ServiceWorkerBridge` ใน `providers.tsx`),
  `notifications-card.tsx` ในหน้า Settings
- 📁 `new-bill-dialog.tsx` — "เตือนทุกรอบ": ไม่เตือน / เช้าวันครบกำหนด / ล่วงหน้า 1 วัน (ค่าเริ่มต้น) / 3 วัน — เวลา 09:00
- 📁 `vitest.config.ts` ของ web — alias `@/` ให้เทสต์ import โมดูลที่ใช้ path alias ได้

**การตัดสินใจ**

- **SW เป็นไฟล์ static ไม่ผ่าน bundler** และไม่มี `fetch` handler — ไม่แคชอะไร จึงไม่กระทบการโหลดหน้า (offline เป็นเรื่องของ Phase 7)
- **บอกที่อยู่ API ให้ SW ผ่าน query ตอน register** (`/sw.js?api=…`) — local API อยู่คนละพอร์ต · staging ใช้ proxy origin เดียวกัน (ไม่ส่ง)
- **บิลเตือนเวลา 09:00** ไม่ใช่ 00:00 — รายการทั้งวันคือเที่ยงคืน เตือนตอนนั้นจะตกช่วงห้ามรบกวนแล้วถูกเลื่อนไป 07:00 (ขั้น 2) ซึ่งผู้ใช้ไม่ได้เลือกเอง
  · ล่วงหน้า 1 วัน = −1440 + 540 = **−900 นาที**
- สถานะเป็นของ "เครื่องนี้" ไม่ใช่บัญชี — การ์ดบอก 6 สถานะ: เปิด / ปิด / ถูกบล็อก (บอกวิธีเปิดสิทธิ์) / iPhone ที่ยังไม่ติดตั้งลงหน้าจอโฮม / ไม่รองรับ / เซิร์ฟเวอร์ยังไม่ตั้ง VAPID
- ปิดการแจ้งเตือน: ลบที่ API ก่อนแล้วค่อยยกเลิกกับเบราว์เซอร์ — ถ้าลบที่ API ไม่สำเร็จยังกดใหม่ได้ (กลับลำดับจะเหลือ subscription กำพร้าที่ worker ส่งไปแล้วได้ 410)

**วิธีตรวจ**

- unit web `push.test.ts` 9 เคส (สถานะทั้ง 6 · base64url → bytes · URL ของ SW) → web unit 74/74
- Playwright `ui` 23/23: บิลวันที่ 31 ส่ง `reminders: [{ push, −900 }]` · การ์ดแจ้งเตือนสถานะ "ยังไม่เคยถาม" มีปุ่ม / "ถูกบล็อก" ไม่มีปุ่มและอธิบายวิธีเปิด ·
  axe ผ่านทุกหน้ารวม /settings · SW ลงทะเบียนระหว่างเทสต์โดยไม่กระทบหน้า (ไม่มี fetch handler)
- `pnpm verify`
- ⚠️ **ยังไม่ได้ทดสอบ push จริงจากต้นจนจบ** (subscribe กับ FCM/APNs → worker ส่ง → notification เด้ง → กดปุ่ม) — Chromium ของ Playwright subscribe กับ push service จริงไม่ได้
  ทำบนมือถือจริงในขั้น 7 ตาม DoD · headless Chromium ตอบ `Notification.permission = denied` เสมอ เทสต์สถานะ "ยังไม่เคยถาม" จึงจำลองด้วย init script

**สิ่งที่ค้าง**

- ยังตั้งเตือนให้งาน (Tasks) จากหน้าเว็บไม่ได้ — API พร้อมแล้ว (ขั้น 1)
- `.env` ที่มีอยู่แล้วในเครื่องไม่ถูกเติมค่า VAPID อัตโนมัติ (`setup:dev` เติมเฉพาะตอนสร้าง .env ใหม่)

---

## ขั้น 4 · Email: React Email 7 แบบ + Resend / Mailpit + เลิกรับอีเมล — `7e58335`

**เป้าหมาย:** template อีเมลครบตามสเปก 10.3 ใช้ร่วมกันทั้ง API และ worker · สลับผู้ให้บริการด้วย env · ทุกอีเมลแจ้งข่าวสารเลิกรับได้จริง

**สิ่งที่เปลี่ยน**

- 📁 `packages/emails/` (แพ็กเกจใหม่ · server-only) — `layout.tsx` (monochrome ตาม ADR-009 · inline style · ฟอนต์ไทยสำรอง) ·
  `templates/` 6 แบบตามสเปก (ยืนยันอีเมล · ตั้งรหัสผ่านใหม่ · แจ้งเตือนความปลอดภัย · สรุปรายวัน · สรุปสัปดาห์ · งบใกล้เต็ม/เกิน) + การเตือนทางอีเมล ·
  `renderEmail(kind, props)` → `{ subject, html, text }` · `createMailTransport` (`log` / `smtp` / `resend`)
- 📁 `packages/core/src/action-token.ts` — token แยกจุดประสงค์ (`action` / `unsubscribe`) · `signUnsubscribeToken` อายุ 180 วัน
- 📁 `apps/api/src/infra/mail/mail.service.ts` ใช้ template + transport จริง · env `MAIL_DRIVER`, `RESEND_API_KEY`
- 📁 `apps/api/src/email/` — `GET/POST /email/unsubscribe?token=` (`@Public`)
- 📁 `apps/worker/src/reminders/email.dispatcher.ts` — `EmailDispatcher` + `ChannelRouter` (push / email / log)
- 📁 CI integration มี service Mailpit · `docker-compose.yml`, `.env.example` (`MAIL_DRIVER=smtp`), `turbo.json`, Dockerfile ทั้งสามมี `packages/emails`

**การตัดสินใจ**

- **แพ็กเกจแยก `@nosion/emails`** — API ส่งอีเมลบัญชี worker ส่ง digest/การเตือน ใช้ template ชุดเดียว · ไม่ใส่ใน `core` เพราะพา React + nodemailer ไปด้วย
- **Resend ผ่าน HTTP ตรง ๆ** ไม่ลง SDK — เรียก endpoint เดียว · 4xx (ยกเว้น 429) = ล้มถาวร ไม่ retry · 429/5xx = retry
- **`MAIL_DRIVER` ค่าเริ่มต้น `log`** — เทสต์/CI ไม่ต่อเครือข่าย · dev ตั้ง `smtp` (Mailpit) · staging ตั้ง `resend` · ตั้ง `resend` แต่ไม่มี key = ล้มตั้งแต่ boot
- **เลิกรับ: GET แค่แสดงหน้ายืนยัน การเลิกรับจริงเป็น POST เสมอ** — ตัวสแกนลิงก์ของผู้ให้บริการอีเมล (Outlook Safe Links ฯลฯ) กด GET เอง
  ถ้า GET เลิกรับทันที ผู้ใช้ถูกยกเลิกโดยไม่ได้กดอะไร · POST เดียวกันรองรับ one-click ของ Gmail/Yahoo (RFC 8058 `List-Unsubscribe-Post`)
- token เลิกรับอายุ 180 วัน (คนเปิดอีเมลเก่าแล้วกดเลิกรับต้องได้ผล) · token แยก purpose ในข้อมูลที่เซ็น → token ปุ่ม notification ใช้แทน token เลิกรับไม่ได้แม้ secret เดียวกัน
- อีเมลธุรกรรม (ยืนยัน/รีเซ็ต/ความปลอดภัย/การเตือนที่ผู้ใช้ตั้งเอง) มีลิงก์ "ตั้งค่าการแจ้งเตือน" แทนลิงก์เลิกรับ — เลิกรับอีเมลยืนยันตัวตนไม่ได้
- บัญชีทดลองไม่ได้รับอีเมลการเตือนจริง (สเปก 9.4) → ล้มถาวร
- แจ้งเตือนความปลอดภัยส่งไม่สำเร็จ → log อย่างเดียว ไม่ทำให้การเพิกถอน session ล้ม

**วิธีตรวจ**

- unit `@nosion/emails` 13 เคส: ทั้ง 7 แบบ · กลุ่มว่างไม่แสดง · **ชื่อรายการที่มี HTML ถูก escape** · Resend: request/permanent ตามสถานะ
- unit worker 23 (EmailDispatcher: ส่ง · demo/ลบแล้ว/ไม่พบ ไม่ส่ง · ถาวร vs ชั่วคราว · ChannelRouter) · core token 12
- integration: **ส่งจริงผ่าน SMTP เข้า Mailpit** แล้วอ่านกลับ — หัวเรื่องไทยถูก encode, html+text, `List-Unsubscribe-Post` ถึงปลายทาง ·
  API `email.int-spec.ts` 3 เคส (GET ไม่เปลี่ยนอะไร · POST/one-click ปิดเฉพาะชนิดนั้นและซ้ำได้ · token ผิดไม่เปลี่ยนอะไร)
- build CJS ของแพ็กเกจ require จาก Node ได้ · integration API 80 + worker 10 · `pnpm verify`

**สิ่งที่ค้าง**

- ⚠️ **Docker image ของ worker build ไม่ผ่าน (มีมาก่อนขั้นนี้)** — CI build ด้วย turbo ไม่เคย build image จึงไม่มีใครเห็น:
  stage builder ไม่มี `apps/api/node_modules` ให้ `prisma generate` และ stage runner ติดตั้ง dependency ใหม่โดยไม่ generate client → แก้พร้อม deploy Fly.io (ขั้น 7)
- ยังไม่ได้ทดสอบกับ Resend จริง (ต้องมีบัญชี + โดเมนที่ยืนยันแล้ว — staging ขั้น 7) · หน้า `/verify-email`, `/reset-password` ฝั่งเว็บยังไม่มี (มีมาตั้งแต่ Phase 1)
- งานส่งสรุปสัปดาห์และงบเกิน (cron/event) ยังไม่มี — template พร้อมแล้ว · สรุปรายวันทำในขั้น 5

---

## ขั้น 5 · สรุปรายวันตามนาฬิกาของผู้ใช้ + ตั้งค่าห้ามรบกวน/สรุป — `aea4a10`

**เป้าหมาย:** อีเมลสรุปตอนเช้าถึงทุกคนตามเวลาท้องถิ่นของตัวเอง ไม่ซ้ำ ไม่ตกหล่น (สเปก 10.2) และผู้ใช้ตั้งช่วงห้ามรบกวน/เวลาสรุปเองได้

**สิ่งที่เปลี่ยน**

- 📁 `apps/worker/src/digest/daily-digest.ts` — `findDueDigests` (SQL ตามสเปก 10.2) · `claimDigest` · `buildDigest` · `runDailyDigest` · `main.ts` คิว `digest` ทุก 15 นาที
- 📁 `apps/web/src/features/notifications/preferences-card.tsx` ในหน้า Settings · `authApi.updateSettings` (`PATCH /me/settings` ที่มีอยู่แล้ว)
- 📁 `packages/contracts/src/organization.ts` — เวลา `HH:mm` ต้องมีจริง (00:00–23:59)

**การตัดสินใจ**

- **หน้าต่าง 3 ชั่วโมง แทนการเทียบนาทีตรง ๆ ตามสเปก** — cron ทุก 15 นาทีไม่มีทางตรงกับ 07:05 พอดี และถ้า worker ล่มตอน 07:00 รอบ 07:15 ยังส่งได้
  แต่ไม่ส่ง "สรุปเช้า" ตอนบ่าย · เวลาที่ตั้งหลัง 21:00 หน้าต่างถูกตัดที่เที่ยงคืน (ยอมรับ)
- **"ส่งแล้ววันนี้" = `lastDigestSentAt` หลังเที่ยงคืนของวันนั้นตามโซนผู้ใช้** (คำนวณใน SQL) — 06:30 ไทยของวันที่ 10 = 23:30 UTC ของวันที่ 9 ต้องนับเป็นวันที่ 10
- **จองสิทธิ์ก่อนส่ง** (`updateMany ... WHERE lastDigestSentAt < เที่ยงคืน`) — worker สองตัวรันซ้อนได้ตัวเดียว · ส่งไม่สำเร็จ → คืนค่าเดิม รอบถัดไปลองใหม่
  · digest เป็น at-most-once ต่างจากการเตือน (at-least-once): สรุปซ้ำสองฉบับรบกวนกว่าสรุปหายหนึ่งวัน
- **ไม่ส่งในวันที่ไม่มีอะไร** _(ตัดสินเอง — สเปกไม่ได้ระบุ)_ — "วันนี้ว่าง" ทุกเช้าทำให้คนเลิกอ่านฉบับที่มีเรื่องจริง (ยังนับว่าจัดการแล้ว ไม่ query ซ้ำทุก 15 นาที)
- **ไม่มี secret สำหรับลิงก์เลิกรับ = ไม่ส่ง digest เลย** — อีเมลแจ้งข่าวสารที่เลิกรับไม่ได้ไม่ควรออกไป
- เนื้อหา: งานเลยกำหนด · งานวันนี้ (มีเวลาแสดงเวลา) · บิลที่ยังไม่จ่ายใน 7 วัน (มียอดเงิน) — ไม่เอารายจ่ายทั่วไป ไม่เอาที่ทำเสร็จแล้ว · สูงสุดกลุ่มละ 10
- บัญชีทดลองไม่ได้รับ digest · ยังไม่บังคับว่าต้องยืนยันอีเมลแล้ว (หน้าเว็บ `/verify-email` ยังไม่มี — ถ้าบังคับตอนนี้จะไม่มีใครได้รับเลย)
- หน้าตั้งค่า: บันทึกครั้งเดียวทั้งการ์ด · ปุ่มบันทึกเปิดเมื่อมีการแก้ · เวลาเริ่ม = เวลาจบถูกกันไว้ (เท่ากับไม่มีช่วงห้าม ทำให้สับสน)

**วิธีตรวจ**

- integration worker `test/digest.int-spec.ts` 9 เคสกับ PostgreSQL จริง: **07:00 ไทยถึงเวลาตอน 00:05 UTC / นิวยอร์กตอน 12:05 UTC** ·
  หน้าต่าง (06:59 ไม่ · 09:59 ส่ง · 10:00 ไม่) · ส่งแล้ววันนี้ตามวันของผู้ใช้ · ปิด/demo/ลบ · จองพร้อมกัน 3 ได้ 1 ·
  เนื้อหา (รวม/ไม่รวมอะไร + ลิงก์เลิกรับที่ตรวจผ่าน) + รันซ้ำไม่ส่งซ้ำ · ว่าง = ไม่ส่ง · ล้มแล้วคืนสิทธิ์ · ไม่มี secret
- contracts: เวลา HH:mm 9 เคส · Playwright `ui` 24/24 (แก้เวลา → PATCH เฉพาะ 5 ค่า · เวลาเริ่ม=จบถูกกัน · axe)
- integration API 80 + worker 19 · `pnpm verify`
- ⚠️ ยังไม่ได้รัน worker ค้างไว้ให้ scheduler ทุก 15 นาทียิงจริง — ตรวจตอน deploy (ขั้น 7)

**สิ่งที่ค้าง**

- งานส่งสรุปสัปดาห์ (`weekly-review`) และงบเกิน (`budget-alert`) — template พร้อมแล้ว ยังไม่มีงานส่ง
- ตั้งค่าสรุปสัปดาห์ในหน้าเว็บยังไม่มี (ยังไม่มีอะไรส่ง)

---

## ขั้น 6 · Metrics `reminder_delivery_lag_seconds` + alert — `07f048d`

**เป้าหมาย:** วัดได้ว่าการเตือน "ช้ากว่ากำหนดกี่วินาที" (metric สำคัญที่สุดตามสเปก 14.3) และมีกฎ alert ที่ทดสอบแล้วว่าดังถูกเวลา

**สิ่งที่เปลี่ยน**

- 📁 `apps/worker/src/metrics.ts` — `prom-client@15.1.3`: `reminder_delivery_lag_seconds{channel}` · `reminder_failures_total{channel,kind}` ·
  `queue_jobs_total{queue,status}` · `queue_job_duration_seconds{queue}` · `queue_depth{queue,state}` (+ metric มาตรฐานของ process)
- 📁 `apps/worker/src/server.ts` — HTTP ที่ `METRICS_PORT` (9464): `/metrics`, `/healthz`, `/readyz` · `pipeline.ts` / `main.ts` บันทึกค่า
- 📁 `ops/prometheus/alerts.yml` + `alerts.test.yml` — `ReminderDeliveryLagHigh` (p95 > 120 วินาที 5 นาที) · `QueueBacklogHigh` (waiting > 1000 นาน 5 นาที) · `ReminderDeadLetters`
- 📁 CI job "Alert rules" — `promtool check rules` + `promtool test rules`

**การตัดสินใจ**

- **lag วัดตอนส่งเสร็จ เทียบกับ `fireAt` ใน job** — รวมเวลารอคิว + เวลาที่ push service/Resend ใช้ = สิ่งที่ผู้ใช้รู้สึกจริง
  · การเตือนที่ถูกเลื่อนเพราะช่วงห้ามรบกวนวัดจาก fireAt ใหม่ (ช่วงห้ามรบกวนไม่ใช่ความช้าของระบบ)
- bucket ละเอียดช่วงต้น (1, 5, 15, 30, 60, 120 วินาที) — DoD คือ ±60 และ alert ที่ 120
- **`queue_depth` อ่านจาก Redis ตอนถูก scrape** (`collect()`) ไม่ poll เอง — ไม่มี scrape = ไม่มีภาระ
- **alert คิวค้างนับเฉพาะ `waiting`** — `delayed` คือการเตือนที่รอเวลาใน 5 นาทีข้างหน้า มีมากได้ตามปกติ (มีเทสต์กันคนแก้ให้นับ)
- worker มี HTTP แล้ว (เดิม `HEALTHCHECK NONE` เพราะไม่มีพอร์ต) — Fly.io ใช้ `/readyz` ตรวจสุขภาพ และ scrape `/metrics` ได้เองในขั้น 7
  · `/readyz` แยกจาก `/healthz`: DB/Redis กระตุกไม่ควรทำให้ worker ถูกรีสตาร์ท (สเปก 14.5)
- ยังไม่ทำ metric ฝั่ง API (`http_request_duration_seconds` ฯลฯ ในตารางสเปก 14.3) — นอกขอบเขต Phase 4 · การส่ง alert ไป Discord ตั้งตอน deploy

**วิธีตรวจ**

- integration worker: ส่งจริงแล้ว `reminder_delivery_lag_seconds_count{channel="push"} = 1` และ sum < 1 วินาที · retry ครบ 5 → `reminder_failures_total{kind="retryable"} = 5`
- unit `server.spec.ts`: `/metrics` เป็นรูปแบบ Prometheus · `/readyz` 503 เมื่อ dependency ล่มแต่ `/healthz` ยัง 200
- `promtool test rules` 5 กรณี: lag ปกติเงียบ / ช้าดังหลัง 5 นาที (ข้อความ "4m 51s" = 120 + 180 × 0.95) · คิวค้างแป๊บเดียวไม่ดัง / ค้างนานดัง ·
  delayed สูงแต่ waiting ต่ำไม่ดัง · DLQ — **ลองแก้กฎให้นับ delayed แล้วเทสต์ล้มจริง** (เทสต์จับได้)
- `pnpm verify` · integration API 80 + worker 19

**สิ่งที่ค้าง**

- ยังไม่มี Prometheus/Grafana จริง — ต่อกับ Fly.io managed Prometheus + ช่องทางแจ้ง (Discord) ในขั้น 7

---

## ขั้น 7a · แก้ Docker image ของ worker (พังมาตั้งแต่ก่อน Phase 4) — `aa4f460`

**เป้าหมาย:** image ที่จะขึ้น Fly.io build ได้และรันได้จริง · CI จับได้ถ้าพังอีก

**ปัญหาที่พบ (4 จุด)** — CI build ด้วย turbo อย่างเดียว ไม่เคย build image จึงไม่มีใครเห็น

1. stage builder ไม่มี `apps/api/node_modules` → `prisma generate` หา `@prisma/client` ไม่เจอ (build ล้ม)
2. stage runner `install --prod` ใหม่ แต่ไม่ generate Prisma client
3. `dist/` ถูกวางที่ `/app/dist` แต่ dependency ของ worker อยู่ที่ `/app/apps/worker/node_modules` → หา `bullmq` ไม่เจอตอนรัน
4. แพ็กเกจ workspace ถูกคัดลอกแค่ `dist` — ไม่มี `package.json` และ dependency ของมันเอง (`rrule`, `react`)
5. (เจอระหว่างแก้) `apps/worker/tsconfig.tsbuildinfo` ติดเข้า image → tsc แบบ incremental คิดว่า build แล้ว จึงไม่ emit `.js` เลย

**สิ่งที่เปลี่ยน**

- 📁 `docker/worker.Dockerfile` เขียนใหม่: install ทั้ง repo → generate → build → **`pnpm deploy --prod --legacy /out`** (worker + dependency production + แพ็กเกจ workspace ในตัว)
  → generate Prisma client ลง `/out` → runtime คัดลอกแค่ `/out` · มี openssl (Prisma) · `HEALTHCHECK` ที่ `/healthz` พอร์ต 9464
- 📁 `apps/worker/tsconfig.json` — buildinfo ไปอยู่ใน `dist/` (แบบเดียวกับ core) · `.dockerignore` ไม่เอา `*.tsbuildinfo`
- 📁 `"files": ["dist"]` ใน worker, core, contracts, emails — `pnpm deploy` ไม่พา `src/` และเทสต์เข้า image
- 📁 CI job "Docker image (worker)" — build จริง (cache ผ่าน GitHub Actions) แล้ว require ทุก dependency + ตรวจว่า Prisma client generate แล้ว

**วิธีตรวจ**

- build ผ่าน · **รัน container จริงต่อ PostgreSQL + Redis ในเครื่อง**: `/readyz` = ready · `/metrics` มี `queue_depth` ทุกคิว
- **end-to-end ข้ามนาทีจริง (ค้างจากขั้น 2):** ใส่การเตือน fireAt +20 วินาทีลงฐาน → job scheduler ทุก 1 นาทีใน container หยิบเอง (15:26:30)
  → ส่งตรง fireAt (15:26:36) · `reminder_delivery_lag_seconds_sum = 0.15` · สถานะใน DB = sent
- `docker compose build worker` (dev ใช้ stage builder) ยังใช้ได้ · `pnpm verify`

**สิ่งที่ค้าง**

- `docker/api.Dockerfile` มีปัญหาข้อ 2–4 แบบเดียวกัน — ยังไม่แก้เพราะ API รันบน Vercel ไม่ได้ใช้ image (แก้ด้วยวิธีเดียวกันเมื่อจะใช้)
- image 704 MB (Prisma engine 2 แบบ: musl + rhel สำหรับ Vercel) — ลดได้ด้วย `binaryTargets` เฉพาะ image ภายหลัง

---

## ขั้น 7b · ตั้งค่า Fly.io (worker + Redis) + wizard + deploy อัตโนมัติ — `bc0dd63`

**เป้าหมาย:** เตรียมทุกอย่างที่ deploy worker ได้ในคำสั่งเดียว ส่วนที่ต้องใช้บัญชีของเจ้าของ (Fly / Vercel / Supabase / Resend) รวมไว้ใน wizard

**สิ่งที่เปลี่ยน**

- 📁 `ops/fly/worker.fly.toml` — region `sin` · 512 MB · ไม่มี URL สาธารณะ · check `/readyz` · `[metrics]` ให้ Fly scrape · SIGTERM + 30 วินาที
- 📁 `ops/fly/redis.fly.toml` + `redis.Dockerfile` — Redis ของ worker เท่านั้น · ภายใน 6PN · appendonly บน volume · `requirepass` · `noeviction`
- 📁 `.github/workflows/deploy-staging.yml` — job `worker`: `flyctl deploy` หลัง migrate (ไม่มี `FLY_API_TOKEN` = ข้ามเงียบ)
- 📁 `scripts/fly-staging-setup.sh` — wizard 10 ขั้น (สร้างจาก template ของ /wizard) · 📁 `docs/deploy/staging-vercel-supabase.md` หัวข้อ 6
- 📁 `apps/worker/src/main.ts` — ioredis `family: 0`

**การตัดสินใจ**

- **Redis ของ worker แยกจาก Upstash ของ API** — API ไม่เคย enqueue (worker ดึงจาก PostgreSQL เอง) จึงไม่ต้องใช้ Redis ตัวเดียวกัน
  และ BullMQ poll ตลอดเวลาจนโควตาคำสั่งฟรีของ Upstash หมดในไม่กี่ชั่วโมง · Redis นี้หายทั้งก้อนก็แค่ sweeper ส่งเข้าคิวใหม่รอบถัดไป
- **ioredis `family: 0`** — เครือข่ายภายในของ Fly (`*.internal`) มีแต่ IPv6 · ioredis หา IPv4 อย่างเดียวโดยค่าเริ่มต้น → ต่อไม่ติดแบบไม่บอกเหตุผล
- `DATABASE_URL` ของ worker = Supabase **Session pooler 5432** — worker เป็น process ค้าง ใช้ prepared statement ได้ ต่างจาก Vercel Function ที่ต้องใช้ transaction pooler
- **`--ha=false`** — worker เครื่องเดียวพอสำหรับ staging (สองเครื่องก็ปลอดภัยเพราะ jobId กันซ้ำ แต่เสียเงินเปล่า)
- **`fly deploy .` จากราก repo** — Dockerfile ต้องเห็นทั้ง monorepo · ระบุ `--dockerfile` บน CLI ไม่ใส่ใน toml (path ใน toml อิงตำแหน่งที่กำกวม)
- wizard ส่ง secrets ด้วย `flyctl secrets import` ทาง stdin (ไม่โผล่ใน process list / shell history) · `--stage` แล้ว deploy ทีเดียว
  · ค่าที่สร้าง (VAPID, secret, รหัส Redis) เก็บใน `.env.staging.fly` (gitignore · 0600) → รันซ้ำได้โดยไม่สร้างกุญแจใหม่ (เปลี่ยนกุญแจ VAPID = ทุกเครื่องต้อง subscribe ใหม่)
  · `FLY_API_TOKEN` ตั้งลง **environment `staging`** ของ GitHub (ที่ workflow อ่าน) ไม่ใช่ระดับ repo · token จำกัดแค่แอป worker อายุ 1 ปี

**วิธีตรวจ**

- TOML parse ผ่าน (เจอ `kill_signal` ตกไปอยู่ในตาราง `[[vm]]` → ย้ายขึ้นระดับบน) · YAML ของ workflow ผ่าน · `bash -n` ของ wizard ผ่าน และ library ตรงกับ template ทุกบรรทัด
- flag ของ flyctl ทุกตัวที่ใช้ตรวจกับเอกสารของ Fly แล้ว (`secrets import --stage`, `tokens create deploy -x`, `deploy --ha/--dockerfile/--config/--remote-only`, `logs --no-tail`, `checks list -a`)
- ⚠️ **ยังไม่ได้รันกับ Fly จริง** — เครื่องนี้ยังไม่มี flyctl/บัญชี · shellcheck ไม่มีในเครื่อง

**สิ่งที่ค้าง (ทำโดยเจ้าของบัญชี)**

- [ ] รัน `bash scripts/fly-staging-setup.sh`
- [ ] DoD บนมือถือจริง: เปิดการแจ้งเตือนที่ `/settings` → ตั้งบิลเตือนล่วงหน้า → ได้ push ตรงเวลา ±60 วินาที → กด "จ่ายแล้ว" โดยไม่เปิดแอป

---

## ขั้น 7c · บท learn 17 + ADR-011 — (รอ commit)

- 📁 `docs/learn/17-phase4-reminders-push-email-and-worker.md` — 10 หัวข้อ + ข้อเสียที่ยอมรับ + แบบฝึกหัด 12 ข้อ · ลงสารบัญ `00-how-to-read.md` และ `index.html`
- 📁 `docs/adr/011-reminders-outbox-polling.md` — ทำไม PostgreSQL + sweeper แทน enqueue พร้อม delay (ทางเลือกที่ไม่เลือก + ข้อเสีย)
- ADR ใช้เลข 011 — 007/008 ยังจองไว้ตามสเปกภาคผนวก

> ✅ Phase 4 เสร็จฝั่งโค้ด (15 ต.ค. 2026) — เหลือรัน `scripts/fly-staging-setup.sh` และตรวจ DoD บนมือถือจริง
