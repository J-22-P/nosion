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

| #   | ขั้น                                                                    | Commit    | สถานะ                       |
| --- | ----------------------------------------------------------------------- | --------- | --------------------------- |
| 1   | Visual: threshold 0.2% ตามสเปก + เกณฑ์ต่อพิกเซลที่วัดจาก noise จริง     | `70b9cfa` | ✅                          |
| 2   | Lighthouse CI ทุกหน้าหลัก ≥ 90 ทุกหมวด + แก้ที่ตก                       | `86b7ecb` | ✅                          |
| 3   | Import CSV / Todoist (preview ก่อนนำเข้า · กันซ้ำ)                      | —         | ⏭ เจ้าของสั่งข้าม (17 ต.ค.) |
| 4   | API key (สร้าง/เพิกถอน · scope) + Public API ใน Swagger                 | `400f307` | ✅                          |
| 4b  | เข้าสู่ระบบด้วย Google / GitHub (OAuth · ผูกบัญชีเดิม)                  | `1800855` | ✅                          |
| 5   | GitHub: webhook PR merged → ปิดงาน (ตรวจลายเซ็น) + ดึง issue ลงปฏิทิน   | `abf0e6f` | ✅                          |
| 6   | i18n: dictionary ไทย/อังกฤษ · สลับภาษาในตั้งค่า · วันที่/เงินตาม locale | `d44bd34` | ✅                          |
| 7   | `deploy-production.yml` จาก tag + rollback                              | `a97209f` | ✅                          |
| 8   | ให้คนที่ไม่ใช่ dev ใช้เองได้: onboarding/empty state · README + diagram | `66a4b99` | ✅                          |
| 9   | บท learn 21 + ADR                                                       | `8bd92fd` | ✅                          |

**วิธีทำงาน (ตั้งแต่ขั้น 4):** แตก `develop` จาก `main` · หนึ่งฟีเจอร์ = หนึ่ง branch `feature/…` จาก `develop` · เสร็จแล้ว merge กลับ `develop` (`--no-ff`)

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

**4. rate limit ต่อ IP เป็นโควตารวมทั้งโลก** — smoke ของ CI ได้ 429 ที่ demo login ทั้งที่ runner คนละ IP กับผม: API ใช้ `req.ip` โดยไม่ตั้ง
`trust proxy` และคำขอทั้งหมดผ่าน proxy `/api/v1` ของเว็บ → API เห็นทุกคนเป็น IP ของ Vercel (demo ของทุกคนรวม 5 ครั้ง/ชม. · กันเดารหัสผ่านต่อ IP ไม่มีผล) ·
แก้: 📁 `apps/web/src/middleware.ts` rewrite เองพร้อมแนบ IP ผู้ใช้ (จาก `x-forwarded-for` ที่ edge ของ Vercel เขียนทับ — ปลอมไม่ได้)

- รหัสลับร่วม `API_PROXY_KEY` · 📁 `apps/api/src/common/client-ip.ts` middleware ตัวแรก แทน `req.ip` **เฉพาะเมื่อรหัสตรง** (timing-safe) แล้วลบ header ทิ้ง ·
  `trust proxy` = 1 บน Vercel (คำขอที่เข้า API ตรง) · workflow **Rotate staging API proxy key** สุ่ม/หมุนรหัส (Sensitive ทั้ง web + api) ·
  ระหว่างที่สองฝั่งยังไม่ตรงกัน = เหมือนก่อนมีกลไก (ไม่พัง) · หลังแก้ smoke ได้ 200

**5. CLS หน้า Today (desktop) ยังเป็น 0.39 หลังแก้ skeleton** — วัดซ้ำ: แถวล่างของ hero ถูกดันลง **74px** ไม่ใช่ 38 — คำทักทายยาว
("สวัสดีตอนบ่าย ผู้ใช้ทดลอง") ขึ้นสองบรรทัดเมื่อมีปุ่มอยู่ขวา ความสูงของ skeleton จึงเดาไม่ได้ · แก้ที่ต้นเหตุ: hero **ไม่รอ API** —
`greetingFor` ย้ายไป `@nosion/core` (API ใช้ตัวเดียวกัน) · เว็บคำนวณคำทักทาย/วันที่/โซนจาก session ทันที

**ค้าง (ไม่กระทบเกณฑ์):** บน staging (desktop) มีคำขอ `/api/v1/calendar` หนึ่งตัวออกไปก่อนได้ token → 401 แล้วลองใหม่สำเร็จ → best-practices 96 ·
ทำซ้ำในเครื่องไม่ได้ (ไม่มี 4xx เลยใน 3 หน้า) — ดูต่อเมื่อมีเวลา

**ผลบน staging จริง (job `lighthouse` · runner ของ GitHub · มัธยฐาน 3 รอบ · `c85007a`)**

| หน้า        | มือถือ perf       | desktop perf      | a11y | best-practices | SEO |
| ----------- | ----------------- | ----------------- | ---- | -------------- | --- |
| `/`         | 97                | 100               | 100  | 100            | 100 |
| `/login`    | 93                | 100               | 100  | 100            | 100 |
| `/today`    | 96                | 96 (CLS 0.39 → 0) | 100  | 96–100         | 100 |
| `/tasks`    | 92                | 100               | 100  | 96–100         | 100 |
| `/expenses` | 92                | 97                | 100  | 100            | 100 |
| `/calendar` | **88** (92/88/85) | 100               | 100  | 100            | 100 |
| `/habits`   | 94                | 100               | 100  | 100            | 100 |
| `/review`   | **88** (88/88/92) | 100               | 100  | 100            | 100 |

perf มือถือบน runner แกว่งระหว่าง run ของโค้ดเดียวกัน (`/calendar` 99 → 88 · `/review` 96 → 88) — ใกล้เส้น 90

## ขั้น 4 · API key + Public API — branch `feature/api-keys`

**เป้าหมาย:** สคริปต์/ระบบอื่นอ่าน-เขียนข้อมูลของผู้ใช้ได้ด้วย key ที่ผู้ใช้สร้างและเพิกถอนเอง (สเปก 7.3 · 7.5 · 9.3 "API key มี scope และตรวจทุกครั้ง")

**สิ่งที่เปลี่ยน**

- 📁 `packages/contracts/src/api-keys.ts` — `createApiKeySchema` (ชื่อ · scope `read`/`write` · อายุ 1–365 วันหรือไม่หมดอายุ)
- 📁 `apps/api/src/auth/api-keys/` — รูปแบบ key `nos_` + 32 ไบต์สุ่ม · DB เก็บ sha256 + prefix 12 ตัวไว้แสดง ·
  `GET/POST /me/api-keys` · `DELETE /me/api-keys/:id` (key เต็มคืนครั้งเดียวตอนสร้าง) · ถือ key ที่ใช้ได้พร้อมกันสูงสุด 10
- 📁 `apps/api/src/auth/guards/jwt-auth.guard.ts` — ทางเข้าที่สอง: `Authorization: Bearer nos_…` หรือ `X-API-Key` ·
  ใช้ได้เฉพาะ controller ที่ติด **`@PublicApi()`** (entries · tasks · expenses · budgets · habits · calendar · today · review · projects · tags) ·
  GET/HEAD = `read` · อื่น ๆ = `write` · **60 ครั้ง/นาที/key** + header `RateLimit-Limit/Remaining/Reset` (+ `Retry-After` เมื่อ 429) ·
  `lastUsedAt` เขียนไม่เกินนาทีละครั้ง
- 📁 `apps/api/src/openapi.ts` — Swagger UI ที่ **`/api/v1/docs`** + `/api/v1/openapi.json` เปิด**ทุกสภาพแวดล้อม** (เดิมปิดใน production) ·
  อยู่ใต้ `/api/v1` เพื่อเข้าผ่าน proxy ของเว็บได้ · สร้างเอกสารตอนมีคนเปิดครั้งแรก (ไม่เพิ่ม cold start) · ปุ่ม Authorize ใส่ key ได้
- `swagger-ui-dist` เป็น dependency ตรงของ API + `includeFiles` ใน `vercel.json` — ไฟล์ static ของ Swagger UI ถูกอ่านด้วย `express.static` ซึ่ง
  การ trace ของ Vercel อาจไม่เก็บมาให้
- 📁 `apps/web/src/features/settings/api-keys-card.tsx` — การ์ดในหน้าตั้งค่า: รายการ (prefix · scope · ใช้ล่าสุด · หมดอายุ) ·
  ฟอร์มสร้าง · กล่อง "คัดลอก key ตอนนี้ ปิดแล้วไม่เห็นอีก" · เพิกถอนต้องกดยืนยันสองครั้ง

**การตัดสินใจ**

- **opt-in ต่อ controller (`@PublicApi`) ไม่ใช่ opt-out** — แบบเดียวกับ `@Public()`: endpoint ใหม่ไม่กลายเป็น Public API เพราะลืม ·
  หน้าจัดการ key/โปรไฟล์/ออกจากระบบใช้ key ไม่ได้ → **key ที่หลุดไปสร้าง key ใหม่ให้ตัวเองไม่ได้** (มีเทสต์)
- sha256 ไม่ใช่ Argon2 — key สุ่ม 256 บิตเดาไม่ได้อยู่แล้ว และต้องค้นจาก hash ตรง ๆ ทุกคำขอ (unique index) ซึ่ง hash ที่ใส่ salt ทำไม่ได้
- คำนำหน้า `nos_` — guard แยกจาก JWT ได้โดยไม่ต้องลอง verify · เครื่องมือสแกน secret จับได้เมื่อหลุดเข้า git
- rate limit ต่อ **key** ไม่ใช่ต่อ IP · window ตรงนาที (`rl:apikey:<id>:<นาที>`) จึงบอก `RateLimit-Reset` ได้แม่น
- demo สร้าง key ได้ (ผู้เข้าชมลอง Public API ได้จริง) — key ตายพร้อมบัญชี demo (cascade + ตรวจ `user.expiresAt` ตอนยืนยันตัวตน)

**วิธีตรวจ**

- unit `api-key.spec.ts` (5) · integration `api-keys.int-spec.ts` (7): key เห็นครั้งเดียว/DB มีแค่ hash · read ได้ทั้งสอง header แต่ POST = 403 ·
  write สร้างงานได้และเป็นของเจ้าของ key · `/me` และ `/me/api-keys` ใช้ key ไม่ได้ · เพิกถอน/หมดอายุ/key มั่ว = 401 · IDOR = 404 · ครั้งที่ 61 = 429 + `Retry-After`
- API ทั้งชุด: unit 197 · integration 125 ผ่าน
- build แล้วรัน `NODE_ENV=production` ในเครื่อง → Swagger UI โหลดใน Chromium ภายใต้ CSP ของ helmet (85 operation · ไม่มี error ใน console)
- UI: `a11y.spec.ts` เพิ่มเทสต์สร้าง/คัดลอก/เพิกถอน + axe ของฟอร์ม · axe ทั้งหน้า `/settings` สองธีมจับได้ลิงก์ "เอกสาร API"
  แยกจากข้อความด้วยสีอย่างเดียว (`link-in-text-block`) → ขีดเส้นใต้

**ค้าง:** Swagger UI บน Vercel (staging) **ยังไม่ได้ตรวจ** — ตรวจหลัง deploy ว่า `/api/v1/docs/swagger-ui-bundle.js` ได้ 200 ·
schema ของ body ใน Swagger ยังว่าง (validate ด้วย Zod ไม่ใช่ class DTO) — เอกสารบอกรูปแบบด้วยคำอธิบาย + `packages/contracts`

📚 บท learn 21 (ขั้น 9)

## ขั้น 4b · เข้าสู่ระบบด้วย Google / GitHub — branch `feature/oauth-login`

**เป้าหมาย (เจ้าของสั่ง 17 ต.ค.):** ล็อกอินด้วยบัญชี Google (Gmail) และ GitHub ได้ · GitHub เป็นทางไปสู่การดึงงานลงปฏิทิน (ขั้น 5)

**สิ่งที่เปลี่ยน**

- migration `20261017090000_oauth_accounts` — `oauth_accounts` เพิ่ม `login` · `accessTokenEnc` · `scopes` · `updatedAt` + unique `(userId, provider)`
  (ตารางมีอยู่แล้วตั้งแต่ Phase 0 แต่ยังไม่เคยใช้ · เพิ่มแบบ nullable ทั้งหมด = backward-compatible)
- 📁 `apps/api/src/infra/crypto/secret-box.ts` — AES-256-GCM ด้วย `ENCRYPTION_KEY` (ตัวแปรนี้มีตั้งแต่ Phase 0 แต่เพิ่งได้ใช้) · `aad` ผูกค่ากับบริบท
- 📁 `apps/api/src/auth/oauth/` — Authorization Code + **PKCE (S256)** ทั้งสองเจ้า ·
  `GET /auth/oauth/providers` · `GET /auth/oauth/:provider` → 302 ไปผู้ให้บริการ · `GET /auth/oauth/:provider/callback` → ตั้ง refresh cookie → 302 `/today` ·
  `POST /auth/oauth/:provider/link` (ผูกจากหน้าตั้งค่า) · `GET/DELETE /me/oauth-accounts`
- เว็บ: ปุ่ม "ดำเนินการต่อด้วย Google / GitHub" ใน `/login` `/register` · ข้อความเมื่อ `?oauth_error=` · การ์ด **บัญชีที่เชื่อม** ในตั้งค่า
  (GitHub เลือก "รวม repo ส่วนตัว" ได้) · คู่มือตั้ง OAuth app: 📁 `docs/deploy/staging-vercel-supabase.md` หัวข้อ 7

**การตัดสินใจ**

- **state + PKCE verifier อยู่ในคุกกี้ที่เข้ารหัส** ไม่ใช่ Redis/memory — serverless ไม่มี memory ร่วม และไม่ให้ flow ล้มเมื่อ Redis ล่ม ·
  คุกกี้ `SameSite=Lax` (callback มาจากโดเมนของ Google = cross-site · Strict จะไม่ถูกส่งมา) · path `/api/v1/auth/oauth` · อายุ 10 นาที · ใช้ครั้งเดียว
- **จับคู่บัญชี:** เคยผูก → คนเดิม · อีเมลตรงกับผู้ใช้เดิม → ผูกอัตโนมัติ**เฉพาะเมื่อทั้งสองฝั่งยืนยันอีเมลแล้ว** ·
  ผู้ใช้เดิมยังไม่ยืนยัน → ปฏิเสธ (`email_conflict`) — กันผู้ร้ายสมัครด้วยอีเมลของเหยื่อทิ้งไว้แล้วรอเหยื่อมาล็อกอินด้วย Google เข้าบัญชีที่ผู้ร้ายรู้รหัสผ่าน ·
  GitHub ใช้เฉพาะอีเมลหลักที่ **verified**
- ล็อกอินสำเร็จ **ไม่ส่ง token ทาง URL** — ตั้ง refresh cookie แล้วพาไป `/today` · เว็บขอ access token เองตาม flow เดิม (`useSession`) ·
  คุกกี้ refresh ยังเป็น `SameSite=Strict` ได้: การ**ตั้ง**คุกกี้ใน response ของ navigation ข้ามไซต์ทำได้ ส่วนการ**ส่ง**ทีหลังเป็น fetch จากหน้าเราเอง
- ผูกบัญชีจากหน้าตั้งค่าเป็นการเปิดหน้าใหม่ (ไม่มี access token ใน memory ไปด้วย) → API ออก **link intent** เข้ารหัส อายุ 2 นาทีแนบไปกับ URL
- **scope น้อยที่สุด:** Google `openid email profile` · GitHub ล็อกอิน `read:user user:email` · repo ส่วนตัวต้องติ๊กขอ `repo` เอง (OAuth App ไม่มี scope อ่านอย่างเดียว)
- เก็บ token เฉพาะ GitHub (เข้ารหัส · aad ผูก id ของแถว — ก๊อป ciphertext ไปแถวอื่นถอดไม่ได้) · Google ใช้แค่ยืนยันตัวตน ไม่เก็บ
- ผู้ใช้ที่สมัครด้วย OAuth ไม่มีรหัสผ่าน → ยกเลิกการเชื่อมบัญชีสุดท้ายไม่ได้ (409) · ตั้งรหัสผ่านได้ผ่าน "ลืมรหัสผ่าน"
- ปุ่มแสดงทันทีแล้วซ่อนอันที่ปิด (แทนที่จะรอคำตอบก่อนวาด) — เมื่อเปิดครบไม่มี layout shift

**วิธีตรวจ**

- unit `secret-box.spec.ts` (3) · integration `oauth.int-spec.ts` (10 · ปลอมที่ `fetch` ชั้นนอกสุด ข้างในวิ่งจริงทั้งหมด):
  URL ของ Google มี PKCE S256 + คุกกี้ Lax ที่อ่าน state ไม่ออก · สมัครใหม่ (ไม่มีรหัสผ่าน · โซนเวลาจากเบราว์เซอร์) → refresh cookie ใช้ได้จริง · เข้าซ้ำไม่สร้างคนใหม่ ·
  ผูกอัตโนมัติ/ปฏิเสธตามสถานะการยืนยันอีเมล · state ปลอม/ไม่มีคุกกี้/ยกเลิก/code ผิด · ผูก GitHub + `repo` → token เข้ารหัส · ผูกซ้ำข้ามผู้ใช้ไม่ได้ ·
  ยกเลิกทางเข้าสุดท้ายไม่ได้ · ไม่ได้ตั้งผู้ให้บริการ → ซ่อน + กลับหน้า login
- API ทั้งชุด: unit 200 · integration 135 · UI (Playwright · mock API): ปุ่ม/ข้อความ error/เติมโซนเวลาตอนกด · การ์ดบัญชีที่เชื่อม · axe `/login` `/register` `/settings` สองธีมผ่าน

**ค้าง**

- ⚠️ **ยังไม่ได้ลองกับ Google/GitHub ตัวจริง** — ต้องให้เจ้าของสร้าง OAuth app แล้วใส่ค่าบน Vercel (คู่มือหัวข้อ 7)
- ภาพ baseline ของหน้า `/login` (4 ภาพ) เปลี่ยน → รัน workflow **Update visual baselines** หลัง push ไม่งั้น job visual ใน CI แดง

📚 บท learn 21 (ขั้น 9)

## ขั้น 5 · GitHub: ดึง issue ลงปฏิทิน + webhook ปิดงานเมื่อ PR merged — branch `feature/github-integration`

**เป้าหมาย:** สเปก "GitHub integration (webhook ปิด task เมื่อ PR merged)" + เจ้าของขอเพิ่ม (17 ต.ค.): **ล็อกอินด้วย GitHub แล้วดึงงานจาก GitHub ลงปฏิทิน**

**สิ่งที่เปลี่ยน**

- migration `20261017120000_github_integrations` — ตาราง `github_integrations` (secret ของ webhook เข้ารหัส · สถานะการดึงล่าสุด) ·
  payload ของ task เพิ่ม `github.url` · `github.milestoneDueOn` · `github.state` (มีค่าเริ่มต้น — payload เก่ายัง parse ได้)
- 📁 `apps/api/src/integrations/github/issue-plan.ts` — ฟังก์ชันบริสุทธิ์ "issue หนึ่งตัวต้องทำอะไรกับงาน" (สร้าง/แก้/ปิด/ข้าม)
- 📁 `github.service.ts` — `GET https://api.github.com/issues?filter=assigned` (ครั้งแรก: เปิดอยู่ · ครั้งต่อไป: ทุกสถานะ `since` รอบก่อน − 1 ชม.) ·
  งานอยู่ในโปรเจกต์ **GitHub** · `clientId = gh:<node_id>` (unique ต่อผู้ใช้ — ดึงกับ webhook มาพร้อมกันก็ไม่ซ้ำ) · ผ่าน `EntriesService` ตัวเดียวกับแอป
  (event/การเตือน/optimistic concurrency ครบ)
- `GET /integrations/github` · `POST /integrations/github/sync` · `POST/DELETE /integrations/github/webhook` ·
  `POST /webhooks/github/:id` (ตรวจ `X-Hub-Signature-256` จาก **body ดิบ** — แอปสร้างด้วย `rawBody: true`) · `GET /internal/cron/github` (รายชั่วโมง)
- เชื่อม GitHub สำเร็จ → event `oauth.github.connected` → ดึงรอบแรกทันที (รอไม่เกิน 3 วิก่อน redirect)
- เว็บ: การ์ด **GitHub → งานและปฏิทิน** (สถานะ · ดึงตอนนี้ · เปิด webhook แสดง URL + secret ครั้งเดียว) ·
  ป้าย `repo#เลข` บนการ์ดงานเป็นลิงก์ไป GitHub · เมนู ⋯ → **คัดลอกรหัสอ้างอิงสำหรับ PR** (`nosion:<id>`)

**การตัดสินใจ**

- **วันในปฏิทินมาจาก milestone** — issue ของ GitHub ไม่มี due date ในตัว · ไม่มี milestone = งานไม่มีกำหนด (ไม่เดาวันให้)
  (ทางเลือกที่ไม่เอา: Projects v2 date field — ต้อง GraphQL + scope `read:project` เพิ่ม)
- **GitHub เป็นเจ้าของตาม "การเปลี่ยน" ไม่ใช่ทับทุกครั้ง** — จำ state/milestone ที่ซิงก์ครั้งก่อนไว้ใน payload:
  ปิด/เปิดงานเมื่อ state บน GitHub เปลี่ยน (ผู้ใช้ติ๊กเสร็จเองไม่ถูกเปิดกลับ) · วันเขียนทับเมื่อ milestone due เปลี่ยน (ผู้ใช้เลื่อนเองไม่ถูกดึงกลับ) ·
  ผู้ใช้ลบงาน = ไม่สร้างใหม่ · issue ที่ปิดก่อนเคยดึง = ไม่สร้าง
- **PR merged ปิดงาน 2 ทาง:** `nosion:<id>` ในชื่อ/คำอธิบาย/branch · หรืองานที่ดึงมาจาก PR ตัวนั้นเอง (`autoCloseOnMerge`) ·
  issue ที่ PR "Closes #n" ปิดผ่าน event `issues.closed` ที่ GitHub ส่งตามมาเอง — ไม่ต้อง parse "Closes" เอง
- webhook ระดับ repo ส่ง issue ของทุกคน → สนใจเฉพาะที่เคยดึงแล้วหรือ assignee เป็นเจ้าของ webhook ·
  ลายเซ็นผิด / id มั่ว / ปิด webhook แล้ว = **404 เหมือนกันหมด** (ไม่บอกว่า id ไหนมีจริง) · secret เก็บแบบเข้ารหัส (ต้องอ่านกลับมาคำนวณ HMAC)
- ไม่เก็บ `X-GitHub-Delivery` กันซ้ำ — ทุกการกระทำ idempotent อยู่แล้ว (ปิดงานที่ปิดแล้ว = ข้าม · upsert ด้วย clientId)

**วิธีตรวจ**

- unit: `issue-plan.spec.ts` (12) · `signature.spec.ts` (2 — รวม test vector จากเอกสาร GitHub) · contracts `github.test.ts` (3)
- integration `github.int-spec.ts` (9): ดึงครั้งแรก → งานในโปรเจกต์ GitHub + **ขึ้น `GET /calendar` วันที่ 20 ตาม milestone** · ดึงซ้ำไม่ซ้ำ/ปิดตาม/เปลี่ยนชื่อตาม/ใช้ `since` ·
  ลบแล้วไม่กลับ · webhook: ลายเซ็นผิด 404 · ping · PR merged ปิดงานที่อ้าง **แต่ไม่แตะงานของผู้ใช้อื่น (IDOR)** · PR ที่ดึงมาเองปิด ·
  issues event สร้าง/ไม่สนของคนอื่น/ปิดตาม · หมุน secret แล้วของเก่าใช้ไม่ได้ · ยังไม่เชื่อม = 409 ·
  `oauth.int-spec.ts` เพิ่ม: เชื่อม GitHub แล้วดึงรอบแรกทันที
- API ทั้งชุด: unit 214 · integration 144 · UI (mock API) 60 ผ่าน

**ค้าง**

- ⚠️ ยังไม่ได้ลองกับ GitHub ตัวจริง (ต้องมี OAuth app — ขั้น 4b) · ตั้งงาน `internal/cron/github` รายชั่วโมงบน cron-job.org (คู่มือหัวข้อ 5b)
- webhook ต้องเปิดทีละ repo — GitHub App (ติดตั้งครั้งเดียวทุก repo + สิทธิ์อ่านอย่างเดียว) ดีกว่าแต่ตั้งค่ายากกว่ามาก · บันทึกไว้ใน ADR (ขั้น 9)

📚 บท learn 21 (ขั้น 9)

## ขั้น 6 · i18n ไทย/อังกฤษ — branch `feature/i18n`

**เป้าหมาย:** สเปก 8.9 — `next-intl` ไทย (ค่าเริ่มต้น) + อังกฤษ · สลับในตั้งค่า · วันที่/เงินตามภาษา · ปีพุทธศักราชเลือกได้ · ICU plural

**สิ่งที่เปลี่ยน**

- **เว็บ:** ข้อความไทยที่ฝังในโค้ด ~900 บรรทัด / 94 ไฟล์ → 📁 `apps/web/messages/{th,en}.json` (923 ข้อความ) ·
  หน้าทั้งหมดย้ายเข้า 📁 `src/app/[locale]/` · 📁 `src/middleware.ts` อ่านคุกกี้ `NOSION_LOCALE` แล้ว rewrite ไป `/<locale>/…` ภายใน
- 📁 `src/i18n/current.ts` — `tr()` / `dateFormat()` / `currentIntlLocale()` สำหรับโค้ดที่ไม่ใช่ component (ตัวจัดรูปแบบ · สรุปกฎการเกิดซ้ำ · โมเดล ⌘K · toast)
  ตั้งค่าโดย `<LocaleBridge>` ใน layout · ตารางชื่อ (หมวด · วิธีจ่าย · smart list · วันในสัปดาห์) เป็น **getter** → ทุกจุดที่อ่าน `.label` ได้ภาษาปัจจุบันโดยไม่ต้องแก้
- 📁 `src/i18n/errors.ts` — ข้อความ validation ของ `packages/contracts` (ใช้ร่วมกับ API จึงเป็นไทย) แปลด้วยตารางที่เว็บ ·
  error จาก API ในโหมดอังกฤษ → ข้อความกลางตามชนิดปัญหา (RFC 9457 `type`/status) แทนการโชว์ไทยปน
- ตั้งค่า → การ์ด **ภาษาและรูปแบบวันที่** (สลับภาษา · ปี พ.ศ.) · ปุ่มสลับภาษาที่หน้าแรกและหน้า login/register ·
  ภาษาของบัญชี ↔ เครื่อง: เลือกบนเครื่องนี้แล้ว (มีคุกกี้) = บันทึกลงบัญชี · ไม่เคยเลือก = ใช้ภาษาของบัญชี (📁 `i18n/use-locale-sync.ts`)
- **API:** 📁 `packages/core/src/text.ts` พจนานุกรมข้อความที่เซิร์ฟเวอร์ประกอบเอง (การ์ด Today · สรุปสัปดาห์ · standup · คำทักทาย · การแจ้งเตือน) —
  `EN: Record<keyof typeof TH>` = ภาษาไหนขาด key คอมไพล์ไม่ผ่าน · โมดูลใช้ `ctx.locale` (มีใน `UserContext` ตั้งแต่ Phase 0)
- ปุ่ม/ป้ายในปฏิทิน (`calendarActions`/`toCalendarEvent` ไม่รู้ภาษา) → API ส่ง `meta.badgeKey` เพิ่ม · เว็บแปลตามโมดูล+ชนิด
- **อีเมล:** 📁 `packages/emails/src/copy.ts` ทั้ง 7 แบบ + footer + `<html lang>` · digest/การเตือน/ยืนยัน/รีเซ็ต/ความปลอดภัย ใช้ภาษาของผู้รับ ·
  สมัครสมาชิกส่ง `locale` มาด้วย → อีเมลยืนยันฉบับแรกถูกภาษา · **push** (หัวข้อ ปุ่ม "จ่ายแล้ว/เลื่อน 1 วัน") ตามภาษาผู้ใช้
- migration `20261017150000_buddhist_era` — `user_settings.buddhistEra` (ค่าเริ่มต้น `true`)
- เงิน: `formatMoney` ใช้ `currencyDisplay: 'narrowSymbol'` → ภาษาอังกฤษก็เป็น `฿1,234.50` (ไม่ใช่ `THB 1,234.50`)

**การตัดสินใจ**

- **URL ไม่มี `/en`** (`localePrefix: never` แบบทำเองใน middleware) — ลิงก์ในแอปไม่ต้องรู้ภาษา · service worker/แคชออฟไลน์ใช้ path เดิม ·
  ทุกหน้ายัง **static** ครบสองภาษา (`generateStaticParams` · build แสดง ● SSG ทุกหน้า) ต่างจากอ่านคุกกี้ตอน render ซึ่งทำให้ทุกหน้า dynamic (TTFB/Lighthouse)
- **ไม่เดาภาษาจาก `Accept-Language`** — ผลแน่นอน (เทสต์/Lighthouse เป็นเบราว์เซอร์อังกฤษ) · ค่าเริ่มต้นไทยตามสเปก · ผู้ใช้เลือกเองได้ตั้งแต่หน้าแรก
- **Intl ไทยต้องระบุปฏิทินเสมอ** — `th-TH` เฉย ๆ = พุทธศักราช (เดิมหน้าแอปปนกัน: Today เป็น 2569 · ปฏิทินเป็น 2026) ·
  ตอนนี้ `th-TH-u-ca-buddhist` / `th-TH-u-ca-gregory` ตามที่ผู้ใช้เลือก ค่าเริ่มต้น พ.ศ. (เท่ากับหน้าตาเดิมของ Today)
- ข้อความ error ของ API **ยังเป็นภาษาไทย** (Problem Details `detail` ~80 จุดใน service) — แปลทั้งหมดคุ้มน้อยกว่าให้เว็บแปลตาม `type`
  (ภาษาอังกฤษเห็นข้อความกลางที่ถูกต้องแต่เจาะจงน้อยกว่า) · Swagger/Public API คงไว้แบบเดิม
- ข้อมูลตัวอย่างของบัญชีทดลอง (ชื่องาน/บิล) เป็นภาษาไทย — เป็น "ข้อมูลของผู้ใช้" ไม่ใช่ UI

**วิธีตรวจ**

- 📁 `apps/web/scripts/check-messages.mjs` (อยู่ใน `test:unit`) — key ของ th/en ตรงกัน · ICU parse ได้และใช้ตัวแปรชุดเดียวกัน ·
  ทุก `tr('…')` / `t('…')` ในโค้ดมี key จริง (1,047 จุด) — จับ key ชนกัน (`newBill.remind` เป็นทั้งข้อความและกลุ่ม) ได้ระหว่างทำ
- เว็บ unit 119 (เทสต์ตั้งภาษาไทย ค.ศ. ใน `src/test-setup.ts`) · UI (mock API) **68**: ชุดเดิม 60 ภาษาไทย + ภาษาอังกฤษ 8 —
  ปุ่มสลับภาษาที่ login (คุกกี้ + URL เดิม + `<html lang="en">`) · 7 หน้าหลักเป็นอังกฤษ + axe ผ่าน
- เจอระหว่างทำ: หน้า login/register เป็น server component ที่ไม่ได้ `setRequestLocale` → ชุดอังกฤษถูก **สร้างเป็นไทย** (เฉพาะส่วนที่เป็น client เปลี่ยน) ·
  toast "เชื่อม GitHub แล้ว" ขึ้นซ้ำสองครั้งหลังเปลี่ยน dependency ของ effect → กันด้วย ref
- API: unit 216 · integration **146** (เพิ่ม `i18n.int-spec.ts`: สมัครด้วย `locale=en` · Today/สรุปสัปดาห์/standup เป็นอังกฤษ · สลับกลับเป็นไทยทันที) ·
  core 189 (`text.test.ts`) · emails 15 (ฉบับอังกฤษไม่มีอักษรไทยเลย) · notifications 21 (push อังกฤษ) · `pnpm verify` exit 0

**ค้าง**

- ภาพ baseline ของ visual test เปลี่ยน (ปีในปฏิทินเป็น พ.ศ. · หน้า login มีปุ่มภาษา) → รัน **Update visual baselines** หลัง push
- ข้อความ error ของ API ภาษาอังกฤษเป็นแบบกลาง (ด้านบน) · ชื่อหน่วยของนิสัยที่ผู้ใช้สร้างไว้แล้ว (เช่น "แก้ว") ไม่แปล (เป็นข้อมูล)

📚 บท learn 21 (ขั้น 9)

## ขั้น 7 · `deploy-production.yml` จาก tag + rollback — branch `feature/deploy-production`

**เป้าหมาย:** สเปก 13.3 — ขึ้น production จาก tag · อนุมัติด้วยคน · สำรองฐานข้อมูลก่อน · ล้มแล้วย้อนเอง
(เจ้าของเลือก: เขียน workflow รอไว้ สร้างโปรเจกต์ production ทีหลัง)

**สิ่งที่เปลี่ยน**

- 📁 `.github/workflows/deploy-production.yml` — `push: tags v*.*.*` (+ dispatch ด้วย tag) ·
  `check` (tag อยู่บน main + CI ของ commit เขียว — ก่อนขออนุมัติ) → `deploy` (environment `production` · required reviewers) →
  จำ deployment ปัจจุบัน (`vercel list --environment production --format json`) → `pg_dump` เข้ารหัส **age** เป็น artifact 30 วัน →
  migrate (session pooler :5432) → api → web → worker (Fly · ถ้ามี) → smoke → ล้ม = `vercel rollback` + Fly image เดิม + เปิด issue → `release` (GitHub Release)
- 📁 `.github/workflows/rollback-production.yml` — ย้อนด้วยมือ (both/api/web · ระบุ deployment ได้) ต้องอนุมัติเหมือน deploy
- 📁 `scripts/smoke-production.sh` — หน้าแรก · login ภาษาอังกฤษ (ผ่าน rewrite ด้วยคุกกี้) · OpenAPI ผ่าน proxy · `/readyz` · demo login (200/403/429) · refresh ไม่มีคุกกี้ = 401
- 📁 `docs/deploy/production.md` — ตั้งค่าครั้งแรก · environment protection · กุญแจ age · ปล่อยเวอร์ชัน · ย้อน · กู้ข้อมูล

**การตัดสินใจ**

- **deploy ทั้งหมดใน job เดียว** — GitHub ขออนุมัติทุก job ที่อ้าง environment ที่มี reviewer (แยก migrate/deploy/smoke = กดอนุมัติ 4–5 รอบ) ·
  rollback จึงเป็น step `if: failure()` ใน job เดียวกัน (เห็น outcome ของทุก step → ย้อนเฉพาะที่ deploy ไปแล้ว)
- ตรวจ CI + tag ใน job ที่**ไม่**อ้าง environment — tag ผิดถูกปฏิเสธก่อนรบกวนคนอนุมัติ · ใช้ repository variable `PROD_WEB_URL` เป็นสวิตช์ "มี production แล้ว"
- backup เป็น artifact ต้อง**เข้ารหัส** (ใครอ่าน repo ได้ก็โหลด artifact ได้) — age ใช้ public key บน GitHub ส่วนกุญแจถอดอยู่กับเจ้าของ ·
  ไม่มี recipient = ไม่ deploy
- **ไม่ย้อน schema** ตอน rollback — migration additive ตามสเปก 13.4 (ADR ใน ขั้น 9) · กู้ข้อมูลเป็นการตัดสินใจของคน (ลงฐานชั่วคราวก่อน)
- api ก่อน web — api รุ่นใหม่ต้องเข้ากับ web รุ่นเก่าได้ (ช่วงเวลาระหว่างสอง deploy)
- ต่างจากสเปก 13.3 ที่เขียนไว้สำหรับ Fly (`fly pg backup` · `--strategy rolling` ของ API): โครงจริงคือ Vercel + Supabase จึงใช้ `vercel rollback` + `pg_dump`

**วิธีตรวจ**

- `actionlint` 1.7.7 (+ shellcheck ใน run block) ทั้งสอง workflow: ไม่มีข้อผิดพลาด
- smoke script กับ production build ในเครื่อง (web `next start` + proxy → API `NODE_ENV=production`): ผ่านครบ 6 ข้อ
- รูปแบบ JSON ของ `vercel list --format json` (CLI 63.1.0): อ่านจากซอร์สของ CLI — `{ deployments: [{ id, url, state, target }] }`
- ⚠️ **ยังไม่เคยรันจริง** — ไม่มี production · ครั้งแรกให้ลองด้วย tag เช่น `v0.1.0` ตอนโปรเจกต์ production ยังไม่มีผู้ใช้

**ค้าง:** "deployment ปัจจุบัน" = ตัว READY ล่าสุด — ถ้าเคย rollback ด้วยมือไว้ก่อน ตัวที่ใช้งานจริงอาจไม่ใช่ตัวล่าสุด (ควรอ่านจาก alias ของโดเมน — ทำเมื่อมีโดเมนจริง)

📚 บท learn 21 (ขั้น 9)

## ขั้น 8 · ให้คนที่ไม่ใช่ dev ใช้เองได้ + README + C4 — branch `feature/onboarding-docs`

**เป้าหมาย:** DoD ของ Phase 8 — "ส่งลิงก์ให้เพื่อนที่ไม่ใช่ dev แล้วเขาใช้งานได้เองโดยไม่ต้องอธิบาย"

**ไล่ดูจากสายตาคนที่ได้ลิงก์ไป** (ก่อนแก้):

1. หน้าแรกพูดแต่ "โจทย์ทางเทคนิค" (Plugin Architecture · RRULE · DLQ) — คนทั่วไปไม่รู้ว่าแอปนี้ช่วยอะไรเขา
2. สมัครเสร็จเจอหน้าว่าง ไม่มีอะไรบอกว่าเริ่มตรงไหน · ลิงก์ "เพิ่มงานแรก" ในการ์ด Today (`?new=1`) พาไปหน้างานแต่ต้องหาช่องพิมพ์เอง
3. บัญชีทดลองไม่บอกว่าข้อมูลจะหายใน 24 ชม. และไม่มีทางไปสมัครเก็บข้อมูลจริง

**สิ่งที่เปลี่ยน**

- `GET /me/onboarding` — มีงาน / รายจ่าย / นิสัย / เปิดการแจ้งเตือน แล้วหรือยัง (นับจากข้อมูลจริง `findFirst` หยุดที่แถวแรก — ไม่เก็บ flag)
- 📁 `features/today/onboarding-card.tsx` — การ์ด **เริ่มต้นใช้งาน** บนหน้าวันนี้: ขั้นละหนึ่งการกระทำ + ตัวอย่างประโยคที่พิมพ์ได้ ·
  ความคืบหน้า · ซ่อนได้ (จำในเครื่อง) · หายเองเมื่อทำครบ · ขั้นของโมดูลที่ปิดอยู่ไม่แสดง · บัญชีทดลองไม่แสดง (มีข้อมูลแล้ว)
- 📁 `lib/shortcuts/use-focus-new.ts` — `?new=1` โฟกัสช่องบันทึกด่วนให้ทันที (หน้า Tasks · Expenses · Habits เปิดฟอร์มอยู่แล้ว)
- 📁 `components/shell/demo-banner.tsx` — แถบบัญชีทดลอง "ข้อมูลจะถูกลบใน 24 ชั่วโมง" + ลิงก์สมัครฟรี
- หน้าแรก: ส่วน **ทำอะไรได้บ้าง** ด้วยภาษาคนทั่วไป 4 ข้อ (จดเร็วเหมือนแชต · รู้ว่าเงินไปไหน · นิสัย · ทั้งวันในหน้าเดียว) ก่อนส่วนเทคนิค ·
  ใต้ปุ่มทดลอง "ไม่ต้องสมัคร — ได้ข้อมูลตัวอย่างทันที"
- 📁 `docs/diagrams/README.md` — C4 ระดับ Context + Container (Mermaid ใน Markdown — GitHub วาดเอง แก้พร้อมโค้ด) + Component (กฎ lint)
- README: สิ่งที่ใช้ได้ (OAuth · GitHub · Public API · i18n · onboarding) · แผนภาพ · ตาราง Deploy · การทดสอบ (UI สองภาษา · Lighthouse · ตัวตรวจข้อความ) · บท learn 10–21

**การตัดสินใจ**

- ขั้นเสร็จนับจาก**ข้อมูลจริง** ไม่ใช่ "เคยกดแล้ว" — ลบงานทั้งหมดแล้วการ์ดกลับมาแนะนำได้ถูกต้อง · ซ่อนเก็บใน localStorage (เรื่องของเครื่องนี้ ไม่ต้องลง DB)
- ไม่ทำ tour แบบ popup ชี้ทีละปุ่ม — คนข้ามทิ้ง · การ์ดที่พาไปทำของจริงแล้วติ๊กเองสอนได้มากกว่า
- แผนภาพเป็น Mermaid ไม่ใช่ภาพ — render ผ่าน `@mermaid-js/mermaid-cli` ตรวจแล้วว่าวาดได้ (ภาพที่ export แยกจะล้าสมัยเงียบ ๆ)

**วิธีตรวจ**

- integration: บัญชีใหม่ทุกขั้น `false` → สร้างงาน/รายจ่าย/subscribe push แล้วเป็น `true` ทันที → ลบงานแล้วกลับเป็น `false`
- UI (mock): การ์ดแสดง "ทำแล้ว 1 จาก 4" · ลิงก์ "จดรายจ่าย" → `/expenses?new=1` และ**ช่องพิมพ์ถูกโฟกัสแล้ว** · ซ่อนแล้วรีเฟรชไม่กลับมา · axe ผ่าน ·
  `/tasks?new=1` โฟกัสช่องเพิ่มงาน · บัญชีทดลองมีแถบ + ลิงก์ `/register` และไม่มีการ์ด · หน้าแรก axe ผ่าน — UI ทั้งชุด 72 ผ่าน
- **E2E กับ API จริง** (`smoke.spec.ts`): สมัครใหม่ → การ์ด "ทำแล้ว 0 จาก" → กด "เพิ่มงานแรก" → ช่องโฟกัสแล้ว พิมพ์ + Enter → กลับหน้าวันนี้ "ทำแล้ว 1 จาก" — ผ่านในเครื่อง
- mermaid-cli 11.4.2 วาดแผนภาพทั้ง 3 ได้ (README 1 + diagrams 2)

**ค้าง:** วิดีโอสาธิต 2 นาที (เจ้าของอัด) · ให้เพื่อนที่ไม่ใช่ dev ลองจริงแล้วจดว่าติดตรงไหน (DoD วัดด้วยคนจริงได้ดีกว่าเทสต์)

📚 บท learn 21 (ขั้น 9)

## ขั้น 9 · บท learn 21 + ADR-015–019 — branch `feature/learn-adr`

**สิ่งที่เปลี่ยน**

- 📁 `docs/learn/21-phase8-integrations-i18n-and-release.md` — วัดก่อนตั้งเกณฑ์ (ขั้น 1–2) · API key · OAuth + PKCE + การผูกบัญชีด้วยอีเมล ·
  GitHub เป็นเจ้าของตาม "การเปลี่ยน" · webhook จากไบต์ดิบ · i18n ที่ยัง static · production ที่ย้อนเองได้ · onboarding ที่วัดได้ · แบบฝึกหัด 8 ข้อ
- ADR ใหม่ 5 ฉบับ (รวม 17):
  [015](../adr/015-public-api-keys.md) API key ·
  [016](../adr/016-oauth-sign-in.md) OAuth sign-in ·
  [017](../adr/017-github-issues-to-tasks.md) GitHub → งาน ·
  [018](../adr/018-i18n-cookie-rewrite.md) i18n ·
  [019](../adr/019-production-release-and-rollback.md) production release + rollback
- การ์ดบท 21 ใน `docs/learn/index.html` · ตาราง ADR · สถานะ Phase 8 ใน `docs/phases/README.md`

**วิธีตรวจ:** ทุกไฟล์/ฟังก์ชันที่บทอ้าง (📁) มีอยู่จริงตามชื่อ · `pnpm format:check`

## ปิด Phase 8

| ข้อในสเปก                          | ผล                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| axe 0 serious ทั้ง dark/light      | ✅ (+ ภาษาอังกฤษ)                                                                     |
| Visual regression ใน CI            | ✅ 0.2% · ⚠️ ต้องสร้าง baseline ใหม่หลัง push (ข้อความ/ปี พ.ศ. เปลี่ยน)               |
| Lighthouse ≥ 90                    | ✅ ทุกหน้าหลัก มือถือ + desktop                                                       |
| i18n ไทย + อังกฤษ                  | ✅                                                                                    |
| Import CSV / Todoist               | ⏭ เจ้าของสั่งข้าม                                                                     |
| Public API + Swagger + API key     | ✅                                                                                    |
| GitHub integration                 | ✅ + ล็อกอิน Google/GitHub (เพิ่มตามที่เจ้าของขอ) · ⚠️ ยังไม่ได้ลองกับ OAuth app จริง |
| `deploy-production.yml` + rollback | ✅ เขียนแล้ว · ⚠️ ยังไม่เคยรัน (ไม่มีโปรเจกต์ production)                             |
| README + diagram + video           | ✅ README + C4 · ⬜ video (เจ้าของอัด)                                                |
| ADR ≥ 9                            | ✅ 17 ฉบับ                                                                            |
