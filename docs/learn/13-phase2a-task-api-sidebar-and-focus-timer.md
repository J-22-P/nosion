# 13 · Phase 2a — API ของโมดูล Task: Sidebar, Focus Timer และ Race Condition

> หน้า Tasks ใหม่ต้องการข้อมูลที่ `/entries` ตัวกลางให้ไม่ได้: ตัวเลขสรุป และตัวจับเวลา
> บทนี้พาสร้าง 4 endpoint (ขั้น 7–8 ของ Phase) และใช้เป็นโอกาสอธิบายพื้นฐานที่ backend ทุกงานต้องเจอ:
> **เวลาและโซนเวลา · การนับด้วย SQL · transaction · race condition · constraint ในฐานข้อมูล · idempotency**

อ่านคู่กับ: 📁 `docs/phases/phase-2a-design-refresh.md` ขั้น 7–8 · บท [03](./03-phase0-database-and-prisma.md), [06](./06-phase1-api-design-and-validation.md)

---

## 1. Endpoint เฉพาะโมดูลอยู่ตรงไหนในสถาปัตยกรรม

บท 05 บอกว่า CRUD ของทุกโมดูลผ่าน `/entries` ตัวเดียว — แล้ว `/tasks/sidebar` ผิดหลักไหม?

ไม่ผิด สเปก 7.3 แยกไว้ชัด: **CRUD = generic** · **สิ่งที่มีเฉพาะโมดูลนั้น = endpoint ของโมดูล**
(เหมือน `/expenses/summary`, `/habits/:id/increment` ที่จะมาใน Phase ถัดไป)

📁 `apps/api/src/modules/task/`

```
task.module.ts          ← ประกาศ controller + provider ของโมดูล
task.trackable.ts       ← สัญญา TrackableModule (Phase 1)
tasks.controller.ts     ← /tasks/*  (ใหม่)
task-stats.service.ts   ← sidebar
task-ranges.ts          ← ขอบเวลา "วันนี้ / 7 วัน"      (pure)
focus-timer.service.ts  ← start / stop / today
focus.ts                ← คำนวณเวลาโฟกัส                (pure)
```

กฎ lint ของ Phase 0 (ADR-006) ยังคุ้มครอง: `modules/task` import ได้แค่ `common`, `infra`, `core` และตัวเอง
controller ห้ามแตะ Prisma ตรง (ต้องผ่าน service) — ทุกไฟล์ใหม่ผ่าน lint ชุดเดิม

**รูปแบบที่ใช้ซ้ำทั้งบท:** service = ดึงข้อมูล + เรียก **pure function** ที่คำนวณ
→ ตรรกะยาก ๆ (เวลา, การรวมยอด) มี unit test ที่รันใน ~1 วินาทีโดยไม่ต้องมีฐานข้อมูล

---

## 2. พื้นฐาน: เวลาและโซนเวลา (ส่วนที่ bug ชุกที่สุดในซอฟต์แวร์)

### 2.1 สามสิ่งที่ต้องแยกให้ออก

| คำ                                | คืออะไร                                  | ตัวอย่าง                           |
| --------------------------------- | ---------------------------------------- | ---------------------------------- |
| **Instant** (จุดเวลา)             | ช่วงเวลาเดียวกันทั้งโลก                  | `2026-09-30T08:00:00Z`             |
| **Wall-clock time** (เวลาหน้าปัด) | สิ่งที่นาฬิกาบนผนังแสดง                  | "15:00 วันที่ 30"                  |
| **Time zone**                     | กฎแปลง instant ↔ หน้าปัด ของพื้นที่หนึ่ง | `Asia/Bangkok`, `America/New_York` |

instant เดียวกัน = 15:00 ที่กรุงเทพ = 04:00 ที่นิวยอร์ก
**ฐานข้อมูลเก็บ instant (UTC) เสมอ** — แปลงเป็นหน้าปัดตอนแสดงผลหรือตอนตัดสินว่า "วันนี้" คือช่วงไหน

### 2.2 ทำไมต้องใช้ชื่อ IANA ไม่ใช่ offset

`+07:00` คือ offset ณ ขณะหนึ่ง · `Asia/Bangkok` คือ **กฎ** ที่รวมประวัติและอนาคต
ประเทศที่มี **DST (Daylight Saving Time)** เปลี่ยน offset ปีละ 2 ครั้ง:
นิวยอร์ก = `-04:00` ช่วงฤดูร้อน และ `-05:00` ช่วงฤดูหนาว — เก็บแค่ offset จะผิดครึ่งปี

### 2.3 "วันนี้" ของผู้ใช้คือช่วงไหน

📁 `packages/core/src/time.ts` → `dayBoundsInTimeZone(now, tz)` (มีตั้งแต่ Phase 1)

```
now = 2026-09-30T08:00Z , tz = Asia/Bangkok
→ หน้าปัดไทย = 30 ก.ย. 15:00
→ วันที่ 30 ของไทยเริ่ม 00:00 ไทย = 2026-09-29T17:00Z
→ { start: 29T17:00Z, end: 30T17:00Z }      ← [start, end)  รวมต้น ไม่รวมปลาย
```

⚠️ **ช่วง 00:00–07:00 ของไทยยังเป็น "เมื่อวาน" ใน UTC** — ถ้าคำนวณ "วันนี้" ด้วย UTC
งานที่ทำตอนตี 1 จะไปอยู่ในวันก่อน เทสต์ข้อ 2 ใน 📁 `task-ranges.spec.ts` ล็อกพฤติกรรมนี้ไว้

**ช่วงแบบ `[start, end)`** (half-open) — ใช้ `gte start` และ `lt end` ทำให้วันติดกันต่อกันพอดี
ไม่มีช่องว่าง ไม่มีซ้อน ต่างจาก `lte 23:59:59` ที่พลาดมิลลิวินาทีสุดท้าย

### 2.4 "7 วันข้างหน้า" กับ DST

วิธีที่ผิด: `todayStart + 7 × 24 ชม.`
ถ้าในสัปดาห์นั้นมีวันที่ยาว 25 ชั่วโมง (สิ้นสุด DST) ผลจะคลาดไป 1 ชั่วโมง

📁 `task-ranges.ts`

```ts
const probe = new Date(today.start.getTime() + 7 * DAY + 12 * HOUR);   // "กลางวัน" ของวันที่ 8
const week = dayBoundsInTimeZone(probe, timeZone);                      // หาขอบวันจริงของวันนั้น
return { …, weekEnd: week.start };
```

เล็ง "เที่ยงวัน" แทน "เที่ยงคืน" — คลาดไป ±1 ชม. จาก DST ก็ยังอยู่ในวันเดียวกัน แล้วให้ฟังก์ชันหาขอบวันจริง
เทสต์ใช้นิวยอร์กช่วงสิ้นสุด DST วันที่ 1 พ.ย. 2026: ต้นสัปดาห์ offset `-04:00` ปลายสัปดาห์ `-05:00`

🎤 _"เคยเจอ bug เรื่องเวลาไหม?"_ → เล่าเรื่องตี 1 ที่กลายเป็นเมื่อวาน และ 7 × 24 ชม. ที่ไม่ใช่ 7 วัน

---

## 3. `GET /tasks/sidebar` — การนับด้วย SQL (ขั้นที่ 7)

### 3.1 สิ่งที่ต้องคืน

```json
{
  "smartLists": { "all": 24, "inbox": 12, "today": 4, "week": 8, "overdue": 1 },
  "projects": [{ "id": "…", "name": "NOSION Core", "color": "#6366f1", "count": 9 }],
  "topTags": [{ "id": "…", "name": "dev", "count": 7 }]
}
```

ทำไมรวมเป็นคำขอเดียว: sidebar แสดงพร้อมกันทั้งก้อน — แยก 3 endpoint = 3 round-trip และตัวเลขมาไม่พร้อมกัน

### 3.2 พื้นฐาน: COUNT และ GROUP BY

```sql
-- นับทั้งหมด → ได้ 1 แถว
SELECT COUNT(*) FROM entries WHERE "userId" = $1 AND status IN ('pending','active');

-- นับแยกกลุ่ม → ได้ 1 แถวต่อโปรเจกต์
SELECT "projectId", COUNT(*) FROM entries
WHERE "userId" = $1 AND status IN ('pending','active') AND "projectId" IS NOT NULL
GROUP BY "projectId";
```

`GROUP BY` = แบ่งแถวเป็นกองตามค่าของคอลัมน์ แล้วรัน aggregate (`COUNT`, `SUM`, `AVG`) ต่อกอง

**ทำไมให้ฐานข้อมูลนับ ไม่ดึงมานับใน JS:** ผู้ใช้มีงาน 5,000 ชิ้น → ดึงมานับ = ส่ง 5,000 แถวผ่าน network
ให้ DB นับ = ส่งตัวเลขกลับมาตัวเดียว และใช้ index ได้

**Index ที่ช่วย:** Phase 0 มี `@@index([userId, status, occurredAt])` อยู่แล้ว
เงื่อนไข `userId = ? AND status IN (…) AND occurredAt < ?` ใช้ index นี้ได้ครบทั้งสามคอลัมน์ตามลำดับ
(หลัก leftmost prefix จากบท 03)

### 3.3 ใน Prisma

📁 `task-stats.service.ts`

```ts
const open = { userId, module: 'task', deletedAt: null, status: { in: ['pending','active'] } };

const [all, inbox, today, week, overdue, perProject, projects, perTag] = await Promise.all([
  prisma.entry.count({ where: open }),
  prisma.entry.count({ where: { ...open, projectId: null, occurredAt: null } }),
  prisma.entry.count({ where: { ...open, occurredAt: { lt: r.todayEnd } } }),
  prisma.entry.count({ where: { ...open, occurredAt: { gte: r.todayStart, lt: r.weekEnd } } }),
  prisma.entry.count({ where: { ...open, occurredAt: { lt: now } } }),
  prisma.entry.groupBy({ by: ['projectId'], where: { ...open, projectId: { not: null } }, _count: { _all: true } }),
  prisma.project.findMany({ where: { userId, isArchived: false, deletedAt: null }, … }),
  prisma.entryTag.groupBy({ by: ['tagId'], where: { entry: open }, _count: { tagId: true },
                           orderBy: { _count: { tagId: 'desc' } }, take: 6 }),
]);
```

- `where: { entry: open }` บน `entryTag` = **กรองผ่าน relation** — Prisma แปลงเป็น JOIN ให้
- `orderBy _count … take 6` = "แท็กยอดนิยม 6 อันดับ" ทำใน SQL ทั้งหมด

### 3.4 นิยามที่ต้องตัดสินใจ (และเขียนเป็นเทสต์)

| smart list    | เงื่อนไข                            | เหตุผล                                        |
| ------------- | ----------------------------------- | --------------------------------------------- |
| วันนี้        | `occurredAt < ต้นวันพรุ่งนี้`       | **รวมงานที่เลยกำหนด** — ยังต้องทำวันนี้อยู่ดี |
| 7 วันข้างหน้า | `[ต้นวันนี้, ต้นวันที่ 8)`          | ไม่รวมที่เลยกำหนด — เป็นมุมมอง "วางแผน"       |
| Inbox         | ไม่มีโปรเจกต์ **และ** ไม่มีวันกำหนด | งานที่ "ยังไม่ได้จัดที่" (สเปก 8.11.2)        |

integration test 📁 `apps/api/test/tasks.int-spec.ts` สร้างงานครอบทุกกรณี (เลยกำหนด, อีก 3 วัน, อีก 30 วัน, เสร็จแล้ว,
ของผู้ใช้อื่น) แล้วเทียบตัวเลขทุกช่อง — นิยามอยู่ในเทสต์ ไม่ใช่ในหัวคน

### 3.5 `Promise.all` vs `$transaction` — ความสอดคล้องของการอ่าน

`Promise.all` ยิง 8 query **พร้อมกัน** บน connection คนละเส้น → เร็ว
แต่ถ้ามีคนติ๊กงานเสร็จระหว่าง query ที่ 1 กับ 5 ตัวเลขอาจไม่ตรงกันเล็กน้อย (all นับก่อน, today นับหลัง)

`$transaction([...])` ใน PostgreSQL ค่าเริ่มต้น (READ COMMITTED) **ก็ไม่รับประกันว่าเห็น snapshot เดียวกัน**
ทุก statement ต้องใช้ REPEATABLE READ ถึงจะเห็นภาพเดียวกัน แลกกับถือ connection ยาวขึ้นและรันทีละ query

เราเลือก `Promise.all`: ตัวเลขใน sidebar คลาดกันเสี้ยววินาทีไม่มีใครเสียหาย และหน้าจอ refetch ใหม่อยู่แล้วหลัง mutation

🎤 _"Isolation level คืออะไร?"_ → ระดับที่ transaction หนึ่งมองเห็นการเปลี่ยนแปลงของ transaction อื่น
READ COMMITTED (เห็นของที่ commit แล้ว ณ ตอนแต่ละ statement) → REPEATABLE READ (เห็น snapshot เดียวตลอด) → SERIALIZABLE (เหมือนรันทีละคน)

### 3.6 ช่องโหว่ที่เกือบเกิด: `groupBy` ไม่ถูกคุ้มครอง

บท 04 หัวข้อ IDOR: 📁 `prisma.service.ts` → `forUser()` เติม `userId` ให้ทุก query อัตโนมัติ (ชั้นป้องกันที่สอง)
แต่รายการ operation ที่มันดักคือ `findFirst, findMany, updateMany, deleteMany, count, aggregate` — **ไม่มี `groupBy`**

ถ้าพึ่ง extension อย่างเดียวแล้วลืมใส่ `userId` ใน `groupBy` = นับแท็กของผู้ใช้ทุกคนรวมกัน
→ service นี้ใส่ `userId` เองทุก query และมีเทสต์ "งานของ bob ต้องไม่ถูกนับ"

📌 บทเรียน: **defense in depth ต้องรู้ว่าแต่ละชั้นครอบคลุมอะไรบ้าง** ชั้นที่ "น่าจะ" ครอบคลุมคือชั้นที่อันตรายที่สุด

### 3.7 แยกการประกอบผลลัพธ์เป็น pure function

`buildSidebar()` รับตัวเลขดิบแล้วประกอบ DTO — เทสต์ได้โดยไม่มี DB:

- โปรเจกต์ที่ไม่มีงานค้างได้ `count: 0` (ยังแสดง — เพิ่งสร้างแล้วหายจาก sidebar จะงง)
- แท็กที่หาชื่อไม่เจอ (ถูกลบระหว่าง query) ถูกทิ้ง ไม่คืน `name: undefined`

---

## 4. บั๊กที่เจอระหว่างทาง: boolean ใน query string

`GET /entries?overdue=false` เคยคืน **งานที่เลยกำหนด**

```ts
overdue: z.coerce.boolean(); // coerce = Boolean(value)
Boolean('false'); // → true   (string ที่ไม่ว่าง = truthy ใน JavaScript)
```

query string ทุกค่าเป็น **string** เสมอ ไม่มี boolean จริง
📁 `packages/contracts/src/entry.ts` → `queryBool` รับเฉพาะ `true/false/1/0` ค่าอื่น = 422

🎤 เป็นคำถามสัมภาษณ์ที่ดี: _"`z.coerce.boolean()` กับ `'false'` ได้อะไร?"_ — คนส่วนใหญ่ตอบผิด

---

## 5. Focus timer — ออกแบบตั้งแต่ข้อมูล (ขั้นที่ 8)

### 5.1 เก็บอะไร ที่ไหน

ทางเลือก:

| ทาง                                          | ข้อดี                                          | ข้อเสีย                                                       |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| A. เก็บ `timerStartedAt` ใน `payload` ของงาน | ไม่ต้องสร้างตาราง                              | ตอบ "วันนี้โฟกัสไปกี่รอบ" ไม่ได้ · กันจับสองงานพร้อมกันไม่ได้ |
| **B. ตาราง `focus_sessions` หนึ่งแถวต่อรอบ** | มีประวัติ, query รายวันได้, ใส่ constraint ได้ | ต้อง migration                                                |

เลือก B 📁 `apps/api/prisma/schema.prisma`

```prisma
model FocusSession {
  id              String    @id @default(cuid(2))
  userId          String
  entryId         String
  startedAt       DateTime  @default(now())
  endedAt         DateTime?          /// null = กำลังจับอยู่
  durationSeconds Int?               /// คำนวณตอนหยุด
  @@index([userId, startedAt])       /// "รอบของฉันวันนี้"
  @@index([entryId])
}
```

`durationSeconds` เก็บซ้ำทั้งที่คำนวณจาก `endedAt - startedAt` ได้ — เพราะมี **เพดาน** (หัวข้อ 5.6)
ค่าที่ถูกจำกัดแล้วต้องเก็บไว้ ไม่งั้นทุกที่ที่อ่านต้องจำกติกาเพดานเอง

และเพิ่ม `UserSettings.focusGoalMinutes` (ค่าเริ่มต้น 240 = "4 ชม." ใน mockup)

### 5.2 Migration

📁 `apps/api/prisma/migrations/20260930090000_focus_sessions/migration.sql`

- `ADD COLUMN … NOT NULL DEFAULT 240` — **ปลอดภัยกับแถวเดิม** (PostgreSQL 11+ เพิ่มคอลัมน์ที่มี default ค่าคงที่ได้ทันทีโดยไม่เขียนทุกแถวใหม่)
- `CREATE TABLE` ใหม่ไม่กระทบของเดิม — ทั้ง migration เป็น **additive** (เพิ่มอย่างเดียว) จึง deploy ได้โดยไม่ต้องปิดระบบ
- `ON DELETE CASCADE` — ลบงาน/ผู้ใช้แล้วรอบจับเวลาหายตาม (ไม่มีแถวกำพร้า)

### 5.3 State machine ของตัวจับเวลา

```
             start(A)                 stop(A)
  [ว่าง] ──────────────▶ [จับ A] ──────────────▶ [ว่าง]
                          │  ▲
                start(A)  │  │  (idempotent — ได้รอบเดิม)
                          ▼  │
                         [จับ A] ──start(B)──▶ [จับ B]   (หยุด A ให้อัตโนมัติ)

  stop(A) ขณะ [ว่าง] หรือ [จับ B]  →  409 timer_not_running
  start(งานที่เสร็จแล้ว)            →  409 entry_closed
```

การวาด state machine ก่อนเขียนโค้ดบังคับให้ตอบทุกคู่ (สถานะ × การกระทำ) — คู่ที่ไม่ได้คิดคือที่มาของ bug

**HTTP status ที่เลือก:**

- start/stop คืน **200** ไม่ใช่ 201 (`@HttpCode(HttpStatus.OK)`) — start ซ้ำไม่ได้ "สร้าง" อะไรใหม่เสมอไป
- ผิดสถานะ = **409 Conflict** ผ่าน `InvalidStateError` ใหม่ใน 📁 `packages/core/src/errors.ts`
  (domain error ไม่รู้จัก HTTP — ตัวแปลงอยู่ที่ 📁 `common/problem.filter.ts` ตามกฎข้อ 5 ของ ADR-006)
- งานของคนอื่น = **404** ไม่ใช่ 403 — ไม่บอกว่ามี id นี้อยู่จริง (บท 04)

---

## 6. Race condition — หัวใจของบทนี้

### 6.1 ปัญหา: check-then-act

โค้ดที่ดูถูกต้อง:

```ts
const running = await db.focusSession.findFirst({ where: { userId, endedAt: null } });  // 1. เช็ค
if (!running) await db.focusSession.create({ … });                                      // 2. ทำ
```

ผู้ใช้เปิดสองแท็บแล้วกด "เริ่ม" พร้อมกัน:

```
เวลา   คำขอ X                     คำขอ Y
 t1    findFirst → ไม่มี
 t2                               findFirst → ไม่มี      ← X ยังไม่ได้ create
 t3    create ✔
 t4                               create ✔               ← ได้ 2 รอบซ้อนกัน
```

เรียกว่า **TOCTOU** (Time-Of-Check to Time-Of-Use) — ระหว่าง "เช็ค" กับ "ทำ" โลกเปลี่ยนไปแล้ว
ห่อด้วย transaction ก็ **ไม่ช่วย** ที่ READ COMMITTED: ทั้งสอง transaction อ่านไม่เจอแถวที่อีกฝั่งยังไม่ commit

### 6.2 ทางแก้: ให้ฐานข้อมูลเป็นคนตัดสิน — partial unique index

```sql
CREATE UNIQUE INDEX "focus_sessions_one_running_per_user"
  ON "focus_sessions" ("userId")
  WHERE "endedAt" IS NULL;
```

- **Unique index** = ห้ามมีสองแถวที่ค่าคอลัมน์ซ้ำกัน
- **Partial** (`WHERE …`) = บังคับเฉพาะแถวที่ตรงเงื่อนไข → รอบที่จบแล้วซ้ำ `userId` กันได้ไม่จำกัด
  แต่รอบที่ยังไม่จบ (`endedAt IS NULL`) มีได้แค่ 1 ต่อผู้ใช้

ใน timeline ข้างบน ที่ t4 PostgreSQL ปฏิเสธ `create` ของ Y ด้วย unique violation (Prisma error `P2002`)
**ไม่ว่าจะมีกี่ server กี่ process** — กฎอยู่ที่จุดเดียวที่ทุกคนต้องผ่าน

Prisma ประกาศ partial index ใน `schema.prisma` ไม่ได้ → เขียน SQL เองใน migration
และบันทึกซ้ำใน 📁 `apps/api/prisma/sql/custom_indexes.sql` (แหล่งรวม index พิเศษตั้งแต่ Phase 0)

### 6.3 จัดการตอนแพ้ให้เป็นมิตร

📁 `focus-timer.service.ts` → `start()`

```ts
try {
  return await prisma.$transaction(async (tx) => { … create … });
} catch (err) {
  if (!isUniqueViolation(err)) throw err;
  const winner = await prisma.focusSession.findFirst({ where: { userId, endedAt: null } });
  if (winner?.entryId === entryId) return toDto(winner);   // แพ้ให้ตัวเอง (กดซ้ำ) → คืนรอบของผู้ชนะ
  throw new InvalidStateError('มีงานอื่นกำลังจับเวลาอยู่ ลองใหม่อีกครั้ง', 'timer_busy');
}
```

ผลคือผู้ใช้กด "เริ่ม" 5 ครั้งพร้อมกันได้รอบเดียวและทุกคำขอได้ 200 —
integration test "start พร้อมกัน 5 คำขอ → ได้รอบเดียว" ยืนยันพฤติกรรมนี้

📌 **โค้ดตรวจเพื่อ UX ที่ดี · ฐานข้อมูลตรวจเพื่อความถูกต้อง** — ต้องมีทั้งสองชั้น

### 6.4 Stop ซ้ำ — conditional update

สองคำขอ stop พร้อมกัน ถ้าทั้งคู่บวกเวลาเข้างาน `actualMinutes` จะนับซ้ำ

```ts
const closed = await tx.focusSession.updateMany({
  where: { id: session.id, userId, endedAt: null },     // ← ปิดได้เฉพาะรอบที่ยังไม่ปิด
  data:  { endedAt: now, durationSeconds: seconds },
});
if (closed.count === 0) throw new InvalidStateError(…, 'timer_not_running');
```

PostgreSQL ล็อกแถวระหว่าง `UPDATE` → คำขอที่สองรอจนคำขอแรก commit แล้วประเมิน `WHERE` ใหม่
พบว่า `endedAt` ไม่ใช่ null แล้ว → อัปเดต 0 แถว → เราตอบ 409 และ **ไม่บวกเวลา**
เทคนิคเดียวกับ optimistic concurrency ด้วย `version` ในบท 06 — ใส่ "สถานะที่คาดหวัง" ไว้ใน `WHERE`

### 6.5 Transaction แบบ interactive

```ts
prisma.$transaction(async (tx) => {
  const running = await tx.focusSession.findFirst(…);
  if (running) await this.finish(tx, …);     // ปิดรอบเก่า + บวกนาทีเข้างานเก่า
  const created = await tx.focusSession.create(…);
  await tx.entry.updateMany(…pending → active…);
  return created;
});
```

**ACID** ย่อ: ทุกคำสั่งใน transaction สำเร็จทั้งหมดหรือไม่มีอะไรเกิดขึ้นเลย (Atomicity)
ถ้า `create` ล้ม (เช่นชน unique index) การปิดรอบเก่าและการบวกนาทีจะถูก **rollback** ด้วย
ไม่มีสภาพ "หยุดงาน A แล้วแต่เริ่มงาน B ไม่สำเร็จ"

⚠️ ต้องใช้ `tx` ทุกคำสั่งข้างใน — เผลอใช้ `this.prisma` จะเป็นอีก connection ที่อยู่นอก transaction
(ฟังก์ชัน `finish()` จึงรับ `tx` เป็นพารามิเตอร์)

### 6.6 Idempotency

**Idempotent** = ทำซ้ำกี่ครั้งผลเหมือนทำครั้งเดียว — สำคัญเพราะ network ไม่น่าเชื่อถือ:
client ส่งคำขอ → server ทำสำเร็จ → response หายระหว่างทาง → client retry

- `start(A)` ขณะจับ A อยู่แล้ว → คืนรอบเดิม ✔ idempotent
- `stop(A)` ครั้งที่สอง → 409 แต่ **ไม่มีผลข้างเคียงซ้ำ** (ไม่บวกเวลาซ้ำ) ✔ ปลอดภัยต่อการ retry

---

## 7. คำนวณ "เวลาโฟกัสวันนี้"

📁 `focus.ts` (pure) + `focus.spec.ts`

### 7.1 เพดานของรอบเดียว

ลืมกดหยุดแล้วปิดคอมไปนอน → เช้ามากดหยุด = "โฟกัส 9 ชั่วโมง"
`sessionSeconds()` จำกัดที่ **4 ชั่วโมง** และไม่ติดลบ (นาฬิกาเครื่องย้อน)
ตัวเลขนี้เป็นการตัดสินใจเชิงผลิตภัณฑ์ที่สเปกไม่ได้ระบุ — บันทึกไว้ใน phase log

### 7.2 รอบที่คร่อมเที่ยงคืน

| กรณี                                                  | นับอย่างไร                                         |
| ----------------------------------------------------- | -------------------------------------------------- |
| รอบที่ **จบแล้ว** 23:30–00:30                         | ทั้งรอบเป็นของวันที่ **เริ่ม** (ง่าย, ไม่ต้องแบ่ง) |
| รอบที่ **กำลังจับ** เริ่ม 23:30 เมื่อวาน ตอนนี้ 00:20 | นับเฉพาะ 20 นาทีที่อยู่ในวันนี้                    |

การ์ดตอนเช้าไม่ควรเริ่มวันใหม่ด้วยตัวเลขของเมื่อคืน — เทสต์ "รอบที่เริ่มเมื่อวานแล้วยังจับอยู่" ล็อกพฤติกรรมนี้

### 7.3 ปัดนาทีเข้างาน

`payload.actualMinutes` เป็นจำนวนเต็ม → `Math.round(seconds / 60)` (29 วิ = 0, 30 วิ = 1)
ข้อเสียที่ยอมรับ: ปัดทุกรอบ สะสมคลาดได้ ≤ 30 วินาทีต่อรอบ — เวลาจริงยังอยู่ครบใน `durationSeconds`

---

## 8. ทดสอบอย่างไรเมื่อบางอย่างรันในเครื่องไม่ได้

| ชั้น                          | ไฟล์                                                                                                          | รันที่ไหน           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------- |
| Unit (pure function)          | `task-ranges.spec.ts`, `focus.spec.ts`, `task-stats.service.spec.ts`, `completed-at.spec.ts`, `entry.test.ts` | ทุกที่ ~1 วิ        |
| Typecheck ทั้ง monorepo       | `turbo run typecheck`                                                                                         | ทุกที่              |
| Integration (DB + Redis จริง) | `apps/api/test/tasks.int-spec.ts`                                                                             | CI (docker-compose) |

**Integration test ของ race condition** ยิง 5 คำขอพร้อมกันด้วย `Promise.all` แล้วนับ id ที่ไม่ซ้ำ —
unit test ที่ mock ฐานข้อมูลพิสูจน์ข้อนี้ไม่ได้เลย เพราะ constraint อยู่ในฐานข้อมูล (หลักเดียวกับบท 08)

**เรื่องจริงระหว่างพัฒนา:** sandbox ที่ใช้เขียนโค้ดดาวน์โหลด Prisma engine ไม่ได้ (403)
→ `prisma generate` ด้วย engine ปลอม (`PRISMA_QUERY_ENGINE_LIBRARY`, `PRISMA_SCHEMA_ENGINE_BINARY`)
เพื่อให้ได้ **type** ของ Prisma client มา typecheck — client ใช้ต่อฐานข้อมูลจริงไม่ได้ แต่ TypeScript ไม่ต้องต่อ
integration test จึงรอรันใน CI และเขียนไว้ตรง ๆ ใน phase log ว่า "ยังไม่ได้รัน"

---

## ข้อเสียที่ยอมรับ

- sidebar อ่านแบบ `Promise.all` ตัวเลขอาจคลาดกันเสี้ยววินาที
- เพดาน 4 ชม./รอบ เป็นค่าคงที่ ยังไม่ให้ผู้ใช้ตั้งเอง
- timer ไม่ยิง `entry.updated` event (ยังไม่มีผู้ฟัง) — Phase 4 (SSE realtime) ต้องกลับมาเพิ่ม
  ไม่งั้นอีกแท็บจะไม่เห็น `actualMinutes` เปลี่ยนจนกว่าจะ refetch
- รอบที่จบแล้วนับทั้งรอบตามวันที่เริ่ม ไม่แบ่งตามเที่ยงคืน

---

## แบบฝึกหัดท้ายบท

1. ลบ partial unique index ออกจาก migration (ในฐานข้อมูล dev) แล้วรัน integration test "start พร้อมกัน 5 คำขอ" — ผลเป็นอย่างไร?
2. ใน `finish()` ลบ `endedAt: null` ออกจาก `where` แล้วยิง stop สองครั้งพร้อมกัน — `actualMinutes` เพิ่มกี่เท่า?
3. เปลี่ยน `taskRanges` เป็น `todayStart + 7 * 24h` แล้วรัน `task-ranges.spec.ts` — เคสไหนพัง? อธิบายด้วยหัวข้อ 2.4
4. ลอง `z.coerce.boolean().parse('false')` ใน Node REPL — แล้วอธิบายว่าทำไม `queryBool` ต้องรับ `'0'` ด้วย
5. ออกแบบ: ถ้าจะให้ "เป้าหมายโฟกัส" ต่างกันวันธรรมดา/วันหยุด ต้องเปลี่ยน schema อย่างไร และ migration ต้อง additive ได้ไหม
