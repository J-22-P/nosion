# 17 · Phase 4 — การเตือนที่ "ไม่หาย ไม่ซ้ำ ตรงเวลา": outbox, Web Push, อีเมล และ worker

> Phase 4 คือส่วนที่ระบบต้องทำงานเองตอนไม่มีใครเปิดแอป — การเตือนที่หายเงียบคือบั๊กที่ผู้ใช้ไม่มีวันรายงาน แต่เลิกเชื่อแอปทันที
> คำถามของบทนี้: **(1) ทำไมไม่ใส่ job ที่ delay 6 เดือนลง Redis ตรง ๆ (2) sweeper ทำงานอย่างไร และทำไมรันซ้ำได้
> (3) ทำไม processor ต้องถาม DB ก่อนยิงทุกครั้ง (4) at-least-once vs at-most-once (5) ช่วงห้ามรบกวนตามนาฬิกาของผู้ใช้
> (6) Web Push ทำงานอย่างไร VAPID คืออะไร (7) กด "จ่ายแล้ว" จาก notification โดยไม่มี access token
> (8) อีเมล: template, ผู้ให้บริการ, ลิงก์เลิกรับที่ตัวสแกนกดไม่ได้ (9) สรุปรายวัน 07:00 ของใครของมัน
> (10) วัดความช้าและ alert ที่ทดสอบได้ (11) Docker image ที่ build ไม่ผ่านมาตลอดโดยไม่มีใครรู้**

อ่านคู่กับ: 📁 `docs/phases/phase-4-reminders.md` ขั้น 1–7 · [ADR-011](../adr/011-reminders-outbox-polling.md) ·
บท [16](./16-phase3-recurrence-floating-time-and-materialization.md) หัวข้อ 6 (idempotency), 8 (cron บน serverless) ·
บท [13](./13-phase2a-task-api-sidebar-and-focus-timer.md) หัวข้อ 1–2 (instant / หน้าปัด / DST)

---

## 1. ทำไมไม่ enqueue ตอนสร้างการเตือน

ท่าที่ดูง่ายที่สุด:

```ts
await queue.add('remind', { reminderId }, { delay: fireAt - Date.now() }); // delay 6 เดือน
```

ปัญหาไม่ใช่ว่ามันไม่ทำงาน — มันทำงาน **จนวันที่ Redis หาย** (restart ไม่มี persistence, `FLUSHALL` ตอน debug, ย้ายเครื่อง)
แล้วการเตือนทั้งหมดหายพร้อมกันโดยไม่มี error สักบรรทัด และทุกครั้งที่ผู้ใช้เลื่อนวัน ต้องหา job เก่าไปลบแล้วใส่ใหม่ — สองที่ต้อง sync กันตลอด

### 1.1 Transactional outbox + polling publisher

```
API ── เขียน fireAt ─► PostgreSQL (source of truth)
                          ▲
worker: sweeper ทุก 1 นาที ─ fireAt ≤ now + 5 นาที ─► BullMQ (delay ≤ 5 นาที) ─► processor ─► push / email
```

- **PostgreSQL** จำว่าต้องเตือนเมื่อไร — ข้อมูลเดียวที่ต้องรอด
- **Redis** ถือแค่ job ของ 5 นาทีข้างหน้า — หายก็สร้างใหม่ได้จาก DB ในรอบถัดไป
- API ไม่รู้จักคิวเลย: เลื่อนวัน = `UPDATE reminders SET fireAt = …` ใน transaction เดียวกับการแก้รายการ

📁 `apps/api/src/reminders/reminder-plan.ts` → `rescheduleData` — ย้ายวันแล้ว fireAt ใหม่ยังไม่ถึง = ตั้งเตือนใหม่ (แม้เคยส่งแล้ว) ·
ผ่านไปแล้ว = เลื่อนเวลาอย่างเดียว · ที่ผู้ใช้ยกเลิกเองไม่แตะ

🎤 _"ทำไมไม่ใช้ cron ยิงตรงจาก DB ทุกนาทีเลย ไม่ต้องมีคิว"_ → ได้ แต่ (1) ยิงตรงนาทีเท่านั้น — ช้าได้ถึง 59 วินาที ชน DoD ±60
(2) ไม่มี retry/backoff/DLQ ต้องเขียนเอง · คิวให้ความแม่นระดับวินาที (delay) และกลไก retry มาฟรี

---

## 2. Sweeper — รันทุกนาที รันซ้อนกัน ก็ไม่เกิด job ซ้ำ

📁 `apps/worker/src/reminders/sweeper.ts`

```ts
const jobId = `${reminder.id}-${reminder.fireAt.getTime()}`;
await queue.add('send', data, { jobId, delay: fireAt - now });
```

**BullMQ ไม่รับ jobId ซ้ำ** — sweep ทุกนาทีเจอการเตือนเดิม (ยังไม่ถึงเวลา) ก็ add ซ้ำได้โดยไม่เกิด job ใหม่ ·
fireAt อยู่ใน id → ผู้ใช้เลื่อนเวลา = id ใหม่ = job ใหม่ ส่วน job เก่ากลายเป็น "job เก่า" (หัวข้อ 3)

⚠️ กับดัก: กรอง `WHERE jobId IS NULL` ("ส่งเข้าคิวไปแล้วไม่ต้องส่งอีก") ดูประหยัด แต่ถ้า Redis หายหลังจด jobId ลง DB
การเตือนนั้นจะไม่ถูกส่งเข้าคิวอีกเลย — เสียคุณสมบัติข้อที่ทำให้เลือกสถาปัตยกรรมนี้มาตั้งแต่ต้น

**พลาดเวลาไปนานแค่ไหนยังส่ง?** 1 ชม. (`MISSED_GRACE_MS`) — worker ล่มทั้งคืนแล้วเช้ามายิง "ครบกำหนดพรุ่งนี้" ของเมื่อวาน สร้างความสับสนมากกว่าช่วย
เกินนั้นปิดเป็น `failed` พร้อมเหตุผล (ตัดสินเอง — สเปกไม่ได้ระบุ)

---

## 3. Processor — ถาม DB ก่อนยิงทุกครั้ง

ระหว่างที่ job รอในคิว (สูงสุด 5 นาที) ผู้ใช้อาจทำเสร็จ ลบ หรือเลื่อนวันไปแล้ว 📁 `apps/worker/src/reminders/processor.ts`

| guard                                | ทำอะไร                    | บั๊กที่กัน                        |
| ------------------------------------ | ------------------------- | --------------------------------- |
| ไม่พบการเตือน / ไม่ใช่ `scheduled`   | ข้าม                      | ส่งซ้ำ (double delivery)          |
| `fireAt` ใน job ≠ ใน DB              | ข้าม ไม่แตะสถานะ          | ยิงตามเวลาเก่าหลังผู้ใช้เลื่อนวัน |
| รายการถูกลบ / ทำเสร็จ / ไม่มีวันแล้ว | ปิดเป็น `cancelled`       | เตือนเรื่องที่จบแล้ว              |
| อยู่ในช่วงห้ามรบกวน                  | เลื่อน fireAt ไปตอนจบช่วง | ปลุกตอนตีสอง — หรือทิ้งการเตือน   |

ผลที่ตามมาที่ดี: **API ไม่ต้อง sync ตอนทำเสร็จ/ลบ** — จุดที่ต้อง sync เหลือแค่การย้ายวัน

### 3.1 at-least-once vs at-most-once

ส่งสำเร็จแล้ว process ตายก่อนบันทึก `sent` → retry ส่งซ้ำ · ทางกลับคือ "จองสถานะก่อนส่ง" (at-most-once) → ตายกลางทาง = หายเงียบ
เราเลือก **at-least-once** เพราะ notification ใช้ `tag: entry-<id>` — เครื่องปลายทางแสดงทับเป็นอันเดียว ผู้ใช้แทบไม่เห็นความซ้ำ
(สรุปรายวันในหัวข้อ 8 เลือกกลับกัน — อีเมลซ้ำสองฉบับรบกวนกว่าหายหนึ่งวัน)

### 3.2 ล้มชั่วคราว vs ล้มถาวร

- push service ตอบ 5xx / network → โยน error ให้ BullMQ retry: 30s, 1m, 2m, 4m, 8m → ครบแล้วคัดลอกเข้า `reminder-dlq`
- ไม่มีเครื่องลงทะเบียน / ทุกเครื่องตอบ **404·410** (subscription ตาย) / Resend ตอบ 4xx → `PermanentDeliveryError` ปิดทันที ไม่เผา retry

---

## 4. ช่วงห้ามรบกวนตามนาฬิกาของผู้ใช้

📁 `packages/core/src/quiet-hours.ts`

```ts
// 22:00–07:00 ข้ามเที่ยงคืน: อยู่ในช่วงถ้า t ≥ start "หรือ" t < end
return start < end ? t >= start && t < end : t >= start || t < end;
```

- เทียบสตริง `"HH:mm"` ตรง ๆ ได้ เพราะเลขสองหลักเรียงตามตัวอักษร = เรียงตามเวลา (จึงต้องบังคับรูปแบบ 00:00–23:59 ที่ contract)
- `quietHoursEnd` หา "07:00 ครั้งถัดไป" เป็นวันที่ตามปฏิทินของผู้ใช้แล้วแปลงด้วย `zonedTimeToUtc` — คืนเปลี่ยน DST ของนิวยอร์ก 07:00 = 11:00 UTC ไม่ใช่ 12:00
- ไม่ใช้กับ webhook — ช่วงห้ามรบกวนมีไว้สำหรับคน

---

## 5. Web Push จากศูนย์

```
เบราว์เซอร์ ─ pushManager.subscribe(VAPID public key) ─► push service ของเบราว์เซอร์ (FCM / APNs / Mozilla)
     │ ได้ endpoint + กุญแจ p256dh/auth                          ▲
     └─ POST /push/subscribe ─► API เก็บลง push_subscriptions      │ worker ส่ง payload ที่เข้ารหัสแล้ว + ลายเซ็น VAPID
                                                                  service worker ปลุกขึ้นมาแสดง notification แม้ปิดแท็บ
```

- **VAPID** = คู่กุญแจ ECDSA P-256 ของเซิร์ฟเวอร์เรา · public key ให้เบราว์เซอร์ตอน subscribe → push service ยอมรับเฉพาะ push ที่เซ็นด้วย private key คู่กัน
  (ใครได้ endpoint ไปก็ส่งหาผู้ใช้ไม่ได้) · 📁 `scripts/setup-dev.mjs` สร้างด้วย `node:crypto` ไม่ต้องลง lib
- **payload เข้ารหัสปลายทางถึงเบราว์เซอร์** (RFC 8291) ด้วย `p256dh/auth` — push service ของ Google/Apple อ่านเนื้อหาไม่ได้ · จำกัด ~4 KB
- **endpoint เป็นของเครื่อง ไม่ใช่ของบัญชี** — เครื่องเดิมล็อกอินบัญชีอื่นแล้ว subscribe ใหม่ = ย้ายเจ้าของ (ไม่งั้นการเตือนของคนเก่าเด้งบนเครื่องคนใหม่)
- service worker (📁 `apps/web/public/sw.js`) เป็นไฟล์ static ไม่ผ่าน bundler และไม่มี `fetch` handler — ไม่แคชอะไร จึงไม่กระทบการโหลดหน้า

⚠️ iPhone/iPad: Safari รับ push ได้ **เฉพาะเมื่อเพิ่มลงหน้าจอโฮมแล้ว** (iOS 16.4+) — การ์ดในหน้า Settings บอกผู้ใช้ตรง ๆ แทนที่จะซ่อนปุ่มเงียบ ๆ
⚠️ headless Chromium ตอบ `Notification.permission = denied` เสมอ — เทสต์สถานะ "ยังไม่เคยถาม" ต้องจำลองด้วย init script

---

## 6. กด "จ่ายแล้ว" จาก notification โดยไม่มี access token

access token อยู่ใน memory ของหน้าเว็บเท่านั้น (สเปก 9.1) — service worker เข้าไม่ถึง ทางออก: **action token**

📁 `packages/core/src/action-token.ts`

```
base64url({ u: userId, s: entryId, x: หมดอายุ }) + "." + HMAC-SHA256("nosion-action:" + body, secret)
```

- worker เซ็นแนบมากับ push · API ตรวจด้วย `NOTIFICATION_ACTION_SECRET` ตัวเดียวกัน → ทำแทนผู้ใช้ได้แค่ complete / defer ของรายการนั้น · อายุ 7 วัน
- **purpose อยู่ในข้อมูลที่เซ็น** — token ปุ่มใน notification เอาไปใช้เป็น token เลิกรับอีเมลไม่ได้ (และกลับกัน) แม้ secret เดียวกัน
- เทียบลายเซ็นด้วย `timingSafeEqual` · ผิดทุกแบบตอบ 401 ข้อความเดียว (ไม่บอกว่าผิดเพราะอะไร) · token ถูกแต่รายการไม่ใช่ของ user ใน token → 404 ตามกฎ IDOR เดิม

🎤 _"ทำไมไม่ใช้ JWT"_ → ใช้ได้ แต่เราต้องการแค่ HMAC ของ 3 ค่า — JWT พา header/alg มาด้วยและเปิดช่องผิดพลาดเรื่อง `alg` (บท 04) โดยไม่ได้อะไรเพิ่ม
ข้อเสียที่ยอมรับ: logout แล้ว token ใน notification ที่ค้างอยู่ยังใช้ได้จนหมดอายุ

---

## 7. อีเมล

📁 `packages/emails/` — แพ็กเกจแยก (server-only) ให้ API (อีเมลบัญชี) และ worker (การเตือน/สรุป) ใช้ template ชุดเดียว

- **React Email** — เขียนเป็น component แล้ว render เป็น HTML ที่ใช้ได้ใน Gmail/Outlook (ตาราง + inline style · Gmail ตัด `<style>` และไม่รู้จัก CSS variable)
  · ข้อความจากผู้ใช้ถูก escape เพราะผ่าน JSX (มีเทสต์ `<img onerror>` ไม่กลายเป็นแท็ก)
- **transport สลับได้ด้วย `MAIL_DRIVER`**: `log` (เทสต์/CI) · `smtp` → Mailpit (dev ไม่ออกอินเทอร์เน็ตจริง) · `resend` (staging/production — HTTP ตรง ๆ ไม่ลง SDK)
- integration ส่งจริงผ่าน SMTP เข้า Mailpit แล้วอ่านกลับจาก API ของมัน — จับปัญหา encoding หัวเรื่องภาษาไทยที่ unit test มองไม่เห็น

### 7.1 ลิงก์เลิกรับที่ตัวสแกนกดไม่ได้

ตัวสแกนลิงก์ของผู้ให้บริการอีเมล (Outlook Safe Links ฯลฯ) **เปิดทุกลิงก์ในอีเมลเอง** — ถ้า `GET /unsubscribe` เลิกรับทันที
ผู้ใช้ถูกยกเลิกโดยไม่ได้กดอะไรเลย

- `GET` แสดงหน้ายืนยันเท่านั้น · การเลิกรับจริงเป็น `POST` เสมอ
- `POST` เดียวกันรองรับ **one-click unsubscribe** ของ Gmail/Yahoo (RFC 8058): header `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- ไม่มี secret สำหรับเซ็นลิงก์เลิกรับ = worker ไม่ส่งสรุปรายวันเลย — อีเมลแจ้งข่าวสารที่เลิกรับไม่ได้ไม่ควรออกไป

---

## 8. สรุปรายวัน 07:00 ของใครของมัน (สเปก 10.2)

ทางที่ผิด: cron `0 7 * * *` (UTC) → คนไทยได้ตอนบ่ายสอง · ทางที่ถูก: cron ทุก 15 นาที แล้วให้ SQL เลือกคนที่ "ตอนนี้ตามนาฬิกาของตัวเอง" ถึงเวลาแล้ว

📁 `apps/worker/src/digest/daily-digest.ts` → `findDueDigests`

```sql
($now::timestamptz AT TIME ZONE s.timezone) AS local_now   -- หน้าปัดของผู้ใช้
... นาทีของ local_now BETWEEN นาทีที่ตั้ง AND นาทีที่ตั้ง + 179
AND (lastDigestSentAt IS NULL OR lastDigestSentAt < เที่ยงคืนของวันนั้นตามโซนผู้ใช้ (แปลงกลับเป็น UTC))
```

- **หน้าต่าง 3 ชม.** แทนการเทียบนาทีตรง ๆ ตามสเปก — cron ทุก 15 นาทีไม่มีทางตรงกับ 07:05 พอดี และ worker ล่มตอน 07:00 ยังส่งได้รอบถัดไป
- **"ส่งแล้ววันนี้" ต้องคิดเป็นวันของผู้ใช้** — 06:30 ไทยวันที่ 10 = 23:30 UTC วันที่ 9 · ใช้วันตาม UTC = ส่งสองครั้งในเช้าเดียว
- **จองสิทธิ์ก่อนส่ง** (`updateMany … WHERE lastDigestSentAt < เที่ยงคืน`) — worker สองตัวรันซ้อนได้ตัวเดียว · ส่งไม่สำเร็จคืนค่าเดิม
- วันที่ไม่มีอะไรค้าง → ไม่ส่ง — "วันนี้ว่าง" ทุกเช้าทำให้คนเลิกอ่านฉบับที่มีเรื่องจริง

---

## 9. วัดความช้า และ alert ที่ทดสอบได้

📁 `apps/worker/src/metrics.ts` · `server.ts` (`/metrics`, `/healthz`, `/readyz` ที่พอร์ต 9464)

- **`reminder_delivery_lag_seconds`** (histogram ต่อช่องทาง) — วัดตอนส่งเสร็จจริงเทียบกับ `fireAt` = รวมเวลารอคิว + เวลาที่ push service ใช้ = สิ่งที่ผู้ใช้รู้สึก
  · bucket ละเอียดช่วง 1–120 วินาที เพราะ DoD ±60 และ alert ที่ 120
- **`queue_depth`** อ่านจาก Redis ตอนถูก scrape (`collect()`) ไม่ poll เอง
- `/readyz` แยกจาก `/healthz` — DB กระตุกไม่ควรทำให้ worker ถูกรีสตาร์ท (บท 08, สเปก 14.5)

กฎ alert (📁 `ops/prometheus/alerts.yml`) มี **unit test ของตัวเอง** (`promtool test rules`) — ป้อน time series ปลอมแล้วยืนยันว่าดัง/ไม่ดังตรงเวลา:

```yaml
- series: 'reminder_delivery_lag_seconds_bucket{le="120"}'   values: '0+0x30'   # ไม่มีอะไรเร็วกว่า 120s
- series: 'reminder_delivery_lag_seconds_bucket{le="300"}'   values: '0+10x30'  # ทุกอันอยู่ช่วง 120–300s
# p95 = 120 + (300 − 120) × 0.95 = 291 วินาที → "4m 51s" → ดังหลังเกินต่อเนื่อง 5 นาที
```

⚠️ alert คิวค้างนับเฉพาะ `waiting` — `delayed` คือการเตือนที่รอเวลาใน 5 นาทีข้างหน้า มีมากได้ตามปกติ · ลองแก้กฎให้นับ delayed แล้วเทสต์แดงจริง

---

## 10. Docker image ที่พังมาตลอดโดยไม่มีใครรู้

CI build worker ด้วย `turbo build` อย่างเดียว — ไม่เคย `docker build` จึงไม่มีใครเห็นว่า image ใช้ไม่ได้ 5 จุด (📁 `docs/phases/phase-4-reminders.md` ขั้น 7a)
จุดที่น่าเรียนรู้ที่สุด:

- **pnpm ไม่ hoist** — dependency ของ worker อยู่ใน `apps/worker/node_modules` (symlink เข้า `.pnpm`) · คัดลอก `dist` ไปไว้ที่อื่น = `Cannot find module 'bullmq'`
  ทางแก้: `pnpm deploy --prod` สร้างโฟลเดอร์ที่มี dependency production ครบในตัว แล้ว `prisma generate` ลงในนั้น
- **`tsconfig.tsbuildinfo` ติดเข้า image** → tsc แบบ incremental คิดว่า build แล้ว → ไม่ emit `.js` เลย (ได้แต่ `.d.ts`) · แก้: เก็บ buildinfo ใน `dist/` + `.dockerignore`

บทเรียน: **สิ่งที่ deploy ต้องถูก build ใน CI แบบเดียวกับตอน deploy** — เพิ่ม job "Docker image (worker)" ที่ build จริงแล้ว require ทุก dependency
และทดสอบ end-to-end ใน container: sweeper หยิบเองตามรอบนาที → ส่งตรง fireAt · lag 0.15 วินาที

---

## ข้อเสียที่ยอมรับ

- query DB ทุกนาทีแม้ไม่มีการเตือน (มี index `(status, fireAt)`) · การเตือนที่ตั้งภายใน 1 นาทีข้างหน้าช้าได้ถึงรอบ sweep ถัดไป
- พลาดเกิน 1 ชม. ไม่ส่งย้อนหลัง — ผู้ใช้มองเป็นการเตือนที่หาย
- ส่งซ้ำได้ในกรณีหายาก — push ทับด้วย tag แต่อีเมลไม่มีอะไรทับ
- action token ยังใช้ได้หลัง logout จนหมดอายุ 7 วัน
- worker เครื่องเดียวบน staging — ล่มนานเกิน 1 ชม. = การเตือนช่วงนั้นถูกปิด
- ยังไม่มีงานส่งสรุปสัปดาห์และงบเกิน (template พร้อม) · ยังตั้งเตือนงาน (Tasks) จากหน้าเว็บไม่ได้

---

## แบบฝึกหัดท้ายบท

1. วาด timeline: ผู้ใช้เลื่อนบิลจากพรุ่งนี้ไปมะรืน **ระหว่าง**ที่ job ของพรุ่งนี้รออยู่ในคิว — guard ตัวไหนกันไม่ให้ยิงผิดวัน และ job ใหม่มาจากไหน
2. เพิ่ม `jobId: null` เข้า where ของ sweeper แล้วรัน integration "ไม่ยิงซ้ำ" — ผ่านไหม? จากนั้นลบคีย์ทั้งหมดใน Redis ระหว่างที่มีการเตือนรออยู่ — เกิดอะไร
3. ใน `processor.ts` ย้ายการบันทึก `sent` ไปไว้ **ก่อน** `dispatcher.send` — ระบบกลายเป็น at-most-once อย่างไร เขียนเทสต์ที่พิสูจน์ว่าการเตือนหาย
4. คำนวณ `quietHoursEnd` ของ 23:30 ไทย, 03:00 ไทย และคืน 13→14 มี.ค. 2027 ของนิวยอร์ก แล้วรัน `quiet-hours.test.ts` เทียบ
5. ทำไม bill ที่เป็นรายการทั้งวัน (00:00) ตั้งเตือน "ล่วงหน้า 1 วัน" ด้วย offset −900 ไม่ใช่ −1440 — ถ้าใช้ −1440 จะเด้งกี่โมง และทำไม
6. สร้างคู่กุญแจ VAPID ด้วย `createECDH('prime256v1')` แล้วส่งให้ `webpush.setVapidDetails` — public key ยาวกี่ไบต์ก่อน base64url และทำไม
7. เอา token จากปุ่ม "จ่ายแล้ว" ไปเรียก `POST /email/unsubscribe?token=…` — ได้ผลอะไร บรรทัดไหนในโค้ดกันไว้
8. เปลี่ยน `GET /email/unsubscribe` ให้เลิกรับทันที แล้วอธิบายว่าผู้ใช้ Outlook จะเจออะไรในวันถัดไป
9. ใน `findDueDigests` เปลี่ยนการเทียบ "ส่งแล้ววันนี้" เป็นวันตาม UTC — ผู้ใช้ไทยที่ตั้งเวลา 06:30 จะได้สรุปกี่ฉบับต่อเช้า (ดูเทสต์ "ส่งไปแล้ววันนี้")
10. เขียน `alert_rule_test` เพิ่ม: lag ช้า 3 นาทีแต่แค่ 3 นาทีแล้วกลับปกติ — ควรดังไหม รัน `promtool test rules` ยืนยัน
11. ลบ `.dockerignore` บรรทัด `**/*.tsbuildinfo` และย้าย buildinfo ของ worker กลับไปไว้ข้างนอก `dist` แล้ว build image — `dist/` มีอะไร
12. ทำไม worker ต่อ `nosion-staging-redis.internal` ไม่ติดถ้าไม่ตั้ง `family: 0` — เครือข่ายภายในของ Fly ใช้ IP แบบไหน
