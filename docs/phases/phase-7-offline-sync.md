# Phase 7 · Offline Sync (สัปดาห์ 16)

> เป้าหมาย: ใช้แอปได้ตอนไม่มีเน็ต แล้วข้อมูลขึ้น server ครบเมื่อเน็ตกลับมา โดยไม่ซ้ำและไม่ทับงานคนอื่นเงียบ ๆ — สเปก 7.4 (`/sync/push`), 8.6, 15 Phase 7
> **DoD:** เปิดโหมดเครื่องบิน → ใช้แอปได้ปกติ → ปิดโหมด → ข้อมูลขึ้น server ครบ

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                                                                      | Commit      | สถานะ |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ----------- | ----- |
| 1   | API: `POST /sync/push` (create/update/complete/defer/delete/restore/parse · merge ระดับ field · ลบชนะ) + `GET /sync/pull` | `5ccaee7`   | ✅    |
| 2   | เว็บ: outbox ใน IndexedDB + ตัวซิงก์ (online/โฟกัส/ปุ่ม) · mutation ของรายการเข้า outbox เมื่อออฟไลน์                     | `d80a172`   | ✅    |
| 3   | เปิดแอปตอนออฟไลน์: เก็บ cache ของ TanStack Query ลง IndexedDB · service worker แคชหน้า + static · Background Sync         | (รอ commit) | ✅    |
| 4   | UI สถานะ: connection pill 3 สถานะ · Sync Status ใน sidebar · `MUT: n` · การ์ด Outbox · จุด "รอซิงก์" · แจ้ง conflict      | —           | ⬜    |
| 5   | E2E: ตัดเน็ต → สร้าง 3 รายการ → ต่อเน็ต → ครบไม่ซ้ำ (mock + API จริง) · PWA ติดตั้งได้                                    | —           | ⬜    |
| 6   | บท learn 20 + ADR-014                                                                                                     | —           | ⬜    |

**ขอบเขต:** รายการ (งาน · รายจ่าย) และบันทึกด่วนผ่าน parser ทำงานออฟไลน์ได้ · ปุ่ม +1 ของนิสัยยังต้องออนไลน์
(เป็นการบวกแบบ atomic ฝั่ง server — ดูขั้น 2 ว่าจะรวมได้ไหม)

---

## ขั้น 1 · API: `POST /sync/push` + `GET /sync/pull` — `5ccaee7`

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

## ขั้น 2 · เว็บ: outbox ใน IndexedDB + ตัวซิงก์ — `d80a172`

**สิ่งที่เปลี่ยน**

- 📁 `apps/web/src/lib/sync/` (ไม่รู้จัก React)
  - `outbox-storage.ts` — คิวใน IndexedDB (`nosion-sync` › `outbox`, index ตาม userId) เขียนด้วย API ดิบ · สำรองเป็นหน่วยความจำเมื่อเปิด IndexedDB ไม่ได้
  - `sync-engine.ts` — `enqueue` · `flush` (single-flight, ครั้งละ 100 ตามลำดับ) · ลบจากคิวเมื่อ server ตอบผลแล้วเท่านั้น ·
    เน็ตหลุด/5xx/401/408/429 = เก็บไว้ส่งซ้ำ · 4xx อื่น = ทิ้งแล้วรายงาน error · คิวแยกตามผู้ใช้
  - `offline.ts` — `runOrQueue`: ทางแยกเดียวของทุก mutation (ออฟไลน์ หรือคิวยังมีของ → เข้าคิว · เน็ตหลุดระหว่างเรียก → เข้าคิว · server ตอบ error → โยนต่อ) ·
    `local:<clientId>` = id ชั่วคราวของรายการที่สร้างตอนออฟไลน์ (`targetOf` แปลงเป็น `{ clientId }`)
  - `entry-cache.ts` — หารายการในแคช `['entries', …]` ทุกรูปร่าง เพื่อคาดภาพหลังทำ + เป็น `base` ของ update
- 📁 `features/entries/api.ts` + `features/command-palette/api.ts` — `create/update/complete/defer/remove/restore` และ `parse/commit` ผ่าน `offlineCapable`
  (bulk ยังต้องออนไลน์) · ทุกคำสั่งสร้างใส่ `clientId` เสมอ
- 📁 `features/sync/sync-bridge.tsx` — ผูกผู้ใช้ · ตัวกระตุ้น online / กลับมาที่แท็บ / ทุก 30 วิ ถ้ายังค้าง / ข้อความ `nosion:sync` จาก service worker ·
  ผลกลับมา → invalidate แคช + toast (ซิงก์แล้ว n · ชนกัน + ชื่อ field · ถูกลบไปก่อน · ล้ม) · `useSyncState()` สำหรับ UI ขั้น 4
- `providers.tsx` — `mutations.networkMode: 'always'`

**การตัดสินใจ**

- **ตัดสินที่ชั้น api ไม่ใช่ใน hook ทีละตัว** — ผู้เรียกทุกจุด (รายการงาน, Today, ปฏิทิน, ⌘K, ⌘Z) ได้พฤติกรรมออฟไลน์พร้อมกัน ·
  เข้าคิวแล้วคืน "ภาพที่คาดไว้" (EntryDto) ให้โค้ดเดิมทำงานต่อได้ · `isQueued(result)` ให้ผู้เรียกที่อยากต่างเลือกข้อความเอง
- **คิวมีของค้าง = ทุกคำสั่งต่อท้ายคิวแม้ออนไลน์** — ห้ามแซง: "ติ๊กเสร็จ" ของรายการที่สร้างตอนออฟไลน์ต้องถึง server หลังการสร้าง
- **`networkMode: 'always'`** — ค่าเริ่มต้นของ TanStack Query พัก mutation ไว้ในหน่วยความจำตอนออฟไลน์ (รีเฟรชแล้วหาย และ mutationFn ไม่ถูกเรียก
  — ทางแยกของเราจึงไม่ทำงาน) · query ยังเป็น `'online'`: ออฟไลน์แล้วไม่ยิง ข้อมูลเดิมค้างบนจอ
- `base` ของ update ต้องอ่าน **ก่อน** optimistic update ทับแคช — `useUpdateEntry` เก็บไว้ใน WeakMap ผูกกับ vars (onMutate รันก่อน mutationFn)
- `parse` ตอนออฟไลน์ให้ server parse ตอนซิงก์ — "พรุ่งนี้" ที่พิมพ์ 23:59 แล้วซิงก์หลังเที่ยงคืนจะเลื่อนหนึ่งวัน · ยอมรับไว้ก่อน
  (แก้ได้ภายหลังด้วยการส่ง `now` ของ client ไปกับ operation)
- ปุ่ม +1 ของนิสัยยังต้องออนไลน์ — เป็นการบวกแบบ atomic ฝั่ง server · ใส่ในคิวต้องเพิ่ม operation ใหม่ (`increment`) ซึ่งไม่อยู่ใน DoD

**วิธีตรวจ**

- unit (+13): engine 5 (คิว+ลำดับ · เน็ตหลุดส่งซ้ำ opId เดิม · 5xx/401/429 vs 422 · แบ่งชุด 100 + single-flight · แยกผู้ใช้) · runOrQueue 4 ·
  summarize · pickBase 2 · findCachedEntry
- Playwright ui: **ตัดเน็ต → ติ๊กงาน (`j` `e`) + เพิ่ม 3 งาน → ไม่มีคำขอ · IndexedDB มี 4 · ต่อเน็ต → `/sync/push` ชุดเดียวตามลำดับ → "ซิงก์แล้ว 4 รายการ"** ·
  เทสต์นิสัยเดิมปรับตาม (`clientId` ถูกส่งเสมอ) · 52 ผ่าน
- `pnpm verify` exit 0

## ขั้น 3 · เปิดแอปตอนออฟไลน์ — (รอ commit)

**สิ่งที่เปลี่ยน**

- 📁 `lib/sync/query-persist.ts` — เก็บแคชของ TanStack Query ลง IndexedDB (`nosion-cache`) ด้วย `dehydrate`/`hydrate` ที่มากับ react-query ·
  เขียนหน่วง 1 วิ · อายุ 7 วัน · ไม่เก็บ preview ของ parser / ผลค้นหา / push · `whenRestored()` ให้ query ที่ต้องรอแคชจากดิสก์
- 📁 `features/auth/use-session.ts` + `auth-store.ts` — ขอ token ไม่ได้เพราะ **เน็ตหลุด** → ใช้โปรไฟล์ในแคช (`setOfflineUser`: รู้ว่าเป็นใคร แต่ไม่มี token) ·
  ต่างจาก refresh ที่ถูก **ปฏิเสธ** (401) → ออกจากระบบตามเดิม · เน็ตกลับมาคำขอแรกได้ 401 → api-client หมุน token เอง
- 📁 `features/sync/sync-bridge.tsx` — สถานะกลายเป็น "ไม่ได้ล็อกอิน" → ล้างแคชในหน่วยความจำ + บนดิสก์ · มีของค้างตอนออฟไลน์ → ขอ Background Sync
- 📁 `public/sw.js` (เฉพาะ build จริง — `/sw.js?cache=1`)
  - ติดตั้งแล้วเก็บทุกหน้าของแอป + ไฟล์ `/_next/static/*` ที่หน้าอ้างถึงล่วงหน้า · หน้าเว็บส่ง `nosion:precache` ตอนเปิด (SW เว้นช่วง 1 ชม.) ให้เก็บรุ่นใหม่หลัง deploy
  - หน้า = network-first (เก็บตาม path) · static/ไอคอน = cache-first · ไม่แตะ `/api/` · หน้าที่ไม่มีในที่เก็บ → หน้า "ออฟไลน์อยู่"
  - `sync` (tag `nosion-outbox`) → ส่ง `nosion:sync` ให้แท็บที่เปิดอยู่ flush

**การตัดสินใจ**

- **ข้อมูลออฟไลน์มาจากแคชของ query ไม่ใช่ SW แคช API** — SW ไม่มี access token (อยู่ใน memory ของหน้าเท่านั้น) และแคช HTTP ไม่รู้ว่าข้อมูลไหนใหม่กว่า ·
  แคชของ query รู้ `dataUpdatedAt` → hydrate ไม่ทับของสดที่โหลดเสร็จก่อนอ่านดิสก์
- **session ใช้ `networkMode: 'always'`** — ค่าเริ่มต้นพัก queryFn ตอนออฟไลน์ → จอค้าง skeleton ตลอด · ตัวนี้ตัดสินเองว่า "เน็ตหลุด" หรือ "หมดสิทธิ์"
  และรอ `isFetching` จบก่อนตัดสิน (แคชจากดิสก์มาถึงก่อนผลรอบนี้ได้ — ถ้าไม่รอจะออกจากระบบผิด ๆ)
- **ล้างแคชเมื่อไม่ได้ล็อกอิน** — เดิม logout ไม่ล้างแคชในหน่วยความจำ (คนถัดไปเห็นข้อมูลเก่าแวบหนึ่ง) · พอแคชลงดิสก์กลายเป็นเรื่องความเป็นส่วนตัว จึงแก้ที่จุดเดียว
- Background Sync ทำได้แค่ **ปลุกแท็บที่เปิดอยู่** — การส่งต้องใช้ access token · ปิดแท็บหมดแล้วคิวรอจนเปิดแอปครั้งถัดไป (คิวอยู่ใน IndexedDB ไม่หาย)
- ไฟล์ static รุ่นเก่าสะสมใน `nosion-static-v1` จนกว่าจะเปลี่ยน `VERSION` — ชื่อไฟล์มี hash จึงไม่เสิร์ฟผิด แค่กินที่ · ยอมรับไว้ก่อน

**เจอระหว่างทาง:** รีเฟรชตอนออฟไลน์แล้วจอค้าง skeleton — HTML มาจากแคชแต่ JS ของหน้าไม่ถูกเก็บ: regex ที่หาไฟล์ในหน้าตัด URL ตรง `(` ของ route group
(`chunks/app/(app)/tasks/page-….js`) · แก้ให้รับวงเล็บแล้วค่อยตัด `)` ท้ายของ `url(...)` ใน CSS

**วิธีตรวจ**

- unit (+4): persist 3 (เก็บ→เปิดใหม่ได้คืน · ตัด preview/ค้นหา · เกิน 7 วันไม่ใช้ · ลบเมื่อออกจากระบบ · ไม่ทับข้อมูลที่ใหม่กว่า) · `serviceWorkerUrl` (cache=1 เฉพาะ build จริง)
- Playwright ui: **โหลด /tasks → รอแคชลงดิสก์ + SW เก็บหน้า → ตัดเน็ต → รีเฟรช: ยังอยู่ /tasks เห็นงานเดิม → เพิ่มงาน → ต่อเน็ต → `/sync/push`** ·
  **เปิด /habits (ไม่เคยเปิด) ตอนออฟไลน์ได้** · 53 ผ่าน
- `pnpm verify` exit 0
