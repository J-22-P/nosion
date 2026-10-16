# Phase 7 · Offline Sync (สัปดาห์ 16)

> เป้าหมาย: ใช้แอปได้ตอนไม่มีเน็ต แล้วข้อมูลขึ้น server ครบเมื่อเน็ตกลับมา โดยไม่ซ้ำและไม่ทับงานคนอื่นเงียบ ๆ — สเปก 7.4 (`/sync/push`), 8.6, 15 Phase 7
> **DoD:** เปิดโหมดเครื่องบิน → ใช้แอปได้ปกติ → ปิดโหมด → ข้อมูลขึ้น server ครบ

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                                                                      | Commit      | สถานะ |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ----------- | ----- |
| 1   | API: `POST /sync/push` (create/update/complete/defer/delete/restore/parse · merge ระดับ field · ลบชนะ) + `GET /sync/pull` | (รอ commit) | ✅    |
| 2   | เว็บ: outbox ใน IndexedDB + ตัวซิงก์ (online/โฟกัส/ปุ่ม) · mutation ของรายการเข้า outbox เมื่อออฟไลน์                     | —           | ⬜    |
| 3   | เปิดแอปตอนออฟไลน์: เก็บ cache ของ TanStack Query ลง IndexedDB · service worker แคชหน้า + static · Background Sync         | —           | ⬜    |
| 4   | UI สถานะ: connection pill 3 สถานะ · Sync Status ใน sidebar · `MUT: n` · การ์ด Outbox · จุด "รอซิงก์" · แจ้ง conflict      | —           | ⬜    |
| 5   | E2E: ตัดเน็ต → สร้าง 3 รายการ → ต่อเน็ต → ครบไม่ซ้ำ (mock + API จริง) · PWA ติดตั้งได้                                    | —           | ⬜    |
| 6   | บท learn 20 + ADR-014                                                                                                     | —           | ⬜    |

**ขอบเขต:** รายการ (งาน · รายจ่าย) และบันทึกด่วนผ่าน parser ทำงานออฟไลน์ได้ · ปุ่ม +1 ของนิสัยยังต้องออนไลน์
(เป็นการบวกแบบ atomic ฝั่ง server — ดูขั้น 2 ว่าจะรวมได้ไหม)

---

## ขั้น 1 · API: `POST /sync/push` + `GET /sync/pull` — (รอ commit)

**สิ่งที่เปลี่ยน**

- 📁 `packages/contracts/src/sync.ts` — operation 7 ชนิด: `create` · `update` (พร้อม `base` = ค่าก่อนแก้) · `complete` · `defer` · `delete` · `restore` ·
  `parse` (บันทึกด่วน/⌘K ตอนออฟไลน์) · อ้างรายการด้วย `id` หรือ `clientId` (รายการที่สร้างตอนออฟไลน์ยังไม่มี id) · ผล `applied | merged | conflict | deleted | error`
- 📁 `apps/api/src/sync/`
  - `merge.ts` (pure) — conflict ระดับ field: ค่าบน server ยังเท่า `base` → ใช้ของ client · เท่าค่าของ client อยู่แล้ว → ไม่ใช่ conflict ·
    นอกนั้น server ชนะ + รายงาน diff · payload เทียบทีละ key · occurredAt เทียบเป็นจุดเวลา
  - `sync.service.ts` — ทุก operation เรียก `EntriesService` / `ParseService` ตัวเดียวกับ endpoint ปกติ · ตามลำดับที่ส่ง · ผลรายตัว (partial success) ·
    ลบ vs แก้ = ลบชนะ · complete ซ้ำ = idempotent · `pull` คืนรายการที่เปลี่ยนตั้งแต่ `since` รวม tombstone (ดึงซ้อน 2 นาที)
- 📁 ตารางใหม่ `sync_ops` (`userId` + `opId` unique) — migration `20261016120000_sync_ops` (เพิ่มอย่างเดียว) · เก็บผล 30 วัน
- 📁 `infra/config/env.ts` — ค่าว่างใน `.env` (`KEY=`) = ไม่ได้ตั้ง (ดูด้านล่าง)

**การตัดสินใจ**

- **idempotency ด้วย `opId` + ตาราง `sync_ops`** — `clientId` กันได้แค่การสร้าง แต่การเลื่อนวันส่งซ้ำ = เลื่อนสองครั้ง และ `parse` ที่สร้างกฎซ้ำ = กฎสองตัว ·
  ส่งซ้ำได้ผลเดิม (`replayed: true`)
- **merge ด้วย "ค่าก่อนแก้" แทนประวัติการแก้** — server ไม่มีประวัติรายฟิลด์ · client รู้ค่าก่อนแก้อยู่แล้ว → ส่งมาด้วยก็ตัดสินได้ครบตามตารางสเปก 7.4
- `pull` ใช้ `updatedAt` + ดึงซ้อน 2 นาที แทน Lamport clock — ข้อมูลต่อผู้ใช้เล็ก ตัดซ้ำด้วย id + version ฝั่ง client ถูกกว่าเพิ่ม sequence + trigger
- ผลกับ operation ที่ผูกกันไม่ atomic (เขียนรายการแล้วค่อยบันทึก `sync_ops`) — server ตายตรงกลาง = ส่งซ้ำแล้วทำซ้ำได้ (หน้าต่างแคบมาก — ยอมรับ)

**เจอระหว่างทาง:** `pnpm db:generate` จากโฟลเดอร์รากทำให้ Prisma Client อ่าน `.env` ที่รากเองตอน runtime → `VAPID_*=` / `RESEND_API_KEY=` (ว่าง)
หลุดเข้ามาแล้วตัวตรวจ env ปฏิเสธ (turbo กรอง env ไว้ แต่ Prisma โหลดเอง) · แก้ที่ตัวตรวจ: ค่าว่าง = ไม่ได้ตั้ง — แก้อาการ "รัน API บนเครื่องไม่ขึ้น" ด้วย

**วิธีตรวจ**

- unit: merge 7 · env 3
- integration `test/sync.int-spec.ts` 7 เคส: **DoD ฝั่ง API — สร้าง 3 รายการ + แก้/ติ๊กรายการที่ยังไม่มี id ในชุดเดียว · ส่งซ้ำทั้งชุดได้ผลเดิมไม่สร้างเพิ่ม** ·
  merged · conflict (server ชนะ + diff) · ลบชนะ / ลบซ้ำ / complete ซ้ำ · **เลื่อนวันส่งซ้ำเลื่อนครั้งเดียว** · partial success · pull + tombstone + แยกผู้ใช้ · 422/401
- API 118 + worker 19 · `pnpm verify` exit 0
