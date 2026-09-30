# Phase 2a · Design Refresh (สัปดาห์ 6)

> เป้าหมาย: เปลี่ยนหน้าตาทั้งแอปจากธีม indigo ของ Phase 1 เป็น **Monochrome + Apple Blue**
> สองธีมเท่ากัน (dark / light) ตาม mockup v1.1 — สเปก 8.2, 8.7, 8.11.2
> ความรู้เบื้องหลัง: [`learn/10`](../learn/10-phase2a-design-system-and-ui.md) · เหตุผล: [ADR-009](../adr/009-monochrome-design-system-dual-theme.md)

## ภาพรวมความคืบหน้า

| #   | ขั้น                                                    | Commit         | สถานะ |
| --- | ------------------------------------------------------- | -------------- | ----- |
| 1   | Contracts: habit payload v1.1                           | `3e8b928`      | ✅    |
| 2   | Design token + ฟอนต์                                    | `e3b8067`      | ✅    |
| 3   | UI primitives + theme switcher                          | `6e4c09e`      | ✅    |
| 4   | App shell                                               | `1cff933`      | ✅    |
| 5   | Restyle Tasks + Login/Register                          | `2a133e7`      | ✅    |
| 6   | เอกสาร Phase 2a + ADR-009                               | _(commit นี้)_ | ✅    |
| 7   | API: `GET /tasks/sidebar`                               | —              | ⏳    |
| 8   | API: Focus timer + `GET /tasks/focus/today`             | —              | ⏳    |
| 9   | Web: ตัวเลข smart list, Inbox, การ์ด Focus, ปุ่มจับเวลา | —              | ⏳    |
| 10  | PWA icon, Playwright screenshot baseline                | —              | ⏳    |

---

## ขั้น 1 · Contracts: habit payload v1.1 — `3e8b928`

**เป้าหมาย:** ให้ widget นิสัยในหน้า Today (Phase 2b) render ได้ 3 แบบตาม mockup
โดยยังไม่ทำ HabitModule เต็ม

**สิ่งที่เปลี่ยน**

- 📁 `packages/contracts/src/payloads.ts`
  - `habitKindSchema = count | check | before_time` (ค่าเริ่มต้น `check`)
  - เพิ่ม `unitConversion`, `deadlineLocalTime`, `subtitle`
  - `isHabitComplete()` — กฎ "ครบเป้า" ที่เดียว ให้ทั้ง widget และ streak ใช้ร่วมกัน
  - workout เพิ่ม `splitLabel` ("Day A") และ `templateId`
- 📁 `packages/contracts/src/entry.test.ts` — เทสต์ใหม่ 6 เคส

**การตัดสินใจ**

- `before_time` ต้องมี `deadlineLocalTime` (ตามสเปก) และ **เพิ่มเอง:** `weekly` ต้องมี `weeklyTarget`
- ตรวจเวลาเป็น `00:00–23:59` จริง แทน `\d{2}:\d{2}` ของสเปก เพราะ `25:99` จะหลุดเข้า JSONB ได้
- payload เก่าที่ไม่มี `kind` ยัง parse ผ่าน (ได้ `check`) → ไม่ต้อง migrate ข้อมูล

**วิธีตรวจ:** unit test contracts 16/16 ผ่าน · typecheck · lint · build

---

## ขั้น 2 · Design token + ฟอนต์ — `e3b8067`

**เป้าหมาย:** แหล่งความจริงเดียวของสี/มุม/เงา ทั้งสองธีม

**สิ่งที่เปลี่ยน**

- 📁 `packages/ui/src/tokens.css` — เขียนใหม่ทั้งไฟล์ตาม 8.7.2 (light = Precision OS, dark = Monochrome Studio OS)
- 📁 `apps/web/src/app/globals.css` — map token เข้า Tailwind: `bg-surface`, `bg-sunken`, `text-fg-secondary`,
  `border-hairline`, `rounded-card`, `shadow-float` ฯลฯ + utility `glass`, `nums`, `tracking-display`
- 📁 `apps/web/src/app/layout.tsx` — Inter + IBM Plex Sans Thai + JetBrains Mono ผ่าน `next/font`
- 📁 `packages/ui/src/module-theme.ts` — ตัดสีรุ้งประจำโมดูล เหลือ ไอคอน + prefix (`T:` `E:` `W:` `H:`)
- เปลี่ยนชื่อ CSS variable เดิมทั้งแอปแบบกลไก เพื่อให้ commit นี้ build ผ่านได้ด้วยตัวเอง

**การตัดสินใจ**

- ค่าที่ mockup ใช้แล้ว contrast ไม่ผ่าน AA ใช้ค่าจากสเปกแทน (`--text-secondary` light, `--accent` dark)
- `--radius-card` ฯลฯ ใช้ชื่อเดียวกันทั้งใน token และ Tailwind theme — Tailwind จะปล่อย
  `--radius-card: var(--radius-card)` ไว้ใน `@layer theme` แต่ `tokens.css` เป็น unlayered จึงชนะเสมอ
  (ตรวจแล้วใน CSS ที่ build ออกมา) · **ห้ามย้าย tokens.css เข้า `@layer`**
- glass มี fallback พื้นทึบเมื่อไม่รองรับ `backdrop-filter` หรือผู้ใช้เปิด reduced transparency

**วิธีตรวจ:** typecheck · lint · `next build` · เปิด CSS ที่ build แล้วตรวจลำดับ layer ของ token

---

## ขั้น 3 · UI primitives — `6e4c09e`

**สิ่งที่เปลี่ยน** — 📁 `apps/web/src/components/ui/`

| Component                       | จุดสำคัญ                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `Button`                        | primary / secondary / ghost / danger · shape control / pill / circle · `active:scale(.98)` |
| `Badge`, `Chip`                 | Badge แสดงผลอย่างเดียว · Chip กดได้ (`aria-pressed`)                                       |
| `Card`, `CardHeader`, `ListRow` | header = icon box 40px + ชื่อ + คำอธิบาย + aside                                           |
| `Checkbox`                      | วงกลม (task) / มน 5px (habit) · `role="checkbox"` · พื้นที่กด ≥ 24px                       |
| `Progress`, `ProgressRing`      | กฎสีงบ ≥85% เตือน ≥100% เกิน อยู่ใน `lib/progress.ts` (มี unit test)                       |
| `SegmentedControl`              | ARIA radiogroup · ลูกศร / Home / End                                                       |
| `Kbd`, `StatusPill`, `Alert`    | ตาม 8.7.5                                                                                  |
| `ThemeSwitcher`                 | system / light / dark ในหน้าตั้งค่า                                                        |

**การตัดสินใจ**

- priority ไม่ใช้สีรุ้งแล้ว → `PRIORITY_TONE` (urgent แดง, high ทึบ, medium/low outline)
- ยังไม่ใส่ framer-motion (สเปกให้ใช้ spring กับ segmented) — ใช้ CSS transition 180ms ไปก่อน ไม่เพิ่ม bundle
- ไม่มี flash ตอนโหลดธีม เพราะ `next-themes` ฉีด script อ่านค่าก่อน hydrate อยู่แล้ว

**วิธีตรวจ:** unit test `progress` · typecheck · lint · build

---

## ขั้น 4 · App shell — `1cff933`

**สิ่งที่เปลี่ยน** — 📁 `apps/web/src/components/shell/` (ย้ายจาก `components/shared/app-shell.tsx`)

- `sidebar.tsx` — 260px (≥1024) / rail 72px (768–1023 หรือเมื่อยุบ) · ยุบด้วยปุ่มหรือ `[`
- `top-bar.tsx` — glass sticky · ปุ่มเปิด ⌘K · Connection pill · กระดิ่ง · `ProfileMenu`
- `mobile-tab-bar.tsx` — 5 ช่อง วันนี้·งาน·การเงิน·ปฏิทิน·สรุป · safe-area
- `hub-view.tsx` + `app/(app)/hub/page.tsx` — หน้า "สรุป" รวมโมดูลที่เปิดน้อย
- `nav.ts` — config เมนูที่เดียว · `logo.tsx` + `app/icon.svg`
- 📁 `lib/stores/ui-store.ts` — Zustand persist (จำสถานะ sidebar) · 📁 `lib/use-online-status.ts`

**การตัดสินใจ**

- หน้าที่ยังไม่มี (การเงิน, ปฏิทิน ฯลฯ) แสดงเป็น "เร็ว ๆ นี้" แทนลิงก์ที่ 404
- ⌘K ยังไม่มี (Phase 5) → กดแล้วมี toast บอก ดีกว่ากดแล้วเงียบ
- Connection pill ใช้ `navigator.onLine` ไปก่อน — Phase 7 ผูกกับ outbox
- ชื่อเมนูใน rail เป็น `sr-only` ไม่ใช่ลบทิ้ง → screen reader ยังอ่านชื่อได้

**วิธีตรวจ:** typecheck · lint · build

---

## ขั้น 5 · Restyle Tasks + Login/Register — `2a133e7`

**สิ่งที่เปลี่ยน** — 📁 `apps/web/src/features/tasks/`

| ไฟล์                      | หน้าที่                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `use-task-view.ts`        | state ของหน้าอยู่ใน URL `?view=&list=&q=` · `buildTaskFilters()` เป็น pure function มีเทสต์ |
| `quick-capture-parser.ts` | regex `!priority #tag +project` รองรับคำไทย · มีเทสต์ 7 เคส                                 |
| `quick-capture.tsx`       | แถบเพิ่มงาน + chip "PARSED" ลบได้ · สร้างแท็ก/โปรเจกต์ที่ยังไม่มีให้ตอนบันทึก               |
| `task-card.tsx`           | การ์ดใหม่ตาม 8.11.2                                                                         |
| `task-board.tsx`          | จัดกลุ่มตาม view + กลุ่ม "เสร็จสิ้นแล้ว" + toast "เลิกทำ"                                   |
| `task-sidebar.tsx`        | smart list / โปรเจกต์ / แท็ก · มือถือเป็นแถบเลื่อน                                          |

- 📁 `components/ui/menu.tsx` — เมนู ⋯ (ARIA menu button)
- Login/Register: layout ใหม่พร้อมโลโก้ การ์ด hero และ `aria-invalid`
- e2e smoke ปรับตามปุ่ม "สร้างงาน"

**การตัดสินใจ**

- ไม่ติดตั้ง `nuqs` (สเปก 8.5) — ใช้ `useSearchParams` + `router.replace` ห่อใน hook เดียว เปลี่ยนภายหลังได้ที่เดียว
- Undo ใช้ `PATCH status=pending` พร้อม `version` ไม่ใช่ audit-log undo (ยังไม่มี endpoint)
- "วันนี้" รวมงานที่เลยกำหนดด้วย — เพราะยังต้องทำอยู่ดี

**วิธีตรวจ:** unit test web ทั้งหมดผ่าน · typecheck · lint · prettier · build (`/tasks` first load 164 kB < งบ 180 kB)

---

## ขั้น 6 · เอกสาร Phase 2a

- 📁 `docs/phases/` (ไฟล์นี้ + README + สรุป Phase 0–1)
- 📁 `docs/learn/10-phase2a-design-system-and-ui.md`
- 📁 `docs/adr/009-monochrome-design-system-dual-theme.md`
- อัปเดตสารบัญ `learn/00`, `learn/index.html`, `adr/README.md` และ path ที่ย้ายใน `learn/07`

---

## ขั้น 7 · API: `GET /tasks/sidebar` — `cca6648`

**เป้าหมาย:** ตัวเลขทุกอย่างใน sidebar หน้า Tasks ในคำขอเดียว (สเปก 7.3, 8.11.2)

**สิ่งที่เปลี่ยน**

- 📁 `apps/api/src/modules/task/`
  - `tasks.controller.ts` — `@Controller('tasks')` endpoint เฉพาะโมดูล (CRUD ยังอยู่ที่ `/entries`)
  - `task-stats.service.ts` — 8 query ขนานกันด้วย `Promise.all` + `buildSidebar()` pure function
  - `task-ranges.ts` — ขอบ "วันนี้" / "7 วัน" ตามโซนเวลาผู้ใช้
- 📁 `packages/contracts/src/tasks.ts` — DTO ของ sidebar / focus / timer
- 📁 `apps/api/src/entries/` — ตัวกรอง `inbox=true` · `completed-at.ts`
- 📁 `packages/core/src/errors.ts` — `InvalidStateError` → 409

**ตัวอย่าง response**

```json
{
  "smartLists": { "all": 24, "inbox": 12, "today": 4, "week": 8, "overdue": 1 },
  "projects": [{ "id": "…", "name": "NOSION Core", "color": "#6366f1", "count": 9 }],
  "topTags": [{ "id": "…", "name": "dev", "count": 7 }]
}
```

**การตัดสินใจ**

- "วันนี้" = `occurredAt < ต้นวันพรุ่งนี้` (รวมที่เลยกำหนด) · "7 วัน" = `[ต้นวันนี้, ต้นวันที่ 8)`
  → งานเลยกำหนดอยู่ใน "วันนี้" แต่ไม่อยู่ใน "7 วัน"
- ขอบวันที่ 8 หาจากขอบวันจริง ไม่ใช่ `+7×24 ชม.` → ถูกต้องข้าม DST (มีเทสต์ New York)
- ใส่ `userId` เองทุก query: `PrismaService.forUser()` ไม่ดัก `groupBy` — ถ้าพึ่ง extension อย่างเดียวจะรั่วข้ามผู้ใช้
- ใช้ `Promise.all` ไม่ใช่ `$transaction` — อ่านอย่างเดียว ตัวเลขคลาดกันเสี้ยววินาทียอมรับได้ แลกกับไม่ถือ connection ยาว
- โปรเจกต์ที่ไม่มีงานค้างยังแสดง (count 0) — เพิ่งสร้างแล้วหายจาก sidebar จะงง

**แก้บั๊กที่เจอระหว่างทาง**

- `z.coerce.boolean()` แปลง `"false"` เป็น `true` (string ไม่ว่าง = truthy) → `?overdue=false` เคยได้งานเลยกำหนด
  แก้ด้วย `queryBool` ที่รับเฉพาะ `true/false/1/0`
- `PATCH status=pending` ไม่ล้าง `completedAt` → undo แล้วสถิติรายสัปดาห์ยังนับว่าเสร็จ

**วิธีตรวจ**

- unit: `task-ranges` 3 เคส (รวม DST), `buildSidebar` 2 เคส, `completedAtFor` 3 เคส, `queryBool` 5 assertion
- typecheck + lint ทั้ง monorepo ผ่าน (ครั้งแรกที่ตรวจ API ได้ใน sandbox — generate Prisma client ด้วย engine ปลอม)
- integration: 📁 `test/tasks.int-spec.ts` (sidebar นับถูก + ไม่รวมของผู้ใช้อื่น, inbox, undo) — **ยังไม่ได้รัน** ต้องมี Postgres → รันใน CI

---

## สิ่งที่ยังไม่ได้ตรวจ (ต้องทำบนเครื่องจริง)

- [ ] **ดูด้วยตา** ทั้ง 2 ธีม × desktop/mobile — sandbox ไม่มี browser
- [ ] `next build` ที่โหลดฟอนต์จริง — sandbox ต่อ Google Fonts ไม่ได้ (ตรวจด้วยฟอนต์จำลอง) · CI ต่อได้
- [ ] e2e smoke (ต้องมี API + DB)
- [ ] axe 0 serious ทั้ง 2 ธีม
- [ ] integration test ของ API (`pnpm test:int` — ต้องมี Postgres + Redis)

## หมายเหตุสภาพแวดล้อมที่ใช้ตรวจ

ตรวจบนสำเนาของ repo ใน Linux VM (ไม่แตะ `node_modules` ของ Mac):
`pnpm install --frozen-lockfile` → `turbo run typecheck lint test:unit` → `next build`
(`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` จำลองฟอนต์) · Prisma client generate ด้วย engine ปลอม
เพื่อให้ typecheck ฝั่ง API ได้ (ไม่มีการต่อฐานข้อมูลจริง)
