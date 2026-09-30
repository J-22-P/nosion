# Phase 2a · Design Refresh (สัปดาห์ 6)

> เป้าหมาย: เปลี่ยนหน้าตาทั้งแอปจากธีม indigo ของ Phase 1 เป็น **Monochrome + Apple Blue**
> สองธีมเท่ากัน (dark / light) ตาม mockup v1.1 — สเปก 8.2, 8.7, 8.11.2
> ความรู้เบื้องหลัง (อ่านเรียงกัน): [10 Design system & CSS](../learn/10-phase2a-design-system-and-theming.md) ·
> [11 Component & App shell](../learn/11-phase2a-accessible-components-and-app-shell.md) ·
> [12 หน้า Tasks](../learn/12-phase2a-tasks-page-frontend.md) ·
> [13 Task API & race condition](../learn/13-phase2a-task-api-sidebar-and-focus-timer.md)
> เหตุผลของการตัดสินใจ: [ADR-009](../adr/009-monochrome-design-system-dual-theme.md)

## ภาพรวมความคืบหน้า

| #   | ขั้น                                                                      | Commit                        | สถานะ           |
| --- | ------------------------------------------------------------------------- | ----------------------------- | --------------- |
| 1   | Contracts: habit payload v1.1                                             | `3e8b928`                     | ✅              |
| 2   | Design token + ฟอนต์                                                      | `e3b8067`                     | ✅              |
| 3   | UI primitives + theme switcher                                            | `6e4c09e`                     | ✅              |
| 4   | App shell                                                                 | `1cff933`                     | ✅              |
| 5   | Restyle Tasks + Login/Register                                            | `2a133e7`                     | ✅              |
| 6   | เอกสาร Phase 2a + ADR-009 (รอบแรก)                                        | `436cc59`                     | ✅              |
| 7   | API: `GET /tasks/sidebar` + ตัวกรอง inbox                                 | `cca6648`                     | ✅              |
| 8   | API: Focus timer + `GET /tasks/focus/today`                               | `3224f90`                     | ✅              |
| 9   | Web: ตัวเลข smart list, Inbox, การ์ด Focus, ปุ่มจับเวลา                   | `d3d7996`                     | ✅              |
| 10  | เอกสารเรียนรู้ละเอียดระดับ Phase 0–1 (บท 10–13) + อภิธานศัพท์             | `05b3e6b`                     | ✅              |
| 11  | ไอคอน PWA + manifest · contrast เป็นเทสต์ · visual regression + axe ใน CI | `70f9986` `5b6f04d` `22fbee4` | ✅ (รอรันใน CI) |

---

## ขั้น 1 · Contracts: habit payload v1.1 — `3e8b928`

📚 **ความรู้พื้นฐาน:** Zod refine, JSONB ที่ไม่ต้อง migrate → บท [06](../learn/06-phase1-api-design-and-validation.md), [03](../learn/03-phase0-database-and-prisma.md)

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

📚 **ความรู้พื้นฐาน:** cascade, specificity, `@layer`, custom property, token 3 ชั้น, Tailwind v4, dark mode, contrast, ฟอนต์ → บท [10](../learn/10-phase2a-design-system-and-theming.md)

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

📚 **ความรู้พื้นฐาน:** accessibility tree, ARIA, focus, roving tabindex, menu pattern, `cva` → บท [11](../learn/11-phase2a-accessible-components-and-app-shell.md) หัวข้อ 1–5

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

📚 **ความรู้พื้นฐาน:** responsive, flex/grid, sticky/fixed, safe area, `dvh`, hydration, Zustand persist, `useSyncExternalStore` → บท [11](../learn/11-phase2a-accessible-components-and-app-shell.md) หัวข้อ 6–7

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

📚 **ความรู้พื้นฐาน:** URL state, `replace` vs `push`, pure function, Suspense, debounce, regex + Unicode, undo ด้วย version → บท [12](../learn/12-phase2a-tasks-page-frontend.md)

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

## ขั้น 6 · เอกสาร Phase 2a (รอบแรก) — `436cc59`

- 📁 `docs/phases/` (ไฟล์นี้ + README + สรุป Phase 0–1)
- 📁 `docs/learn/10-…` (ภายหลังขยายเป็นบท 10–13 ในขั้น 10)
- 📁 `docs/adr/009-monochrome-design-system-dual-theme.md`
- อัปเดตสารบัญ `learn/00`, `learn/index.html`, `adr/README.md` และ path ที่ย้ายใน `learn/07`

---

## ขั้น 7 · API: `GET /tasks/sidebar` — `cca6648`

📚 **ความรู้พื้นฐาน:** instant/หน้าปัด/โซนเวลา, DST, `[start, end)`, COUNT/GROUP BY, isolation level, IDOR ของ `groupBy` → บท [13](../learn/13-phase2a-task-api-sidebar-and-focus-timer.md) หัวข้อ 1–4

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

## ขั้น 8 · API: Focus timer — `3224f90`

📚 **ความรู้พื้นฐาน:** state machine, TOCTOU, partial unique index, conditional update, transaction/ACID, idempotency, additive migration → บท [13](../learn/13-phase2a-task-api-sidebar-and-focus-timer.md) หัวข้อ 5–8

**เป้าหมาย:** ปุ่ม "เริ่มจับเวลา" บนการ์ดงาน และการ์ด "Focus Session วันนี้ 2h 45m / 4 ชม." (สเปก 7.3, 8.11.2)

**สิ่งที่เปลี่ยน**

- 📁 `apps/api/prisma/schema.prisma` — `FocusSession` (1 แถว/รอบ) + `UserSettings.focusGoalMinutes` (240)
- 📁 `apps/api/prisma/migrations/20260930090000_focus_sessions/` — additive ทั้งหมด + partial unique index
- 📁 `apps/api/src/modules/task/focus-timer.service.ts` — start / stop / today
- 📁 `apps/api/src/modules/task/focus.ts` — `sessionSeconds`, `secondsToMinutes`, `summarizeFocusDay` (pure)
- 📁 `tasks.controller.ts` — `POST /tasks/:id/timer/start|stop` (200), `GET /tasks/focus/today`
- settings: `focusGoalMinutes` อ่านได้จาก `/me` แก้ได้ผ่าน PATCH settings (15–960)

**Endpoint**

| Method | Path                     | ผล                                                                         |
| ------ | ------------------------ | -------------------------------------------------------------------------- |
| `POST` | `/tasks/:id/timer/start` | `FocusSessionDto` · งานอื่นจับอยู่ → หยุดให้ก่อน · ซ้ำกับงานเดิม → รอบเดิม |
| `POST` | `/tasks/:id/timer/stop`  | `{ session, addedMinutes }` · ไม่ได้จับอยู่ → 409 `timer-not-running`      |
| `GET`  | `/tasks/focus/today`     | `{ date, totalSeconds, goalMinutes, completedSessions, running }`          |

**การตัดสินใจ**

- ตารางแยก ไม่เก็บใน payload — ต้องการประวัติรายรอบและ constraint "1 รอบที่ยังไม่จบต่อผู้ใช้"
- constraint อยู่ที่ **ฐานข้อมูล** (partial unique index) ไม่ใช่แค่ในโค้ด — กันสองแท็บกดพร้อมกันได้จริง
- แพ้การแข่ง (`P2002`) → คืนรอบของผู้ชนะ ผู้ใช้ไม่เห็น error
- stop ใช้ `WHERE endedAt IS NULL` → stop ซ้ำไม่บวกเวลาซ้ำ
- **เพดาน 4 ชม./รอบ** (สเปกไม่ได้ระบุ — ตัดสินเอง) กันลืมกดหยุดข้ามคืน
- รอบที่จบแล้วนับตามวันที่เริ่ม · รอบที่กำลังจับนับเฉพาะส่วนที่อยู่ในวันนี้
- start เปลี่ยน `pending → active` (ใช้ status ที่มีอยู่ ไม่เพิ่มใหม่)
- ยังไม่ยิง `entry.updated` event — ยังไม่มีผู้ฟัง (Phase 4 SSE ต้องกลับมาเพิ่ม)

**วิธีตรวจ**

- unit `focus.spec.ts` 7 เคส (เพดาน, นาฬิกาย้อน, ปัดนาที, คร่อมเที่ยงคืน)
- typecheck + lint ทั้ง monorepo · `prisma validate` ผ่าน
- integration (ยังไม่ได้รัน — CI): idempotent start, auto-switch, **start พร้อมกัน 5 คำขอได้รอบเดียว**, stop ซ้ำ 409, งานเสร็จแล้ว 409, IDOR 404
- ⚠️ migration SQL เขียนด้วยมือตามรูปแบบของ migration แรก (sandbox รัน `prisma migrate` ไม่ได้)
  → **ควรรัน `pnpm db:migrate` บนเครื่องจริงแล้วดูว่า Prisma ไม่รายงาน drift**

---

## ขั้น 9 · Web: sidebar ตัวเลขจริง + Focus — `d3d7996`

📚 **ความรู้พื้นฐาน:** query key แบบลำดับชั้น, invalidate แบบ prefix, นาฬิกาฝั่ง client, effect cleanup → บท [12](../learn/12-phase2a-tasks-page-frontend.md) หัวข้อ 4–5

**สิ่งที่เปลี่ยน** — 📁 `apps/web/src/features/tasks/`

- `api.ts`, `use-task-queries.ts` — sidebar / focus / start / stop + `useElapsedSeconds`
- `task-sidebar.tsx` — ตัวเลขจาก server, smart list **Inbox** (`?list=inbox` → `GET /entries?inbox=true`)
- `focus-card.tsx` — ยอดรวม/เป้าหมาย + progress + รอบที่กำลังจับ · มือถือบนสุด desktop ใต้ sidebar
- `task-card.tsx` — ปุ่ม "เริ่มจับเวลา / กำลังจับเวลา" (`aria-pressed`)
- "N ค้างอยู่" ใช้ `smartLists.all` จาก server (เดิมนับจากหน้าแรก 50 รายการ)
- 📁 `lib/format.ts` — `formatDuration`, `formatClock` + เทสต์

**การตัดสินใจ**

- key ของ sidebar = `['entries', 'tasks-sidebar']` → mutation เดิมทุกตัว invalidate `['entries']` อยู่แล้ว ตัวเลขจึงสดเอง
- นาฬิกาคำนวณจาก `Date.now() - startedAt` ทุกวินาที ไม่ใช่ `+1` สะสม (แท็บที่ถูกพักจะช้า)
- ยอดรวม = ค่าจาก server + เวลาที่ผ่านไปตั้งแต่ server ตอบ · refetch ทุก 5 นาที
- การ์ด Focus โหลดไม่สำเร็จ → ซ่อนเงียบ ๆ (เป็นข้อมูลเสริม ไม่ควรแย่งพื้นที่รายการงาน)

**วิธีตรวจ:** unit test web ผ่านทั้งหมด · typecheck · lint · `next build` (`/tasks` 165 kB < 180 kB)

---

## ขั้น 10 · เอกสารเรียนรู้ระดับเดียวกับ Phase 0–1

**เหตุผล:** เอกสารรอบแรก (บท 10 เดิม) สรุปสั้นเกินไปเทียบกับบท 02–07
ที่อธิบายพื้นฐานตั้งแต่ศูนย์แล้วค่อยพาเดินโค้ดทีละขั้น

**สิ่งที่เปลี่ยน** — 📁 `docs/learn/`

| บท  | เนื้อหาพื้นฐานที่แทรก                                                                                                                     | โค้ดที่พาเดิน                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 10  | cascade, specificity, `@layer`, custom property, สีและ alpha, Tailwind สร้าง CSS อย่างไร, FOUC, สูตร contrast, การโหลดฟอนต์               | tokens.css → globals.css → card.tsx, กับดัก layer, เดินทางของหนึ่งพิกเซล |
| 11  | a11y คืออะไร, accessibility tree, กฎข้อแรกของ ARIA, focus/tab order, live region, mobile-first, flex/grid, sticky/fixed, safe area, `dvh` | Button, Checkbox, Segmented, Menu, StatusPill, shell ทั้งชุด             |
| 12  | ประเภทของ state, push/replace, pure function, `useMemo`, Suspense + prerender, debounce/throttle, regex ฉบับเร่งรัด, Unicode `\p{M}`      | use-task-view, quick-capture-parser, query key, undo, นาฬิกา             |
| 13  | instant/หน้าปัด/โซนเวลา, DST, half-open interval, COUNT/GROUP BY, isolation level, TOCTOU, unique/partial index, ACID, idempotency        | sidebar, timer, migration, race condition test                           |

- ลบบท 10 เดิม (`10-phase2a-design-system-and-ui.md`) — เนื้อหาย้ายเข้าบท 10–13
- เพิ่มอภิธานศัพท์ 2 หมวด (Design system & UI, เวลาและความถูกต้องของข้อมูล)
- อัปเดตสารบัญ `00-how-to-read.md`, `index.html` และลิงก์ในบท 07
- ทุกขั้นในไฟล์นี้มีบรรทัด 📚 ชี้ไปหัวข้อพื้นฐานที่เกี่ยวข้อง

---

## ขั้น 11 · ไอคอน PWA, contrast เป็นเทสต์, visual regression + axe — `70f9986` `5b6f04d` `22fbee4`

📚 **ความรู้พื้นฐาน:** manifest, maskable/safe zone, visual regression, deterministic test, `page.route`, `page.clock`, axe, alpha compositing → บท [14](../learn/14-phase2a-pwa-icons-visual-and-a11y-testing.md)

### 11a · ไอคอน + manifest — `70f9986`

- 📁 `apps/web/scripts/generate-icons.mjs` (`pnpm --filter @nosion/web icons`) — sharp render SVG → PNG
  - `public/icons/icon-192.png`, `icon-512.png` — มุมมน + ขอบ `#27272a` แบบเดียวกับ `icon.svg`
  - `public/icons/maskable-512.png`, `src/app/apple-icon.png` (180) — พื้นเต็มกรอบ ตัว N ย่อ 80% อยู่ใน safe zone
- 📁 `apps/web/src/app/manifest.ts` → `/manifest.webmanifest` (standalone, start_url `/today`, สีดำ)
- devDependencies ใหม่: `sharp` (เดิมเป็นของ next ทางอ้อม), `@axe-core/playwright`
- ตรวจ: ดูภาพไอคอนทั้ง 3 แบบด้วยตาแล้ว · build ผ่าน (`/manifest.webmanifest`, `/apple-icon.png` อยู่ใน route list)
- ⚠️ สคริปต์ต้องอยู่ใน `apps/web/` — วางที่ root แล้ว `import sharp` ไม่เจอ (pnpm แยก node_modules ต่อ package)

### 11b · ตรวจ contrast ของ token เป็น unit test — `5b6f04d`

- 📁 `packages/ui/src/contrast.ts` + `tokens.test.ts` (67 เคส) — อ่าน `tokens.css` จริง ตรวจทุกคู่ ข้อความ × พื้น
  รวม **สีบน `*-soft` ที่ทับการ์ด/แถว**
- **เจอว่าค่าจากสเปกตก AA 11 คู่** (ส่วนใหญ่คือ badge ที่สีโปร่งซ้อนสองชั้น) → ปรับน้อยที่สุดจนผ่าน:

  | token                                     | สเปก                                          | ใช้จริง                                       |
  | ----------------------------------------- | --------------------------------------------- | --------------------------------------------- |
  | light accent / danger / warning / success | `#0071e3` / `#d70015` / `#b25000` / `#248a3d` | `#0062c5` / `#cf0014` / `#ac4d00` / `#1f7835` |
  | dark accent / danger                      | `#2997ff` / `#ff453a`                         | `#2e9aff` / `#ff5950`                         |

- เลิกใช้ `text-tertiary` กับข้อความปกติ 4 จุด (ชื่องานที่เสร็จ, "(Today)", เมนูที่ยังไม่พร้อม, "หรือ")
- ADR-009 เพิ่ม 2 แถวในตาราง "จุดที่ไม่ทำตาม mockup/สเปก"
- ตรวจ: unit test ui ผ่าน 67/67 · typecheck/lint/test ทั้ง monorepo

### 11c · Visual regression + axe — `22fbee4`

- 📁 `apps/web/playwright.config.ts` — project `smoke` (API จริง) แยกจาก `ui` (API ปลอม) · webServer `pnpm start`
- 📁 `apps/web/e2e/support/` — `mock-data.ts` (type จาก contracts), `mock-api.ts` (`page.route`), `ui-test.ts` (fixture ตรึงเวลา/โซน/ภาษา)
- 📁 `e2e/visual.spec.ts` — Tasks + Login × light/dark × desktop 1440 / mobile 390 = **8 ภาพ**
- 📁 `e2e/a11y.spec.ts` — axe บน 5 หน้า × 2 ธีม = **10 เทสต์** ล้มเมื่อ serious/critical
- 📁 `apps/web/scripts/playwright-docker.sh` (`test:ui:docker`) — สร้าง baseline ใน image เดียวกับ CI
- CI job **"UI · visual + a11y"** ใน `mcr.microsoft.com/playwright:v1.63.0-noble` ·
  `--update-snapshots=missing` + อัปโหลด artifact `ui-screenshots` / `playwright-report`
- `typecheck` ของ web รวม `e2e/` แล้ว (mock ล้าสมัยเมื่อ DTO เปลี่ยน = typecheck แดง)

**การตัดสินใจ**

- API ปลอมที่ระดับ network ในเบราว์เซอร์ แทน API + DB จริง → นิ่ง เร็ว ไม่ต้องมี Postgres ใน job นี้
- baseline สร้างใน Docker เท่านั้น (ภาพ macOS ≠ Linux) และมี `{platform}` ในชื่อไฟล์
- CI **ไม่ commit ภาพเอง** — คนต้องดาวน์โหลด artifact ตรวจด้วยตาแล้ว commit
- ยอมต่างได้ 1% ของพิกเซล (0 = flaky, สูงกว่านี้ = ปุ่มหายก็ไม่ล้ม)

**วิธีตรวจ:** typecheck ของ e2e ผ่าน · `playwright test --list` เห็น 18 เทสต์ · build ผ่าน
⚠️ **ยังไม่ได้รันจริง** — sandbox ไม่มี browser (ดาวน์โหลด Chromium ไม่ได้) · รอบแรกจะรันใน CI

---

## สิ่งที่ยังไม่ได้ตรวจ (ต้องทำบนเครื่องจริง)

- [ ] **ดูด้วยตา** ทั้ง 2 ธีม × desktop/mobile — sandbox ไม่มี browser
- [ ] `next build` ที่โหลดฟอนต์จริง — sandbox ต่อ Google Fonts ไม่ได้ (ตรวจด้วยฟอนต์จำลอง) · CI ต่อได้
- [ ] e2e smoke (ต้องมี API + DB) — `pnpm test:e2e`
- [ ] หลัง `git pull` บน Mac ต้อง `pnpm install` (มี devDependency ใหม่: sharp, @axe-core/playwright, vitest ใน ui)
- [ ] CI job "UI · visual + a11y" รอบแรก → ดาวน์โหลด artifact `ui-screenshots` ตรวจด้วยตา แล้ว commit เข้า `apps/web/e2e/__screenshots__/` (หรือรัน `pnpm --filter @nosion/web test:ui:docker`)
- [ ] axe 0 serious ทั้ง 2 ธีม — เทสต์เขียนแล้ว รอผลรอบแรกใน CI
- [ ] integration test ของ API (`pnpm test:int` — ต้องมี Postgres + Redis)
- [ ] `pnpm db:migrate` บนเครื่องจริง — ยืนยันว่า migration `focus_sessions` ที่เขียนมือไม่ทำให้ Prisma รายงาน drift

## หมายเหตุสภาพแวดล้อมที่ใช้ตรวจ

ตรวจบนสำเนาของ repo ใน Linux VM (ไม่แตะ `node_modules` ของ Mac):
`pnpm install --frozen-lockfile` → `turbo run typecheck lint test:unit` → `next build`
(`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` จำลองฟอนต์) · Prisma client generate ด้วย engine ปลอม
เพื่อให้ typecheck ฝั่ง API ได้ (ไม่มีการต่อฐานข้อมูลจริง)
