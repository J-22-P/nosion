# 12 · Phase 2a — หน้า Tasks: URL state, Regex parser และ Server state

> หน้า Tasks คือหน้าที่ถูกใช้บ่อยที่สุดในแอป Phase นี้รื้อใหม่ทั้งหน้า (ขั้น 5 และ 9)
> บทนี้อธิบาย 4 เรื่องที่อยู่เบื้องหลัง:
> **(1) state ควรอยู่ที่ไหน (2) parser ด้วย regex ที่รองรับภาษาไทย
> (3) ทำให้ตัวเลขทุกจุดสดพร้อมกันโดยไม่ไล่สั่งทีละจุด (4) นาฬิกาที่เดินโดยไม่ยิง API**

อ่านคู่กับ: 📁 `docs/phases/phase-2a-design-refresh.md` ขั้น 5, 9 · บท [07](./07-phase1-frontend-data-layer.md) (TanStack Query พื้นฐาน)

---

## 1. แผนที่ของหน้า

📁 `apps/web/src/features/tasks/`

```
app/(app)/tasks/page.tsx          ← Server Component: metadata + <Suspense>
└─ TasksView (tasks-view.tsx)      ← อ่าน URL → filters
   ├─ header + SegmentedControl    ← ?view=
   ├─ FocusCard (มือถือ)
   ├─ QuickCapture                 ← parser + POST /entries
   ├─ TaskSmartListBar (มือถือ)   ← ?list=
   ├─ TaskSidebar + FocusCard      ← GET /tasks/sidebar, /tasks/focus/today
   └─ TaskBoard                    ← GET /entries (ตาม filters) + กลุ่ม "เสร็จสิ้นแล้ว"
      └─ TaskCard × N
```

state ในหน้านี้มีสามประเภท (ทบทวนหลักจากบท 07 / สเปก 8.5):

| ประเภท                                      | ตัวอย่าง                              | เก็บที่        |
| ------------------------------------------- | ------------------------------------- | -------------- |
| **Server state** — ความจริงอยู่ที่ server   | รายการงาน, ตัวเลข sidebar, เวลาโฟกัส  | TanStack Query |
| **URL state** — ต้อง share/refresh แล้วอยู่ | มุมมอง, smart list, คำค้น             | search params  |
| **UI state ชั่วคราว**                       | ข้อความที่กำลังพิมพ์, เมนูเปิดอยู่ไหม | `useState`     |

---

## 2. URL คือ state

### 2.1 ทำไมไม่ใช้ `useState`

`/tasks?view=priority&list=today&q=auth`

| เก็บใน...  | refresh แล้ว | ส่งลิงก์ให้คนอื่น | ปุ่ม Back |
| ---------- | ------------ | ----------------- | --------- |
| `useState` | หาย          | ไม่ได้            | ไม่ได้    |
| URL        | อยู่         | ได้               | ได้       |

### 2.2 `push` vs `replace`

📁 `use-task-view.ts` ใช้ `router.replace(...)` ไม่ใช่ `push`

- `push` = เพิ่มรายการใน history → กดเปลี่ยน filter 5 ครั้ง ต้องกด Back 5 ครั้งถึงออกจากหน้า
- `replace` = แทนที่รายการปัจจุบัน → Back ออกจากหน้าทันที

filter ไม่ใช่ "การไปหน้าใหม่" ในความรู้สึกผู้ใช้ จึงใช้ `replace` · `{ scroll: false }` กันหน้ากระโดดขึ้นบนสุด

### 2.3 Parse ค่าจาก URL แบบไม่เชื่อ

URL คือ input จากผู้ใช้ — พิมพ์อะไรมาก็ได้

```ts
function parseView(value: string | null): TaskView {
  return TASK_VIEWS.includes(value) ? value : 'list'; // ค่าแปลก ๆ → ค่าเริ่มต้น
}
function parseList(value) {
  if (value && /^(project|tag):[\w-]+$/.test(value)) return value; // รูปแบบต้องตรง
  return 'all';
}
```

หลักเดียวกับ validate body ที่ API — **ไม่มี input ไหนน่าเชื่อถือ**

### 2.4 แยก "แปลง state เป็น filter" เป็น pure function

```ts
export function buildTaskFilters(view, list, q, now = new Date()): EntryFilters;
```

**Pure function** = ผลลัพธ์ขึ้นกับ input อย่างเดียว ไม่อ่าน/เขียนอะไรข้างนอก (URL, นาฬิกา, network)
→ ทดสอบได้ด้วย `expect(buildTaskFilters('list','today','',NOW)).toEqual(…)` ไม่ต้อง render React
📁 `use-task-view.test.ts`

รับ `now` เป็นพารามิเตอร์ = **ควบคุมเวลาในเทสต์ได้** (หลักเดียวกับ 📁 `packages/core/src/time.ts` ของ Phase 1)
ถ้าในฟังก์ชันเรียก `new Date()` เอง เทสต์ "วันนี้" จะผ่านวันนี้แต่พังพรุ่งนี้

### 2.5 `useMemo` และ `useCallback` — ทำไมต้องมีในไฟล์นี้

```ts
const filters = useMemo(() => buildTaskFilters(view, list, q), [view, list, q]);
```

`filters` เป็นส่วนหนึ่งของ query key ของ TanStack Query — ถ้าสร้าง object ใหม่ทุก render
Query จะ hash เทียบค่า (ไม่ได้เทียบ reference) จึงไม่ยิงซ้ำ แต่ component ลูกที่รับ `filters` เป็น prop
และ hook ที่ใส่ไว้ใน dependency array จะเห็นว่า "เปลี่ยน" ทุกครั้ง

`setQuery` ห่อด้วย `useCallback` เพราะ `SearchBox` ใส่ไว้ใน dependency ของ `useEffect` —
ถ้า identity เปลี่ยนทุก render effect จะรันทุก render

### 2.6 `useSearchParams` ต้องอยู่ใต้ `<Suspense>`

📁 `app/(app)/tasks/page.tsx`

Next.js พยายาม **prerender** หน้าตอน build (สร้าง HTML ล่วงหน้า) แต่ตอน build ไม่มี URL จริง
→ component ที่อ่าน search params ต้องถูกบอกว่า "ส่วนนี้รอ client" ด้วย `<Suspense fallback=…>`
ไม่งั้น `next build` ล้ม ส่วนที่อยู่นอก Suspense ยัง prerender ได้ตามปกติ

### 2.7 Debounce ช่องค้นหา

📁 `tasks-view.tsx` → `SearchBox`

```ts
useEffect(() => {
  if (draft === value) return;
  const timer = setTimeout(() => onChange(draft), 250);
  return () => clearTimeout(timer); // พิมพ์ตัวใหม่ก่อนครบ 250ms → ยกเลิกของเก่า
}, [draft, value, onChange]);
```

**Debounce** = รอจนผู้ใช้หยุดพิมพ์ 250ms ค่อยทำงานครั้งเดียว
พิมพ์ "authentication" 14 ตัว → เขียน URL และยิง API 1 ครั้ง แทน 14 ครั้ง
(ต่างจาก **throttle** ที่ "ทำได้ไม่เกิน 1 ครั้งต่อช่วงเวลา" — เหมาะกับ scroll/resize มากกว่า)

---

## 3. Quick capture — parser ด้วย regex

### 3.1 โจทย์

พิมพ์ `แก้ bug login !urgent #backend +auth-v2` แล้วได้:

```
title    = "แก้ bug login"
priority = urgent
tags     = [backend]
project  = auth-v2
```

สเปกให้ทำแค่ 3 รูปแบบนี้ก่อน Phase 5 (ที่จะมี NL parser เต็มรูปแบบร่วมกับ ⌘K)

### 3.2 Regex ฉบับเร่งรัด

| สัญลักษณ์ | ความหมาย                                                 |
| --------- | -------------------------------------------------------- |
| `[abc]`   | ตัวใดตัวหนึ่งใน a b c                                    |
| `+`       | หนึ่งตัวขึ้นไป                                           |
| `( … )`   | จับกลุ่ม (capture) — เอาค่าไปใช้ได้                      |
| `(^       | \s)`                                                     | ต้นข้อความ **หรือ** ช่องว่าง |
| `(?= … )` | **lookahead** — ข้างหน้าต้องเป็นแบบนี้ แต่ไม่กินตัวอักษร |
| flag `g`  | หาทุกตำแหน่ง ไม่หยุดที่ตัวแรก                            |
| flag `u`  | โหมด Unicode — จำเป็นสำหรับ `\p{…}`                      |

### 3.3 ตัวจริงใน 📁 `quick-capture-parser.ts`

```ts
const WORD = '[\\p{L}\\p{M}\\p{N}_.-]+';
const TOKEN_RE = new RegExp(`(^|\\s)([!#+])(${WORD})(?=\\s|$)`, 'gu');
//                          ต้นคำ    สัญลักษณ์  คำ        ท้ายคำ
```

**ทำไมต้อง `(^|\s)` นำหน้า** — ไม่ให้ `C#` หรือ `1+1` ถูกตีความเป็น tag/project
(`#` ใน `C#` มี `C` นำหน้า ไม่ใช่ช่องว่าง)

**ทำไมไม่ใช้ `\w` และ `\b`** — `\w` = `[A-Za-z0-9_]` **ASCII เท่านั้น** ภาษาไทยไม่เข้า
และ `\b` (ขอบคำ) นิยามจาก `\w` → กับภาษาไทยใช้ไม่ได้เลย จึงใช้ lookahead `(?=\s|$)` แทน

### 3.4 Unicode property escapes — หัวใจของการรองรับภาษาไทย

| escape      | หมวด Unicode | ตัวอย่าง                                             |
| ----------- | ------------ | ---------------------------------------------------- |
| `\p{L}`     | Letter       | a, ก, あ                                             |
| `\p{N}`     | Number       | 1, ๑                                                 |
| **`\p{M}`** | **Mark**     | สระบน/ล่าง ◌ิ ◌ี ◌ุ, วรรณยุกต์ ◌่ ◌้, ไม้หันอากาศ ◌ั |

คำว่า "ด่วน" ในหน่วยความจำคือ `ด` + `่` + `ว` + `น` — ไม้เอก `่` **ไม่ใช่ Letter แต่เป็น Mark**
ถ้าลืม `\p{M}` → `#ด่วน` จับได้แค่ `#ด` แล้วหยุด

🎤 _"รองรับภาษาไทยใน regex ต้องระวังอะไร?"_ → `\w`/`\b` เป็น ASCII, ต้องใช้ flag `u` + `\p{L}\p{M}`,
และภาษาไทยไม่มีช่องว่างระหว่างคำ จึงตัดคำด้วย regex ไม่ได้ (ต้องใช้ `Intl.Segmenter` หรือพจนานุกรม)

### 3.5 ใช้ `replace` ทำสองอย่างพร้อมกัน

```ts
const title = input
  .replace(TOKEN_RE, (match, lead, sigil, word) => {
    // เก็บ token ลง array ...
    return lead; // คืนแค่ช่องว่างนำหน้า = ลบ token ออกจากชื่อ
  })
  .replace(/\s+/g, ' ')
  .trim();
```

รอบเดียวได้ทั้ง **ชื่องานที่ตัด token ออกแล้ว** และ **รายการ token**
`!important` (ไม่รู้จัก) คืน `match` เดิม → คงอยู่ในชื่องาน ไม่หายไปเงียบ ๆ

### 3.6 ข้อผิดพลาดคลาสสิกของ regex แบบ `g`

regex ที่มี flag `g` **จำตำแหน่งล่าสุด** (`lastIndex`) ถ้าใช้ `.test()` ซ้ำกับ object เดิม
ผลจะสลับ true/false — `replace` ไม่มีปัญหานี้เพราะ reset เอง แต่ถ้าวันหนึ่งเปลี่ยนไปใช้ `.exec()` วนลูป ต้องระวัง

### 3.7 จากข้อความถึงงานในฐานข้อมูล

📁 `quick-capture.tsx`

1. parse ทุกครั้งที่พิมพ์ (`useMemo`) — ไม่ต้อง debounce เพราะไม่ยิง network
2. แสดง chip "PARSED" — ผู้ใช้เห็นก่อนกดว่าระบบเข้าใจอะไร · กด × ลบ token นั้นออกจากข้อความ
3. กด Enter → แปลงชื่อเป็น id:
   - `+auth-v2` → หาโปรเจกต์ชื่อตรงกัน (`sameName` ไม่สนตัวพิมพ์ และถือว่า `-` `_` ช่องว่าง เท่ากัน)
     ไม่เจอ = สร้างใหม่ (`POST /projects`) — chip มีป้าย "ใหม่" บอกล่วงหน้า
   - `#backend` → เหมือนกันกับแท็ก
4. `POST /entries` พร้อม `priority`, `projectId`, `tagIds`
5. สร้างแล้วเอาผลใส่ cache ด้วย `setQueryData` ทันที — ไม่ต้องรอ refetch รายการโปรเจกต์ทั้งหมด

---

## 4. Server state ที่สดพร้อมกันทุกจุด

### 4.1 ปัญหา

ติ๊กงานเสร็จหนึ่งชิ้น ต้องเปลี่ยน 4 จุดพร้อมกัน:
รายการงาน · "24 ค้างอยู่" ในหัวหน้า · ตัวเลข smart list · กลุ่ม "เสร็จสิ้นแล้ว"

ทางที่ไม่ดี: ทุก mutation ต้องจำว่าต้อง invalidate อะไรบ้าง → เพิ่มจุดแสดงผลใหม่เมื่อไรก็ต้องไล่แก้ทุก mutation

### 4.2 ทางที่ใช้: ออกแบบ query key เป็นลำดับชั้น

📁 `use-task-queries.ts`

```ts
['entries', { module: 'task', status: 'pending,active', … }]   // รายการงาน
['entries', { module: 'task', status: 'done', … }]             // กลุ่มเสร็จแล้ว
['entries', 'tasks-sidebar']                                    // ตัวเลข sidebar  ← ตั้งใจให้ขึ้นต้นด้วย 'entries'
['focus', 'today']                                              // การ์ด Focus
```

`invalidateQueries({ queryKey: ['entries'] })` = **ทุก key ที่ขึ้นต้นด้วย `'entries'`** (prefix match)
mutation เดิมทุกตัวใน 📁 `features/entries/use-entries.ts` ทำแบบนี้อยู่แล้ว
→ sidebar สดตามเองโดยไม่แก้ mutation สักตัว

**Invalidate** ≠ ลบ — แค่ทำเครื่องหมายว่า "เก่าแล้ว" query ที่มีคนดูอยู่จะ refetch ทันที ที่ไม่มีคนดูรอจนถูกใช้

### 4.3 Undo — ย้อนการติ๊กเสร็จ

📁 `task-board.tsx`

```ts
complete.mutate(entry.id, {
  onSuccess: (updated) =>
    toast.success('เสร็จแล้ว', {
      action: { label: 'เลิกทำ', onClick: () => reopen.mutate(updated) },
    }),
});
```

- `reopen` = `PATCH /entries/:id { status: 'pending', version }` 📁 `use-entries.ts` → `useReopenEntry`
- ใช้ `version` **จากผลของ complete** (ไม่ใช่ของเดิมก่อนติ๊ก) — complete เพิ่ม version ไปแล้ว
  ส่ง version เก่า = 409 Conflict (optimistic concurrency จากบท 06)
- ฝั่ง API ล้าง `completedAt` ด้วย (ขั้น 7 — บท [13](./13-phase2a-task-api-sidebar-and-focus-timer.md))

### 4.4 จัดกลุ่มตามมุมมอง

`groupEntries()` ใน 📁 `task-board.tsx` เป็น pure function: `project` → กลุ่มตามโปรเจกต์ (ไม่มีโปรเจกต์ไว้ท้าย),
`priority` → urgent → none, `list/overdue` → กลุ่มเดียวไม่มีหัว
ห่อด้วย `useMemo` เพราะคำนวณจากรายการทั้งหมดทุก render

---

## 5. นาฬิกาจับเวลาที่เดินโดยไม่ยิง API

### 5.1 โจทย์

การ์ด Focus ต้องแสดง `12:34` ที่เดินทุกวินาที และยอดรวม `2h 45m` ที่เพิ่มขึ้นเรื่อย ๆ ขณะจับเวลา
แต่ยิง `GET /tasks/focus/today` ทุกวินาทีไม่ได้ (60 request/นาที/ผู้ใช้)

### 5.2 แยก "ความจริง" ออกจาก "การแสดงผล"

- **ความจริง** (จาก server): `running.startedAt` และ `totalSeconds` ณ เวลาที่ server ตอบ
- **การแสดงผล** (client): เอาเวลาปัจจุบันลบ `startedAt` ทุกวินาที

📁 `use-task-queries.ts`

```ts
export function useElapsedSeconds(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return Math.floor((now - new Date(startedAt).getTime()) / 1000);
}
```

⚠️ **ห้ามนับด้วย `+1` สะสม** (`setSeconds(s => s + 1)`) — เบราว์เซอร์ลด `setInterval` ของแท็บที่ไม่ได้ดู
เหลือนาทีละครั้ง (หรือหยุดเลยบนมือถือ) สลับแท็บกลับมานาฬิกาจะช้าไปหลายนาที
คำนวณจากนาฬิกาเครื่องทุกครั้ง → กลับมาเมื่อไรก็ตรง

ยอดรวม = `totalSeconds` จาก server + เวลาที่ผ่านไปตั้งแต่ server ตอบ (`query.dataUpdatedAt`)
และ refetch ทุก 5 นาทีเผื่อข้ามเที่ยงคืนหรือไปกดหยุดจากเครื่องอื่น

### 5.3 Cleanup ของ effect

`return () => clearInterval(timer)` — รันตอน component หายไปหรือ `startedAt` เปลี่ยน
ลืมบรรทัดนี้ = interval เดิมยังวิ่งต่อหลังหยุดจับเวลา (memory leak + setState บน component ที่ไม่อยู่แล้ว)

---

## 6. รายละเอียดเล็ก ๆ ที่มีเหตุผล

- **ป้าย priority บนการ์ดเป็นอังกฤษตัวใหญ่** (`URGENT`) ตาม mockup + `lang="en"` ให้ screen reader อ่านสำเนียงถูก
- **`low` / `none` ไม่แสดง chip** — ลดสิ่งรบกวน สายตาไปที่งานสำคัญ
- **"เลื่อนแล้ว N ครั้ง"** ≥ 3 เป็นสีเตือน — ข้อมูลจาก `payload.deferCount` ที่ API นับตอน defer (Phase 1)
- **อ่าน payload ด้วย `safeParse`** 📁 `task-card.tsx` → `readPayload()` — JSONB อาจมาจากเวอร์ชันเก่า
  ถ้า parse ไม่ผ่านได้ `null` แล้วซ่อน metadata แทนการทำให้ทั้งหน้าพัง
- **`memo(TaskCard)`** — list 50 ใบ พิมพ์ในช่องค้นหาแล้วไม่ต้อง render การ์ดทุกใบใหม่ถ้า props ไม่เปลี่ยน

---

## ข้อเสียที่ยอมรับ

- ไม่ได้ติดตั้ง `nuqs` ตามสเปก — hook เดียว (`useTaskView`) ทำหน้าที่แทน เปลี่ยนภายหลังได้ที่ไฟล์เดียว
- ขอบ "วันนี้/7 วัน" ฝั่ง web ใช้โซนเวลาของ **เบราว์เซอร์** ส่วนตัวเลขใน sidebar ใช้โซนเวลาใน **settings**
  ถ้าสองค่านี้ต่างกัน (เดินทางข้ามประเทศ) ตัวเลขกับรายการอาจไม่ตรงกันชั่วคราว
- Quick capture สร้างแท็ก/โปรเจกต์ใหม่ทีละคำขอก่อนสร้างงาน — ถ้าสร้างงานล้มเหลว แท็กใหม่ยังค้างอยู่
- ยังไม่มีปุ่มลัด `j/k/x/e/t` (สเปก 8.4) และ side sheet รายละเอียดงาน

---

## แบบฝึกหัดท้ายบท

1. ลบ `\p{M}` ออกจาก `WORD` แล้วรัน `pnpm --filter @nosion/web test` — เคสไหนพัง และพังเพราะอะไร
2. เปลี่ยน `router.replace` เป็น `router.push` แล้วสลับมุมมอง 4 ครั้ง กด Back — เกิดอะไรขึ้น
3. เปลี่ยน `TASK_SIDEBAR_KEY` เป็น `['tasks-sidebar']` แล้วติ๊กงานเสร็จ — ตัวเลข sidebar เปลี่ยนไหม? ทำไม
4. เริ่มจับเวลา สลับไปแท็บอื่น 3 นาที แล้วกลับมา — นาฬิกาถูกไหม? ถ้าเปลี่ยน `useElapsedSeconds` เป็นแบบ `+1` สะสมล่ะ
5. ใน `buildTaskFilters` ถ้าเรียก `new Date()` ข้างในแทนรับ `now` — เทสต์ "7 วันข้างหน้า" จะเขียนอย่างไรให้ผ่านทุกวัน?
