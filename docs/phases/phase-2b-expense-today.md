# Phase 2b · Expense + Today (สัปดาห์ 7–9)

> เป้าหมาย: โมดูลการเงินใช้งานได้จริง (รายจ่าย งบ บิล คาดการณ์) และหน้า Today ที่รวม widget ทุกโมดูล — สเปก 15 Phase 2b, 7.3, 8.11.1, 8.11.3
> **DoD:** ใช้แอปบันทึกรายจ่ายจริงของตัวเองได้ตลอดสัปดาห์ · ตัวเลขในหน้า Today ถูกต้อง ·
> Today / Tasks / Expenses ตรงกับ mockup ทั้ง dark + light บน desktop + mobile · axe 0 serious ทั้ง 2 ธีม
> ความรู้เบื้องหลัง: [15 เงิน, เดือนตามโซนเวลา, โมดูลที่สอง](../learn/15-phase2b-money-months-and-second-module.md)

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                          | Commit              | สถานะ |
| --- | ----------------------------------------------------------------------------- | ------------------- | ----- |
| 1   | API: ExpenseModule + NL parser + helper เงิน/เดือน                            | `6cc6284`           | ✅    |
| 2   | API: Budget CRUD + `GET /budgets/status` (กฎสี 85% / 100%)                    | `048ad51` `8c0d1c1` | ✅    |
| 3   | API: `/expenses/summary`, `/forecast`, `/trends`, `/bills/upcoming`           | `b1a9493`           | ✅    |
| 4   | API: `GET /today` + `GET /tasks/standup/today?format=markdown`                |                     | ⏳    |
| 5   | Web: หน้า Expenses (quick capture, KPI 3 การ์ด, บิล, หมวด, transactions, CSV) |                     | ⏳    |
| 6   | Web: หน้า Today (hero, widget registry, Developer Quick Actions, standup)     |                     | ⏳    |
| 7   | Web: Analytics (donut, trend, fixed vs variable) + empty/error/skeleton       |                     | ⏳    |
| 8   | Seed demo account ชุดเดียวกับ mockup · visual + axe ของหน้าใหม่               |                     | ⏳    |
| 9   | Deploy staging (deploy-staging.yml)                                           |                     | ⏳    |

**Phase 2a ปิดแล้ว:** baseline อนุมัติ (`5e38508`) · CI เขียวทั้ง 8 job — ทุกขั้นของ 2b push แล้วรอ CI เขียวก่อนไปขั้นถัดไป

---

## ขั้น 1 · API: ExpenseModule — `6cc6284`

📚 **ความรู้พื้นฐาน:** IEEE 754 / ทำไมเงินต้องเป็น integer, ขอบเดือนตามโซนเวลา, plugin architecture, regex named group / lazy,
longest match, table-driven test → บท [15](../learn/15-phase2b-money-months-and-second-module.md) หัวข้อ 1–4

**เป้าหมาย:** โมดูลการเงินเข้า registry → `POST /entries { module: 'expense' }` ใช้ได้ และมีเครื่องมือพื้นฐาน
(เงิน, ขอบเดือน, แปลงข้อความ) ให้ขั้น 2–4 ใช้ต่อ

**สิ่งที่เปลี่ยน**

- 📁 `apps/api/src/modules/expense/`
  - `expense.trackable.ts` — `@RegisterModule()` · ปฏิทินขึ้นเฉพาะบิล · `summarizeToday` ("วันนี้ใช้ ฿340") ·
    `summarizeWeek` (หมวดที่ใช้มากสุด + %) · `isSpent()` / `sumSpent()` กฎ "ใช้จ่ายจริง" ที่เดียว
  - `expense-text.ts` — `parseExpenseText` ("กาแฟ 65", "เงินเดือน 45000", "ค่าเน็ต 799 ทุกวันที่ 5"),
    `guessCategory` (คำที่ยาวที่สุดชนะ), `nextDueDate` (clamp วันที่ 31 → วันสุดท้ายของเดือน)
  - `expense.module.ts` + 📁 `app.module.ts` แก้ 2 บรรทัด — ไม่แตะ entries / registry / core
- 📁 `packages/core/src/money.ts` — `formatMoney`, `parseAmountToMinor` (ต่อสตริง ไม่ผ่าน float), `currencyDigits` (จาก Intl)
- 📁 `packages/core/src/time.ts` — `monthBoundsInTimeZone`, `periodBounds(period, tz, shift)`, `PERIOD_PATTERN`

**การตัดสินใจ**

- บิลที่ยังไม่จ่าย **ไม่นับ** เป็นรายจ่าย — เป็นภาระที่จะมาถึง (ขั้น 3 ใช้ในคาดการณ์แยกต่างหาก)
- รายจ่ายทั่วไปจาก parser: `occurredAt = now`, ไม่ใช่ทั้งวัน · บิล: `occurredAt = วันครบกำหนด` ทั้งวัน
- `costType = fixed` เฉพาะเมื่อเป็นบิล (ไม่เดาจากหมวด — Netflix ที่จ่ายครั้งเดียวไม่ใช่ fixed)
- สีโมดูล `#71717a` (เทา) ตาม v1.1 ที่ตัดสีรุ้งประจำโมดูล
- "ทุกวันที่ N" ยังไม่สร้าง rrule (Phase 3) — ได้แค่ `isBill` + วันครบกำหนดครั้งถัดไป
- **เพิ่มเอง (สเปกไม่ได้ระบุ):** รายรับจับจากคำ "เงินเดือน / รายรับ / ได้เงิน / โบนัส" หรือขึ้นต้นด้วย `+`

**วิธีตรวจ**

- unit: core +16 (money 11, เดือน 5 รวม DST New York + ปีอธิกสุรทิน) · expense 34 (parser table-driven 14 เคส + 6 เคสปฏิเสธ, trackable 7)
- integration 📁 `test/expenses.int-spec.ts`: `/entries` รับ expense + เติม default จาก schema · payload ผิด (`65.5`, หมวดไม่มี) → **422**
  (ครั้งแรกเขียนเทสต์คาด 400 — โปรเจกต์นี้ตอบ Zod error เป็น 422 ใน `ProblemDetailsFilter`)
- `pnpm test:int:local` 21/21 · lint · typecheck · prettier

**สิ่งที่ค้าง**

- ยังไม่มี `/parse` กลาง (Phase 5) — parser ของโมดูลยังเรียกจาก HTTP ไม่ได้ · หน้า Expenses (ขั้น 5) จะ parse ฝั่ง client ด้วยกฎชุดเดียวกันหรือเปิด endpoint ชั่วคราว (ตัดสินใจในขั้น 5)
- พจนานุกรมหมวดเขียนมือ · คำสั้น (`ยา`, `true`) จับผิดได้

---

## ขั้น 2 · API: งบประมาณ — `048ad51` `8c0d1c1`

📚 **ความรู้พื้นฐาน:** NULL กับ unique constraint, partial unique index, รวมยอดใน JS vs SQL,
กฎทางธุรกิจที่เดียวใน contracts → บท [15](../learn/15-phase2b-money-months-and-second-module.md) หัวข้อ 5

**เป้าหมาย:** ข้อมูลของ KPI "รายจ่ายเดือนนี้ ฿8,420 / ฿15,000 56.1%" และ bar รายหมวด (สเปก 8.11.3)

**สิ่งที่เปลี่ยน**

- 📁 `packages/contracts/src/expenses.ts` — `budgetTone()` (safe / warning ≥ 85% / over ≥ 100%), `BUDGET_WARNING_RATIO`,
  `createBudgetSchema`, `updateBudgetSchema`, `periodQuerySchema`, `BudgetDto`, `BudgetStatusDto`
- 📁 `apps/api/src/modules/expense/`
  - `budgets.controller.ts` — `GET/POST /budgets`, `PATCH/DELETE /budgets/:id`, `GET /budgets/status?period=YYYY-MM`
  - `budgets.service.ts` — CRUD · ซ้ำ (P2002) → 409 · ไม่เจอ / ของคนอื่น → 404
  - `expense-stats.service.ts` — `monthWhere()` (ไม่มี occurredAt ใช้ createdAt) · `budgetStatus()`
  - `budget-status.ts` — `spentByCategory()`, `buildBudgetStatus()` (pure)
  - `isSpent()` รับแค่ `status / deletedAt / payload` → query ที่ select 3 คอลัมน์เรียกได้
- 📁 `apps/api/prisma/migrations/20261001150000_budget_one_total/` — partial unique index งบรวม

**บั๊กที่เจอระหว่างทาง (`048ad51`)**

unique `("userId", "category", "period")` จาก migration แรกกัน **งบรวม** (`category IS NULL`) ซ้ำไม่ได้ —
ใน Postgres `NULL = NULL` ไม่เป็นจริง จึงไม่ถือว่าชน · ทดลอง INSERT สองก้อนในฐานเทสต์ (ภายใน transaction แล้ว ROLLBACK) ผ่านทั้งคู่
→ เพิ่ม `CREATE UNIQUE INDEX … ("userId", "period") WHERE "category" IS NULL`

**การตัดสินใจ**

- **งบรวม** = ก้อน `category = null` ถ้ามี · ไม่มีแต่ตั้งรายหมวดไว้ = ผลรวมรายหมวด (`budgetSource` บอกที่มา) _(สเปกไม่ได้ระบุ — ตัดสินเอง)_
- `categories` = ทุกหมวดที่ **มีงบ หรือ มีรายจ่าย** เรียงตามยอดใช้ · หมวดที่ใช้แต่ไม่ได้ตั้งงบได้ `budgetMinor: null`
- `ratio` ไม่ถูกตัดที่ 1 (1.12 = เกิน 12%) — UI ตัดเองตอนวาด bar แต่ข้อความ "เกิน 12%" ต้องใช้ค่าจริง
- รวมยอดใน JS ไม่ใช่ SQL `GROUP BY payload->>'category'` — กฎ "ใช้จ่ายจริง" อยู่ที่ `isSpent()` ที่เดียว
  (ข้อมูลบุคคลต่อเดือนหลักร้อยแถว) · ถ้าโตถึงหลักหมื่นค่อยเปลี่ยนเป็น raw SQL + expression index
- `budgetTone` อยู่ใน contracts — web มี `lib/progress.ts` ที่เกณฑ์เดียวกันอยู่แล้ว **ขั้น 5 จะเปลี่ยนให้ import จาก contracts** (ตอนนี้ซ้ำกัน 2 ที่)
- ลบงบ = ลบจริง (ไม่ soft delete) — ไม่มีอะไรอ้างถึง budget และไม่ต้องกู้คืน
- สกุลเงินของงบ = `UserSettings.currency` ตอนสร้าง (ยังไม่รองรับหลายสกุลในงบเดียว)

**วิธีตรวจ**

- unit: contracts `expenses.test.ts` (budgetTone 85%/100% พอดี, schema) · `budget-status.spec.ts` 7 เคส (ตัวอย่าง mockup ฿8,420/฿15,000 + อาหาร 87%)
- integration (`expenses.int-spec.ts`): CRUD · งบรวมซ้ำ 409 · หมวดซ้ำ 409 · คนอื่นตั้งงบรวมได้ · IDOR 404 ·
  **รายจ่าย 1 ก.ย. 01:00 เวลาไทย (31 ส.ค. UTC) นับในเดือนกันยายน** · 1 ต.ค. 00:30 ไม่นับ · ไม่รวมรายรับ/บิลค้าง/ของคนอื่น · period ผิด 422
- `pnpm test:int:local` 25/25 · `prisma migrate diff` No difference · lint/typecheck/unit ทั้ง monorepo

**สิ่งที่ค้าง**

- `alertThreshold` / `alertSentAt` ยังไม่ใช้ — job `budget-alert` อยู่ใน Phase 4
- web ยังมีเกณฑ์ 85% ซ้ำใน `lib/progress.ts` (แก้ในขั้น 5)

---

## ขั้น 3 · API: summary / forecast / trends / bills — `b1a9493`

📚 **ความรู้พื้นฐาน:** run-rate forecast, fixed vs variable, การแบ่งถังเวลา (bucketing), JSON path filter,
วันปฏิทินกับ DST → บท [15](../learn/15-phase2b-money-months-and-second-module.md) หัวข้อ 6

**เป้าหมาย:** ข้อมูลของ KPI 2–3 และการ์ดบิล/หมวด/กราฟในหน้า Expenses (สเปก 8.11.3)

**Endpoint**

| Method | Path                               | ผล                                                                      |
| ------ | ---------------------------------- | ----------------------------------------------------------------------- |
| `GET`  | `/expenses/summary?period=YYYY-MM` | รายจ่าย/รายรับ/net · fixed/variable · หมวด + `share`                    |
| `GET`  | `/expenses/forecast`               | `projectedMinor`, `marginMinor`, `status`, `series[]` (เดือนปัจจุบัน)   |
| `GET`  | `/expenses/trends?months=6`        | `points[]` เก่า→ใหม่ ต่อเดือน: expense/income/fixed/variable/byCategory |
| `GET`  | `/expenses/bills/upcoming?days=7`  | `bills[]`, `fixedMonthlyMinor`, `dueSoonCount`, `overdueCount`          |

**สิ่งที่เปลี่ยน**

- 📁 `apps/api/src/modules/expense/expense-analytics.ts` — `buildSummary`, `buildForecast`, `buildTrends`, `buildBills`, `daysBetween` (pure)
- 📁 `expense-stats.service.ts` — `rangeWhere()` (เดิม `monthWhere`), select ฟิลด์ชุดเดียว, 4 method ใหม่
- 📁 `expenses.controller.ts` · 📁 `budget-status.ts` แยก `resolveTotalBudget()` ให้ forecast ใช้ร่วม
- 📁 `packages/contracts/src/expenses.ts` — DTO 4 ตัว + `trendsQuerySchema`, `billsQuerySchema`

**การตัดสินใจ**

- **คาดการณ์** = variable ถึงวันนี้ × (วันในเดือน ÷ วันที่ผ่านไป) + fixed ที่จ่ายแล้ว + บิลของเดือนที่ยังไม่จ่าย
  - ไม่คูณ fixed — จ่ายค่าเช่า ฿8,500 วันที่ 1 แล้วคูณ 30 จะได้ ฿255,000 (มีเทสต์)
  - ไม่ใช้ค่าเฉลี่ยเดือนก่อน / regression — ข้อมูลน้อยในช่วงแรกของผู้ใช้ และอธิบายผู้ใช้ได้ในประโยคเดียว
  - ต้นเดือน (วันที่ 1–3) ตัวเลขแกว่งแรงเพราะหารด้วยวันน้อย — ยอมรับ (ดู "สิ่งที่ค้าง")
- forecast รับเฉพาะเดือนปัจจุบัน (ไม่มี `?period`) — คาดการณ์เดือนที่จบแล้วไม่มีความหมาย
- **บิล**: เดือนนี้ทุกสถานะ + **บิลค้างจ่ายจากเดือนก่อน** (ไม่ให้บิลที่ลืมจ่ายหายไปเพราะข้ามเดือน) ·
  `fixedMonthlyMinor` นับเฉพาะบิลที่ครบกำหนดในเดือนนี้ · "ใกล้ครบ" = 0 ถึง `days − 1` วัน (7 → วันนี้ถึงอีก 6 วัน)
- `daysUntilDue` คำนวณจากวันปฏิทิน 'YYYY-MM-DD' สองค่า ไม่ใช่ (due − now) ÷ 24 ชม. — ไม่ขึ้นกับเวลาในวัน/DST
- trends ใช้ query เดียวทั้งช่วงแล้วแบ่งถังใน JS (ไม่ใช่ N query ต่อเดือน) · เดือนที่ไม่มีรายการได้ศูนย์ ไม่หายจากกราฟ
- `isBill` อยู่ใน JSONB → ใช้ Prisma JSON filter `payload: { path: ['isBill'], equals: true }` (ตรวจด้วย integration test เพราะ unit test พิสูจน์ไม่ได้)

**วิธีตรวจ**

- unit `expense-analytics.spec.ts` 9 เคส: daysBetween ข้ามปี · summary แยก fixed/variable + share รวม = 1 ·
  forecast (85.3% = warning, ค่าเช่าวันที่ 1, series เวลาไทย, เกินงบ) · trends เดือนว่าง + ขอบเดือน · bills เรียง/นับ/ค้างข้ามเดือน
- integration 4 เคส (เขียนให้ไม่ขึ้นกับวันที่รัน): summary ตรงตัวเลข · bills ผ่าน JSON filter, ค้างข้ามเดือนอยู่, จ่ายแล้วเดือนก่อนไม่อยู่, ไม่รวมของคนอื่น ·
  forecast ใช้งบเดียวกับ status · trends 3 จุดจบเดือนนี้ + `months=13` → 422
- `pnpm test:int:local` 29/29 · lint/typecheck/unit ทั้ง monorepo 20/20

**สิ่งที่ค้าง**

- คาดการณ์ต้นเดือนแกว่ง — ทางเลือกภายหลัง: ผสมกับค่าเฉลี่ยเดือนก่อนแบบถ่วงน้ำหนักตามวันที่ผ่านไป
- `/expenses/analytics`, `/expenses/bills` (หน้ารายละเอียด) ยังไม่มี — ขั้น 7
- รายการรายรับไม่มี "บิล" (เงินเดือนประจำ) — ยังไม่ต้องใช้
