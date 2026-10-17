# Phase 8 · Polish + Portfolio (สัปดาห์ 17)

> เป้าหมาย: พร้อมโชว์ — คุณภาพวัดได้ (a11y · visual · Lighthouse), เข้าใช้ได้ทั้งไทยและอังกฤษ, ย้ายข้อมูลเข้าได้, ต่อกับระบบอื่นได้ (Public API · GitHub), deploy production ได้ — สเปก 15 Phase 8
> **DoD:** ส่งลิงก์ให้เพื่อนที่ไม่ใช่ dev แล้วเขาใช้งานได้เองโดยไม่ต้องอธิบาย

## สถานะตั้งต้น (ตรวจก่อนเริ่ม)

| ข้อในสเปก                                     | ก่อนเริ่ม                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| axe 0 serious ทั้ง dark/light                 | ✅ ทุกหน้า (Phase 2a เป็นต้นมา)                                           |
| Visual regression 4 หน้า × 2 ธีม × 2 จอ ใน CI | ✅ 6 หน้า แต่ threshold 1% (สเปก 0.2%)                                    |
| Demo + seed data                              | ✅                                                                        |
| ADR ≥ 9                                       | ✅ 12 ฉบับ                                                                |
| Lighthouse ≥ 90                               | ❌ ยังไม่เคยวัด                                                           |
| i18n ไทย + อังกฤษ                             | ❌ ข้อความไทยฝังในโค้ด                                                    |
| Import CSV / Todoist                          | ❌ มีแค่ export CSV                                                       |
| Public API + Swagger + API key                | ⚠️ Swagger มีแล้ว · ไม่มี API key                                         |
| GitHub integration                            | ❌                                                                        |
| `deploy-production.yml` + rollback            | ❌ — เจ้าของเลือก: เขียน workflow รอไว้ (สร้างโปรเจกต์ production ทีหลัง) |
| README + diagram + video                      | ⚠️ README มี · video ต้องเจ้าของอัด                                       |

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                    | Commit | สถานะ |
| --- | ----------------------------------------------------------------------- | ------ | ----- |
| 1   | Visual: threshold 0.2% ตามสเปก + เกณฑ์ต่อพิกเซลที่วัดจาก noise จริง     | —      | ⬜    |
| 2   | Lighthouse CI ทุกหน้าหลัก ≥ 90 ทุกหมวด + แก้ที่ตก                       | —      | ⬜    |
| 3   | Import CSV / Todoist (preview ก่อนนำเข้า · กันซ้ำ)                      | —      | ⬜    |
| 4   | API key (สร้าง/เพิกถอน · scope) + Public API ใน Swagger                 | —      | ⬜    |
| 5   | GitHub webhook: PR merged → ปิดงานที่อ้างถึง (ตรวจลายเซ็น)              | —      | ⬜    |
| 6   | i18n: dictionary ไทย/อังกฤษ · สลับภาษาในตั้งค่า · วันที่/เงินตาม locale | —      | ⬜    |
| 7   | `deploy-production.yml` จาก tag + rollback                              | —      | ⬜    |
| 8   | ให้คนที่ไม่ใช่ dev ใช้เองได้: onboarding/empty state · README + diagram | —      | ⬜    |
| 9   | บท learn 21 + ADR                                                       | —      | ⬜    |

---

## ขั้น 1 · Visual regression ตามเกณฑ์สเปก — `70b9cfa`

**สิ่งที่เปลี่ยน:** `playwright.config.ts` — `maxDiffPixelRatio` 1% → **0.2%** · เพิ่ม `threshold: 0.05` (เกณฑ์ว่าพิกเซลไหน "ต่าง" · ค่าเริ่มต้น 0.2)

**วัดก่อนตั้ง** — เทียบภาพจาก runner ของ GitHub สองรอบ (`Update visual baselines` ของ `d9b5a99` กับ baseline ใน repo) ด้วย comparator ตัวเดียวกับ Playwright:

| `threshold` ต่อพิกเซล | noise (หน้าที่ไม่ได้เปลี่ยน 20 ภาพ) | หน้า Today ที่เพิ่ม chip `MUT` + การ์ด Outbox |
| --------------------- | ----------------------------------- | --------------------------------------------- |
| 0.2 (ค่าเริ่มต้น)     | 0 พิกเซล                            | 63–84 พิกเซล                                  |
| 0.05                  | 0                                   | 194–263                                       |
| 0.02                  | 0                                   | ~1,580                                        |

นับไบต์ตรง ๆ ต่างกัน 2,000–37,000 พิกเซลต่อภาพ (ขอบ anti-alias) แต่ไม่มีพิกเซลไหนต่างเกิน 0.02 — render บน image เดียวกัน (`playwright:v1.63.0-noble`) นิ่งพอ

**การตัดสินใจ**

- ratio 0.2% ตามสเปก + `threshold` 0.05 — เข้มขึ้น 4 เท่าต่อพิกเซลแต่ยังห่างจาก noise ที่วัดได้
- ⚠️ ข้อจำกัดของเกณฑ์แบบสัดส่วน: chip เล็กหนึ่งอันบนจอ 1440×900 คือ ~0.02% — **ยังผ่าน** แม้ 0.2% · visual test จับ "หน้าพัง/เลื่อน/สีเปลี่ยนทั้งชุด"
  ส่วนองค์ประกอบเล็กพึ่ง a11y/E2E (มองหาด้วยชื่อ) + การดูภาพตอนสร้าง baseline ใหม่
- baseline เดิมผ่านเกณฑ์ใหม่ทุกภาพ (ต่าง 0 พิกเซลที่ 0.02) — ไม่ต้องสร้างใหม่

**วิธีตรวจ:** comparator ของ Playwright (ตารางบน) · CI รอบ push ท้าย phase

## ขั้น 2 · Lighthouse ≥ 90 ทุกหน้าหลัก — `86b7ecb` (+ ต่อท้ายด้านล่าง)

**วิธีวัด:** 📁 `apps/web/scripts/lighthouse.mjs` — Lighthouse user flow (puppeteer + Chromium ของ Playwright) · หน้าสาธารณะ 2 หน้า →
demo login ครั้งเดียว → หน้าแอป 6 หน้า โดยไม่ล้าง storage (refresh cookie ต้องอยู่) · ตรวจว่า **หน้าที่ไปถึงจริง** ตรงกับที่ตั้งใจ (หลุดไป `/login` = วัดผิดหน้า) ·
มือถือ (จำลองเน็ต/CPU ช้า) และ desktop · ใน CI: job `lighthouse` ต่อจาก smoke ใน `deploy-staging.yml` + เก็บรายงาน HTML เป็น artifact

**รอบแรก (staging · มือถือ)**

| หน้า                    | perf   | a11y | best-practices | หมายเหตุ                         |
| ----------------------- | ------ | ---- | -------------- | -------------------------------- |
| `/`                     | 78     | 100  | 100            | LCP 3.1 วิ · TBT 580ms           |
| `/today` `/tasks`       | 97–100 | 98   | 96             | `heading-order` · 500 ใน console |
| `/expenses` … `/review` | —      | —    | —              | **หลุดไป `/login` ทุกหน้า**      |

**สิ่งที่พบและแก้ (สามข้อแรกเป็นบั๊กจริงที่ผู้ใช้เจอได้)**

1. **refresh token ถูกมองว่าขโมย เมื่อคำตอบไปไม่ถึง** — Lighthouse เปลี่ยนหน้าระหว่างที่หน้าเดิมกำลังหมุน token → cookie ไม่ถูกอัปเดต → ส่งใบเก่าซ้ำ
   → server เพิกถอนทุกอุปกรณ์ + ส่งอีเมล "ตรวจพบกิจกรรมน่าสงสัย" · ผู้ใช้จริงเจอได้จาก **เปิดสองแท็บพร้อมกัน / รีเฟรชระหว่างหมุน / เน็ตมือถือหลุด** ·
   แก้: ใบที่เพิ่งถูกหมุน (`rotated`) ไม่เกิน **20 วิ** → ออกใบใหม่ใน family เดิม · พ้นช่วงยังถือเป็นการใช้ซ้ำ (integration test ครอบทั้งสองฝั่ง)
2. **staging API ล่มทั้งตัว ~15 นาที** — ตามหา 500 ใน console ด้วยการยิงคำขอพร้อมกัน 12 ตัว × หลายรอบ (**ผมเป็นคนทำให้ล่ม**) → ทุก instance ใหม่ของ Vercel
   ตายตอนบูต (`FUNCTION_INVOCATION_FAILED` ~1.8 วิ) จนกว่า instance เก่าที่ถือ connection จะหมดอายุ · ต้นเหตุในโค้ด: `PrismaService.onModuleInit` รอ `$connect()`
   — ต่อ DB ไม่ได้ = ทั้ง process ล้ม แล้ว Vercel เปิด instance ใหม่มาลองซ้ำ (connection ยิ่งแน่น) · แก้: ต่อไม่ได้ตอนบูตแค่ log (Prisma ต่อเองตอน query แรก) ·
   **ยังต้องให้เจ้าของตรวจ** `DATABASE_URL` บน Vercel ว่าเป็น transaction pooler `:6543?pgbouncer=true&connection_limit=1` ตามคู่มือ
3. precache ของ SW (Phase 7) เริ่มทุกหน้า แม้ผู้เข้าชมยังไม่ล็อกอิน → ดึง ~60 ไฟล์ระหว่างหน้าแรกโหลด · แก้: precache เฉพาะเมื่อล็อกอินแล้ว
4. `heading-order` — `CardTitle` เป็น h3 ใต้ h1 ของหน้า · แก้: ค่าเริ่มต้น h2 (+ `as="h3"` สำหรับการ์ดที่ซ้อนใต้ h2)
5. `/calendar` CLS **0.53** (มือถือ) — chip กรองโมดูลมาพร้อมข้อมูล (1 → 4 อัน) แล้วขึ้นบรรทัดใหม่ ดันปฏิทินลง · แก้: มือถือเป็นแถวเดียวเลื่อนแนวนอน (`Chip` ไม่ถูกบีบ)
6. LCP หน้าแรก — preload ฟอนต์ 10 ไฟล์ · Plex Thai โหลดชุดละตินที่ไม่เคยใช้ (Inter อยู่ก่อนใน font stack) · แก้: Plex Thai เฉพาะ `thai` · JetBrains Mono ไม่ preload → เหลือ 5 ไฟล์

**ผลหลังแก้ (production build + API ในเครื่อง)**

| หน้า        | มือถือ perf | desktop perf | a11y | best-practices | SEO |
| ----------- | ----------- | ------------ | ---- | -------------- | --- |
| `/`         | 95          | 100          | 100  | 100            | 100 |
| `/login`    | 100         | 100          | 100  | 100            | 100 |
| `/today`    | 98          | 100          | 100  | 100            | 100 |
| `/tasks`    | 95          | 100          | 100  | 100            | 100 |
| `/expenses` | 96          | 95           | 100  | 100            | 100 |
| `/calendar` | 96          | 100          | 100  | 100            | 100 |
| `/habits`   | 93          | 100          | 100  | 100            | 100 |
| `/review`   | 91          | 100          | 100  | 100            | 100 |

perf มือถือแกว่ง ±3 ตามโหลดของเครื่อง · ตัวเลข staging จริงมาจาก job `lighthouse` หลัง push

**เจอระหว่างทาง (เครื่อง dev):** `next build` ค้าง 25+ นาทีโดยไม่ใช้ CPU — กำลังลบ `.next/standalone` แต่มี `.DS_Store` ถูกสร้างใหม่ในโฟลเดอร์ที่กำลังลบ
(Finder/iCloud) → `rmdir` ล้ม → Next ลองใหม่ไม่รู้จบ · ลบ `.next` เองก่อน build แล้วผ่านใน 30 วิ

**วิธีตรวจ:** unit (+1 PrismaService) · integration auth (grace 20 วิ / พ้นแล้วเพิกถอน) · API 118 + worker 19 · ui 55 · `pnpm verify` exit 0

### ขั้น 2 (ต่อ) · หลัง push: ต้นเหตุจริงของ staging + วิธีวัดที่เชื่อได้

**1. `DATABASE_URL` ของ staging เป็น session pooler** — ค่าตั้งเป็น Sensitive บน Vercel (อ่านกลับไม่ได้แม้ใช้ token: `[SENSITIVE]`)
→ ดูจาก runtime log แทน: workflow ใหม่ **Check staging config** (`vercel logs --status-code 5xx` · ลบ connection string/อีเมล/token ก่อนพิมพ์)
→ ทุก 5xx คือ `EMAXCONNSESSION ... session mode - pool_size: 15` · ทุก instance ถือ connection จริง 1 เส้น เกิน 15 = ล้ม
(refresh ล้ม → ผู้ใช้ถูกพาไป `/login` · demo login · cron การเตือน) · แก้ด้วย workflow **Fix staging DATABASE_URL**:
สร้างจาก secret `STAGING_DIRECT_URL` (ตรวจรูปแบบก่อน) → พอร์ต 6543 + `?pgbouncer=true&connection_limit=1` → `vercel env add --sensitive --force` → deploy ใหม่ ·
ไม่มีค่าใดถูกพิมพ์ (`::add-mask::`) · หลังแก้ ทุกหน้าใน Lighthouse ไปถึงหน้าที่ตั้งใจ, best-practices 100

**2. CLS หน้า Today (desktop) 0.39** — skeleton คำทักทาย `h-11 + h-4` เตี้ยกว่าข้อความจริง 38px → การ์ดทั้งแถวถูกดันลง ·
แก้: skeleton อยู่ในบรรทัดที่ใช้ class ตัวอักษรชุดเดียวกับของจริง (`inline-block h-[0.85em]`) → สูงเท่ากันพอดี

**3. คะแนน perf ของการวัดรอบเดียวเชื่อไม่ได้** — เครื่องเดียวกันหน้าเดียวกัน หน้าแรกได้ 68 / 95 / 99 ตามโหลดของเครื่อง
และวัดหลายรอบใน tab เดียว คะแนนหน้าแอป **ตกทุกรอบ** (100 → 90 → 82) · พิสูจน์ว่าไม่ใช่แอป: เปิดทุกหน้า 3 รอบใน session เดียว
แล้ววัด long task ของ `/review` ด้วย CPU ช้า 4 เท่า = 0ms ทุกรอบ · แคชใน IndexedDB หยุดโตที่ 99KB/15 query ·
แก้สคริปต์: **3 รอบ ตัดสินด้วยมัธยฐาน** · tab ใหม่ทุกรอบ (cookie ของ context เดิม — ล็อกอิน demo ครั้งเดียว) · หน้าสาธารณะใน context ที่ไม่ได้ล็อกอิน

| หน้า (มือถือ · ในเครื่อง)      | perf มัธยฐาน (3 รอบ) |
| ------------------------------ | -------------------- |
| `/`                            | 97 (97/98/97)        |
| `/login`                       | 100                  |
| `/today`                       | 93 (93/94/93)        |
| `/tasks` `/expenses` `/review` | 99                   |
| `/calendar`                    | 99 (100/99/96)       |
| `/habits`                      | 100 (100/100/96)     |

a11y · best-practices · SEO = 100 ทุกหน้า
