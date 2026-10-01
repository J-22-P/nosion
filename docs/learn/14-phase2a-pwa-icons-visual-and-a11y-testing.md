# 14 · Phase 2a — ไอคอน PWA, Visual Regression และการทดสอบ Accessibility อัตโนมัติ

> ขั้นสุดท้ายของ Phase 2a (ขั้น 11) ไม่ได้เปลี่ยนหน้าตาอะไรเพิ่ม แต่ตอบคำถามที่สำคัญกว่า:
> **"รู้ได้อย่างไรว่าหน้าตาจะไม่พังเงียบ ๆ ใน Phase ถัดไป"**
>
> บทนี้มีสามเรื่อง: (1) ไอคอนแอปบนมือถือทำงานอย่างไร (2) เทสต์ที่ "ดูภาพ" แทนคน
> (3) เปลี่ยน accessibility จากการ "ตั้งใจดี" เป็นการตรวจอัตโนมัติ — และเรื่องจริงที่เทสต์เจอ
> ว่าค่าสีในสเปกของเราเองไม่ผ่าน

อ่านคู่กับ: 📁 `docs/phases/phase-2a-design-refresh.md` ขั้น 11 · บท [08](./08-testing-and-quality.md) (testing pyramid) · บท [10](./10-phase2a-design-system-and-theming.md) หัวข้อ 7 (สูตร contrast)

---

## 1. ไอคอนแอปและ Web App Manifest

### 1.1 เว็บ "ติดตั้ง" ได้อย่างไร

**PWA (Progressive Web App)** = เว็บที่เพิ่มลงหน้าจอหลักได้และเปิดขึ้นมาเหมือนแอป (ไม่มีแถบ URL)
ต้องมี 3 อย่าง:

| สิ่งที่ต้องมี        | หน้าที่                               | Phase      |
| -------------------- | ------------------------------------- | ---------- |
| **Web App Manifest** | ชื่อ ไอคอน สี หน้าเริ่มต้น โหมดแสดงผล | 2a (บทนี้) |
| **HTTPS**            | ความปลอดภัยขั้นต่ำ                    | deploy     |
| **Service Worker**   | ทำงาน offline, cache                  | 7          |

📁 `apps/web/src/app/manifest.ts` — Next.js แปลงฟังก์ชันนี้เป็น `/manifest.webmanifest` และใส่
`<link rel="manifest">` ให้ทุกหน้าเอง (App Router **file convention**: ชื่อไฟล์พิเศษ = Next จัดการให้)

```ts
{ name: 'NOSION — Workspace OS', short_name: 'NOSION', start_url: '/today',
  display: 'standalone', background_color: '#000000', theme_color: '#000000', icons: [...] }
```

- `display: 'standalone'` = เปิดแบบไม่มี UI ของเบราว์เซอร์
- `start_url: '/today'` = กดไอคอนแล้วไปหน้า Today ไม่ใช่ landing page
- `background_color` = สีของ **splash screen** ที่ระบบแสดงระหว่างรอแอปโหลด

### 1.2 ทำไมต้องมีไอคอนหลายไฟล์

| ไฟล์                                        | ใช้ที่                   | ทำไมแยก                                                                |
| ------------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `app/icon.svg`                              | favicon บนแท็บ           | SVG คมทุกขนาด เบราว์เซอร์ desktop รองรับ                               |
| `public/icons/icon-192.png`, `icon-512.png` | Android / Chrome install | manifest ต้องการ PNG ขนาดตายตัว                                        |
| `public/icons/maskable-512.png`             | Android adaptive icon    | ดูหัวข้อ 1.3                                                           |
| `app/apple-icon.png` (180×180)              | iOS "Add to Home Screen" | **iOS ไม่ใช้ไอคอนใน manifest** อ่านจาก `<link rel="apple-touch-icon">` |

### 1.3 Maskable icon และ safe zone

Android ตัดไอคอนเป็นรูปทรงตามธีมของเครื่อง (วงกลม, squircle, สี่เหลี่ยมมน)
ถ้าส่งไอคอนที่มีมุมมนและขอบไปแล้ว ระบบจะตัดซ้ำ → ได้มุมขาวแปลก ๆ หรือตัวอักษรโดนตัด

กติกาของ **maskable icon**:

1. พื้นหลัง **เต็มกรอบ** ไม่มีมุมมน ไม่มีส่วนโปร่งใส
2. เนื้อหาสำคัญอยู่ใน **safe zone** = วงกลมรัศมี 40% ของความกว้าง จากกึ่งกลาง

📁 `apps/web/scripts/generate-icons.mjs` ย่อตัว N เหลือ 80% (`translate(10 10) scale(0.8)`)
จุดที่ไกลกึ่งกลางที่สุดของตัว N ห่างราว 23% ของความกว้าง → อยู่ในวงกลม 40% สบาย

iOS ตัดมุมมนเองเหมือนกัน → `apple-icon.png` ใช้ภาพแบบเต็มกรอบชุดเดียวกัน

### 1.4 Generate แล้ว commit — ไม่ generate ทุก build

สคริปต์ใช้ **sharp** (library แปลงภาพที่ Next ใช้อยู่แล้ว) render SVG เป็น PNG
ผลลัพธ์ถูก commit เข้า git เพราะเปลี่ยนเฉพาะตอนเปลี่ยนโลโก้ — generate ทุก build = เสียเวลา CI ฟรี ๆ
สคริปต์อยู่ใน repo เพื่อให้ **ทำซ้ำได้** (reproducible): เปลี่ยนโลโก้วันไหนก็รัน `pnpm --filter @nosion/web icons`

⚠️ กับดักที่เจอจริง: สคริปต์เดิมวางที่ `scripts/` ของ root แล้ว `import sharp` ไม่เจอ
เพราะ pnpm แยก `node_modules` ต่อ package (บท 02 หัวข้อ 2) — sharp ติดตั้งให้ `apps/web` เท่านั้น
Node หา package โดยไล่ขึ้นจาก **โฟลเดอร์ของไฟล์** ไม่ใช่จาก cwd → ย้ายสคริปต์ไป `apps/web/scripts/`

---

## 2. Visual regression testing

### 2.1 ปัญหาที่ unit test มองไม่เห็น

unit test ตรวจว่า `buildTaskFilters` คืนค่าถูก แต่ไม่รู้เลยว่า:

- ใครแก้ `rounded-card` แล้วมุมการ์ดหายทั้งแอป (บท 10 หัวข้อ 5)
- ปุ่มในการ์ดงานบนมือถือล้นจอ
- ธีมมืดมีข้อความดำบนพื้นดำ

**Visual regression** = ถ่ายภาพหน้าจอเก็บไว้เป็น **baseline** ครั้งต่อไปถ่ายใหม่แล้วเทียบทีละพิกเซล
ต่างเกินเกณฑ์ = เทสต์ล้ม พร้อมภาพ diff ที่ไฮไลต์จุดเปลี่ยน

### 2.2 ความยากคือทำให้ภาพ "นิ่ง" (deterministic)

ภาพจะเทียบได้ก็ต่อเมื่อทุกอย่างเหมือนเดิมทุกครั้ง แหล่งความไม่นิ่งและวิธีจัดการ:

| สิ่งที่เปลี่ยนเอง            | ผลต่อภาพ                                    | วิธีตรึงในโปรเจกต์                                          |
| ---------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| ข้อมูลจาก API                | งานคนละชุด                                  | **API ปลอม** ด้วย `page.route` (หัวข้อ 2.3)                 |
| เวลาปัจจุบัน                 | "พรุ่งนี้" กลายเป็น "วันนี้", "เลยมา 2 วัน" | `page.clock.setFixedTime(NOW)`                              |
| โซนเวลา/ภาษาของเครื่อง       | วันที่ format ต่างกัน                       | `timezoneId: 'Asia/Bangkok'`, `locale: 'th-TH'` ใน config   |
| animation                    | จับภาพกลางการเคลื่อนไหว                     | `animations: 'disabled'`                                    |
| เคอร์เซอร์กะพริบในช่อง input | ภาพต่างทุกครั้ง                             | `caret: 'hide'`                                             |
| ฟอนต์โหลดไม่ทัน              | ภาพตอนยังเป็นฟอนต์สำรอง                     | รอ `document.fonts.ready`                                   |
| skeleton ยังค้าง             | ภาพตอนกำลังโหลด                             | รอจน `.animate-pulse` หายหมด                                |
| **ระบบปฏิบัติการ**           | anti-aliasing ของฟอนต์ต่างกัน               | สร้าง baseline ใน **Docker image เดียวกับ CI** (หัวข้อ 2.5) |

📁 `apps/web/e2e/support/ui-test.ts` รวมทั้งหมดไว้ใน **fixture** ที่ทำงานอัตโนมัติ (`{ auto: true }`)
ทุกเทสต์ในไฟล์ visual/a11y ได้สภาพแวดล้อมเดียวกันโดยไม่ต้องเขียนซ้ำ

### 2.3 API ปลอมด้วย `page.route`

📁 `apps/web/e2e/support/mock-api.ts`

```ts
await page.route('**/api/v1/**', async (route) => {
  const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, '');
  if (method === 'POST' && path === '/auth/refresh') return json({ accessToken: 'test', … });
  if (method === 'GET'  && path === '/tasks/sidebar') return json(SIDEBAR);
  …
  console.warn(`[mock-api] ไม่มี mock สำหรับ ${method} ${path}`);
  return json({ … }, 404);
});
```

`page.route` ดักคำขอ **ภายในเบราว์เซอร์** ก่อนออกไปที่ network → web ไม่รู้ด้วยซ้ำว่าไม่ได้คุยกับ API จริง

เทียบกับทางอื่น:

| ทาง                                        | ข้อดี                         | ข้อเสีย                                    |
| ------------------------------------------ | ----------------------------- | ------------------------------------------ |
| ใช้ API + DB จริง + seed                   | สมจริงที่สุด                  | ช้า, ต้องยก Postgres/Redis, ข้อมูลขยับได้  |
| **mock ที่ระดับ network ในเบราว์เซอร์**    | เร็ว, นิ่ง, ไม่ต้องมี backend | ถ้า API จริงเปลี่ยนรูปร่าง mock อาจล้าสมัย |
| mock ที่ระดับ component (MSW ใน unit test) | เร็วที่สุด                    | ไม่ได้ render หน้าจริงทั้งหน้า             |

ข้อเสียของทางที่เลือกถูกปิดด้วย **type**: 📁 `e2e/support/mock-data.ts` ประกาศ
`const SIDEBAR: TaskSidebarDto = …` — DTO ใน `packages/contracts` เปลี่ยนเมื่อไร `tsc` ของ e2e ฟ้องทันที
(นี่คือเหตุผลที่เพิ่ม `tsc -p e2e/tsconfig.json` เข้า `typecheck`)

และโปรเจกต์ยังมี project `smoke` ที่ใช้ API จริงแยกไว้ — สองชั้นนี้ตรวจคนละเรื่อง

### 2.4 ข้อมูล mock ใช้ชุดเดียวกับ mockup

งาน "Re-architect Auth Token refresh flow" + PR #104 + Subtasks 4/5 + "เลื่อนแล้ว 2 ครั้ง" + Focus 2h 45m
มาจาก mockup ของสเปก 8.11 — เปิดภาพ baseline คู่กับ mockup แล้วเทียบด้วยตาได้ทันที

ข้อมูลยังตั้งใจให้ **ครอบทุกสถานะที่หน้าแสดง**: งานเลยกำหนด (badge แดง), ไม่มีกำหนด (Inbox),
มี checklist, มี PR, deferCount ≥ 3 (สีเตือน), ไม่มีโปรเจกต์, งานเสร็จแล้ว

### 2.5 ทำไม baseline ต้องสร้างใน Docker

ฟอนต์เดียวกัน ขนาดเดียวกัน แต่ macOS กับ Linux วาดขอบตัวอักษรต่างกัน (hinting / sub-pixel anti-aliasing)
ภาพจาก Mac เทียบกับ CI (Linux) จะต่างหลายพันพิกเซลทั้งที่หน้าตาเหมือนกัน

ทางแก้: สร้าง baseline **ในสภาพแวดล้อมเดียวกับ CI เป๊ะ** — image `mcr.microsoft.com/playwright:v1.63.0-noble`
📁 `apps/web/scripts/playwright-docker.sh`:

```bash
docker run -v "$ROOT":/src:ro -v "$SHOTS":/out  mcr.microsoft.com/playwright:v${PW_VERSION}-noble  bash -c '
  tar … /src → /work   # คัดลอกซอร์สเข้า container (ไม่เอา node_modules)
  pnpm install && pnpm build && playwright test --project=ui --update-snapshots
  cp __screenshots__ → /out'
```

⚠️ ทำไมไม่ bind-mount ทั้ง repo แล้วรันเลย: `pnpm install` ใน Linux จะเขียน `node_modules` ทับของ macOS
(native binary อย่าง esbuild, sharp เป็นคนละสถาปัตยกรรม) → หลังรันเสร็จ `pnpm dev` บน Mac พัง
จึง mount repo แบบ **read-only** และเขียนกลับเฉพาะโฟลเดอร์ภาพ

`snapshotPathTemplate` ใส่ `{platform}` ในชื่อไฟล์ (`tasks-dark-mobile-linux.png`) —
ถ้าใครรันบน Mac จะได้ไฟล์ `-darwin` แยก ไม่ทับ baseline ของ CI

⚠️ ผลข้างเคียง: `pnpm --filter @nosion/web test:ui` บน Mac ทำให้ **visual 8 เทสต์ล้มเสมอ** ("snapshot doesn't exist … writing actual")
และทิ้งไฟล์ `-darwin.png` ไว้ในโฟลเดอร์ baseline — เป็นพฤติกรรมที่ตั้งใจ ใช้บน Mac เพื่อดูผล **axe** เท่านั้น
แล้วลบไฟล์ `-darwin` ทิ้ง อย่า commit

⚠️ Mac รุ่น Apple Silicon รัน Docker เป็น `arm64` ส่วน runner ของ CI เป็น `amd64` — image เดียวกันแต่คนละสถาปัตยกรรม
ภาพมักออกมาเหมือนกัน แต่ถ้า CI ล้มด้วย diff เล็ก ๆ ทั้งที่หน้าไม่เปลี่ยน ให้ใช้ภาพจาก artifact `ui-screenshots` ของ CI แทน

### 2.6 เกณฑ์ "ต่างแค่ไหนถือว่าเปลี่ยน"

`maxDiffPixelRatio: 0.01` — ยอมให้ต่างได้ 1% ของพิกเซล
ตั้ง 0 = ล้มจากการ anti-alias คลาดเล็กน้อยจน flaky (บท 08) · ตั้งสูงเกิน = ปุ่มหายทั้งปุ่มก็ไม่ล้ม

### 2.7 วงจรชีวิตของ baseline

```
ครั้งแรก    CI รัน --update-snapshots=missing → เขียนภาพที่ยังไม่มี (แต่เทสต์ยังล้ม = job แดง) → อัปโหลด artifact "ui-screenshots"
            → คนดาวน์โหลด ตรวจด้วยตา → commit เข้า apps/web/e2e/__screenshots__/
ปกติ       CI เทียบกับภาพที่ commit ไว้ → ต่าง > 1% = ล้ม + artifact "playwright-report" มีภาพ diff
ตั้งใจเปลี่ยน  รัน test:ui:docker สร้างภาพใหม่ → ตรวจ diff ใน PR → commit พร้อมโค้ดที่ทำให้เปลี่ยน
```

📌 **คนต้องดูภาพเสมอ** — เครื่องบอกได้แค่ว่า "ต่าง" ไม่ได้บอกว่า "ถูก"
การกด update โดยไม่ดูภาพ = ยอมรับ bug เป็น baseline ใหม่

⚠️ **`--update-snapshots` มี 4 โหมด** และค่าเริ่มต้นไม่ใช่ "ทั้งหมด":

| โหมด                    | เขียนภาพเมื่อ                                          |
| ----------------------- | ------------------------------------------------------ |
| `none`                  | ไม่เขียนเลย                                            |
| `missing`               | ยังไม่มีภาพ (CI ใช้ตัวนี้) — เขียนแล้ว **เทสต์ยังล้ม** |
| `changed` (ค่าเริ่มต้น) | ต่างจากเดิม **เกินเกณฑ์** `maxDiffPixelRatio`          |
| `all`                   | ทุกภาพ                                                 |

เรื่องจริงในขั้น 12: แก้สีลิงก์ login จากน้ำเงินจางเป็นน้ำเงินทึบ แล้วรัน `--update-snapshots` — ลิงก์ทั้งเส้นต่างไม่ถึง 1% ของภาพ
→ `changed` มองว่า "ไม่เปลี่ยน" และ **เก็บภาพเก่า (ที่มีบั๊ก) ไว้เงียบ ๆ** ทั้งที่ axe รอบเดียวกันผ่านแล้ว
จับได้เพราะเปิดดูภาพจริง · สคริปต์จึงใช้ `=all`

เรื่องนี้ชี้ข้อจำกัดของเกณฑ์ 1% ด้วย: **visual test จับ "เลย์เอาต์พัง" ได้ดี แต่จับ "สีเพี้ยนในจุดเล็ก ๆ" ไม่ได้**
งานนั้นเป็นของ `tokens.test.ts` + axe (หัวข้อ 4)

---

## 3. Accessibility อัตโนมัติด้วย axe

### 3.1 axe-core คืออะไร

library ที่รันใน DOM จริงแล้วตรวจกฎ WCAG ~90 ข้อ เช่น contrast, ปุ่มไม่มีชื่อ, role ผิด, id ซ้ำ,
`aria-*` ที่ไม่มีอยู่จริง, ลำดับ heading · `@axe-core/playwright` ต่อ axe เข้ากับหน้าที่ Playwright เปิดอยู่

📁 `apps/web/e2e/a11y.spec.ts`

```ts
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']) // เฉพาะกฎที่ตรงเป้า WCAG 2.1 AA
  .analyze();
const blocking = results.violations.filter(
  (v) => v.impact === 'serious' || v.impact === 'critical',
);
expect(blocking).toEqual([]);
```

- รันทุกหน้า **ทั้งสองธีม** — contrast ที่ผ่านในธีมสว่างอาจตกในธีมมืด
- ล้มเฉพาะ `serious/critical` (ตาม DoD ของ Phase 2) · ทุกผลแนบเป็น attachment ให้ตามแก้ระดับที่ต่ำกว่า
- `expect(blocking).toEqual([])` แทน `toHaveLength(0)` — ตอนล้ม Playwright พิมพ์ทั้ง array ออกมา
  เห็นทันทีว่ากฎไหน element ไหน ไม่ต้องเปิด report

### 3.2 axe ทำอะไรไม่ได้

axe จับได้ราว 30–40% ของปัญหา a11y (บท 11 หัวข้อ 8) — ไม่รู้ว่า:
ลำดับ focus สมเหตุสมผลไหม, ปิดเมนูแล้วโฟกัสไปไหน, ข้อความที่ screen reader อ่านเข้าใจได้ไหม
ยังต้องลองด้วยคีย์บอร์ด + VoiceOver เอง

---

## 4. เรื่องจริง: เทสต์พบว่าสีในสเปกของเราเองไม่ผ่าน

### 4.1 ทำนายก่อนรัน

ก่อนเปิด axe ครั้งแรก เราไล่ดูว่ามีจุดไหน "น่าจะ" ตก แล้วพบว่าต้องคำนวณจริงเพราะมีคู่สีเยอะเกินจะไล่ด้วยตา
→ เขียนตัวคำนวณ contrast (บท 10 หัวข้อ 7.2) เป็นโค้ด แล้วไล่ทุกคู่ token × พื้นหลัง

### 4.2 สิ่งที่เจอ

| คู่สี (ธีมสว่าง)                              | ได้  | เกณฑ์  |
| --------------------------------------------- | ---- | ------ |
| accent `#0071e3` บนพื้น `#f5f5f7`             | 4.31 | ❌ 4.5 |
| success `#248a3d` บนพื้น `#f5f5f7`            | 4.04 | ❌     |
| danger `#d70015` บน danger-soft ทับแถว        | 4.35 | ❌     |
| accent บน accent-soft                         | 3.68 | ❌     |
| text-tertiary `#86868b` (ชื่องานที่เสร็จแล้ว) | 3.33 | ❌     |

ธีมมืด: danger `#ff453a` บน danger-soft ทับแถว = 4.17 · accent บน accent-soft ทับแถว = 4.49

สเปกเขียนไว้ว่า "ตรวจ contrast แล้ว" — ตรวจจริง แต่ตรวจ **ข้อความบนการ์ดขาว** อย่างเดียว
ไม่ได้ตรวจกรณี **สีโปร่งซ้อนกันสองชั้น** (badge `danger-soft` วางบนแถว `surface-sunken` วางบนการ์ด)
ซึ่งเป็นกรณีที่พบบ่อยที่สุดในหน้า Tasks

### 4.3 สีโปร่งซ้อนกันคำนวณอย่างไร (alpha compositing)

```
ผลลัพธ์ = สีบน × alpha + สีล่าง × (1 − alpha)
danger-soft rgba(255,59,48, .10) ทับ #f5f5f7
  R = 255×.1 + 245×.9 = 246
  G =  59×.1 + 245×.9 = 226.4
  B =  48×.1 + 247×.9 = 227.1   → พื้นชมพูอ่อนที่ตาเห็นจริง
```

📁 `packages/ui/src/contrast.ts` → `composite()` ทำสิ่งนี้ แล้วค่อยคำนวณ contrast กับสีทึบที่ได้

### 4.4 แก้อย่างไร — ปรับน้อยที่สุด

ไม่เปลี่ยนโทนสี แค่ **เลื่อนความเข้ม** ทีละ 0.5% จนผ่าน 4.5 บนพื้นที่แย่ที่สุด (เหลือเผื่อ ~0.1):

| token                            | สเปก                              | ใช้จริง                           |
| -------------------------------- | --------------------------------- | --------------------------------- |
| light accent                     | `#0071e3`                         | `#0062c5`                         |
| light danger / warning / success | `#d70015` / `#b25000` / `#248a3d` | `#cf0014` / `#ac4d00` / `#1f7835` |
| dark accent / danger             | `#2997ff` / `#ff453a`             | `#2e9aff` / `#ff5950`             |

text-tertiary ไม่แก้ค่า แต่ **เลิกใช้กับข้อความขนาดปกติ** (บทบาทตามสเปกคือของตกแต่งอยู่แล้ว)
ชื่องานที่เสร็จแล้วใช้ `text-secondary` + ขีดฆ่าแทน — บันทึกใน ADR-009

### 4.5 เปลี่ยนการตรวจครั้งเดียวให้เป็นเทสต์ถาวร

📁 `packages/ui/src/tokens.test.ts` — อ่าน `tokens.css` จริง แยกสองธีม แล้วตรวจ 67 คู่ (79 หลังหัวข้อ 4.6):

- ข้อความทุกสี (primary, secondary, accent, danger, warning, success) × พื้นทุกชั้น (canvas, surface, sunken) ≥ 4.5
- สีบน `*-soft` ที่ทับพื้นทุกชั้น ≥ 4.5
- primary / secondary บน `hover-wash` ที่ทับพื้นทุกชั้น ≥ 4.5 (เพิ่มในหัวข้อ 4.6)
- ปุ่มหลัก ≥ 4.5 · tertiary ≥ 3 เฉพาะบน canvas (ข้อความใหญ่)

ผลคือ **contrast กลายเป็นคุณสมบัติของ token** ไม่ใช่ของหน้าจอ:
ใครแก้สีใน `tokens.css` แล้วตก AA → unit test แดงภายใน 1 วินาที ก่อนจะถึงขั้น e2e ด้วยซ้ำ

| ชั้นการตรวจ      | จับอะไร                                       | เร็วแค่ไหน |
| ---------------- | --------------------------------------------- | ---------- |
| `tokens.test.ts` | ทุกคู่สีที่ระบบอนุญาต                         | ~20 ms     |
| axe ใน e2e       | สีที่ถูกใช้จริงในหน้าที่เปิด + role/ชื่อ/ARIA | ~นาที      |
| คน + VoiceOver   | ความเข้าใจ, ลำดับ, focus                      | ชั่วโมง    |

🎤 _"เล่าครั้งที่เทสต์เจอปัญหาที่คุณไม่คาดคิด"_ → เรื่องนี้: สเปกบอกว่าผ่าน, ตรวจด้วยตาก็ดูอ่านได้,
แต่พอคำนวณกรณีสีโปร่งซ้อนกันกลับตก 6 คู่ — และสิ่งที่ทำต่อคือทำให้มันเป็นเทสต์ ไม่ใช่แค่แก้ครั้งเดียว

### 4.6 รันจริงครั้งแรก: axe ยังเจอ 4 จุดที่ `tokens.test.ts` มองไม่เห็น

หลัง 4.5 เราคิดว่า contrast "ปิดงานแล้ว" — แต่ axe รอบแรกบนเครื่องจริงล้ม **10/10 หน้า**
ทุกจุดเป็นกฎ `color-contrast` และแต่ละจุดสอนคนละเรื่อง:

**(ก) บั๊กอยู่ในชั้น mapping ไม่ใช่ในค่าสี** — ลิงก์ "สมัครสมาชิก" ได้ 1.17 : 1

```css
/* globals.css — ผิด */
--color-accent: var(--accent-soft); /* text-accent = น้ำเงินโปร่ง 12% */
```

token `--accent` ถูกต้อง เทสต์ผ่าน แต่ **utility `text-accent` ชี้ผิดตัว** — เกิดตอนเปลี่ยนชื่อ variable แบบกลไก
(ใน shadcn เดิม `--accent` คือ "พื้นอ่อน" ส่วนในระบบใหม่คือ "น้ำเงินทึบ" — ชื่อเดียวกัน ความหมายคนละอย่าง)
`:focus-visible` โดนแบบเดียวกัน → วง focus แทบมองไม่เห็น (axe ไม่ตรวจ focus ring เพราะต้องกด Tab ก่อน)

📌 เทสต์แต่ละชั้นเห็นแค่ชั้นของตัวเอง: `tokens.test.ts` อ่าน `tokens.css` · axe เห็นสีที่ **คำนวณเสร็จแล้ว** ในเบราว์เซอร์
บั๊กที่อยู่ระหว่างสองชั้น (การ map ชื่อ) จึงหลุด unit test แต่ไม่หลุด axe

**(ข) คู่สีที่ไม่ได้อยู่ในรายการ** — kbd `⌘K`, status pill, input วันที่ ใช้ `text-fg-secondary` บน `bg-wash`
ได้ 4.0–4.3 : 1 · เทสต์ตรวจ secondary บนพื้น **ทึบ** แต่ไม่เคยตรวจบน hover-wash (โปร่ง 3.5% / 6%)
→ เพิ่มคู่ "ข้อความ × hover-wash ทับพื้นทุกชั้น" แล้วเลื่อน secondary: light `#6e6e73 → #6a6a6f` · dark `#86868b → #909095`

**(ค) ทศนิยม vs จอจริง** — ค่าแรกที่คำนวณได้ (`#6b6b70`) ผ่านเทสต์ที่ 4.51 แต่ axe วัดได้ **4.49**

```
hover-wash rgba(0,0,0,.035) ทับ #f5f5f7 → R = 245 × .965 = 236.43
เทสต์ (float)    ใช้ 236.43           → 4.51 ✅
เบราว์เซอร์     วาดลงจอเป็น 236 (8 บิต) → 4.49 ❌  ← axe อ่านค่านี้
```

ส่วนต่าง 0.02 ฟังดูไม่สำคัญ แต่เกณฑ์ 4.5 เป็นเส้นตรง ไม่มี "เกือบผ่าน"
→ เทสต์ปัด composite เป็น 8 บิต (`onScreen()`) ให้ได้ตัวเลขเดียวกับที่จอแสดงและ axe วัด

📌 เมื่อเทสต์จำลองระบบจริง ให้จำลอง **ข้อจำกัด** ของระบบนั้นด้วย (ความละเอียด, การปัดเศษ) ไม่ใช่แค่สูตร

**(ง) ไม่ใช่ a11y แต่เจอรอบเดียวกัน — strict mode ของ Playwright**
การ์ด Focus อยู่ใน DOM สองชุด (มือถือ `lg:hidden` / desktop ใน sidebar) → `getByText('2h 45m')` เจอ 2 ตัว
locator ของ Playwright เป็น **strict**: ถ้าเจอเกิน 1 ตัวจะล้มทันที แทนที่จะเดาว่าคุณหมายถึงตัวไหน
ทางแก้ที่ตรงความหมาย: `.filter({ visible: true })` — "ตัวที่ผู้ใช้เห็น" ไม่ใช่ `.first()` ที่ขึ้นกับลำดับใน DOM

| ชั้นการตรวจ      | จุดบอดที่เจอในรอบนี้                                    |
| ---------------- | ------------------------------------------------------- |
| `tokens.test.ts` | ไม่เห็นการ map ชื่อใน `globals.css` · ไม่รู้ว่าจอปัดเศษ |
| axe              | ไม่เห็น hover / focus (สถานะที่ต้องมีการกระทำก่อน)      |
| คนดูด้วยตา       | ไม่เห็นตัวเลข 4.49 vs 4.51                              |

---

## 5. CI job "UI · visual + a11y"

📁 `.github/workflows/ci.yml`

```yaml
ui:
  needs: [lint, unit]
  container: { image: mcr.microsoft.com/playwright:v1.63.0-noble }
  steps:
    - build web
    - playwright test --project=ui --update-snapshots=missing
    - upload artifact ui-screenshots        (always)
    - upload artifact playwright-report     (failure)
```

- **รันใน container** แทนติดตั้ง browser บน runner — ได้เวอร์ชัน browser + ฟอนต์ระบบตรงกับ baseline
- `needs: [lint, unit]` — ถ้าโค้ดยัง typecheck ไม่ผ่าน ไม่ต้องเสียเวลา build + เปิด browser
- ไม่ต้องมี Postgres/Redis (API ปลอม) → job นี้เบากว่า integration มาก
- `webServer` ใน config รัน `pnpm start` เองแล้วรอจน URL ตอบ

---

## ข้อเสียที่ยอมรับ

- ยังไม่มี service worker → บางเบราว์เซอร์ยังไม่เสนอปุ่ม Install (Phase 7)
- baseline ครั้งแรกต้องมีคนดาวน์โหลดจาก artifact แล้ว commit เอง (ไม่ให้ CI commit เข้า repo อัตโนมัติ —
  ภาพที่ไม่มีใครดูไม่ควรกลายเป็น "ความจริง")
- mock API อาจเพี้ยนจาก API จริงในรายละเอียดที่ type จับไม่ได้ (เช่น ลำดับการเรียง) — smoke test ยังจำเป็น
- ปรับสีจากสเปก 6 ค่า → ภาพต่างจาก mockup เล็กน้อยโดยตั้งใจ

---

## แบบฝึกหัดท้ายบท

1. เปลี่ยน `--danger` ธีมสว่างกลับเป็น `#d70015` แล้วรัน `pnpm --filter @nosion/ui test` — กี่เคสล้ม และล้มบนพื้นไหน
2. ลบ `page.clock.setFixedTime(NOW)` ออกจาก fixture แล้วคิดว่าภาพ Tasks จะเปลี่ยนเมื่อไร (ข้อความ "เลยมา … วัน")
3. ใน mock-data เปลี่ยน `smartLists` ให้ขาด field `inbox` — อะไรเตือนก่อน: typecheck หรือเทสต์?
4. เปิด `maskable-512.png` ใน [maskable.app](https://maskable.app) แล้วลองทุกรูปทรง — ตัว N โดนตัดไหม? ถ้าไม่ย่อ 80% ล่ะ
5. ทำไม `a11y.spec.ts` ต้องรันซ้ำทั้งสองธีม ทั้งที่ HTML ของสองธีมเหมือนกันทุกตัวอักษร?
6. ใน `globals.css` เปลี่ยน `--color-accent` กลับเป็น `var(--accent-soft)` — `pnpm --filter @nosion/ui test` ล้มไหม?
   แล้ว `test:ui` ล้มที่หน้าไหน · ถ้าอยากให้บั๊กแบบนี้ถูกจับตั้งแต่ unit test ต้องเขียนเทสต์อ่านไฟล์ไหน (หัวข้อ 4.6 ก)
7. ใน `tokens.test.ts` เปลี่ยน `onScreen()` ให้คืนค่า `composite()` ตรง ๆ (ไม่ปัด) แล้วตั้ง light secondary เป็น `#6b6b70`
   — เทสต์ผ่านหรือล้ม? axe ล่ะ? (หัวข้อ 4.6 ค)
