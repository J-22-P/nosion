# Phase 2b · Expense + Today (สัปดาห์ 7–9)

> เป้าหมาย: โมดูลการเงินใช้งานได้จริง (รายจ่าย งบ บิล คาดการณ์) และหน้า Today ที่รวม widget ทุกโมดูล — สเปก 15 Phase 2b, 7.3, 8.11.1, 8.11.3
> **DoD:** ใช้แอปบันทึกรายจ่ายจริงของตัวเองได้ตลอดสัปดาห์ · ตัวเลขในหน้า Today ถูกต้อง ·
> Today / Tasks / Expenses ตรงกับ mockup ทั้ง dark + light บน desktop + mobile · axe 0 serious ทั้ง 2 ธีม
> ความรู้เบื้องหลัง: [15 เงิน, เดือนตามโซนเวลา, โมดูลที่สอง](../learn/15-phase2b-money-months-and-second-module.md)

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                          | Commit                        | สถานะ                   |
| --- | ----------------------------------------------------------------------------- | ----------------------------- | ----------------------- |
| 1   | API: ExpenseModule + NL parser + helper เงิน/เดือน                            | `6cc6284`                     | ✅                      |
| 2   | API: Budget CRUD + `GET /budgets/status` (กฎสี 85% / 100%)                    | `048ad51` `8c0d1c1`           | ✅                      |
| 3   | API: `/expenses/summary`, `/forecast`, `/trends`, `/bills/upcoming`           | `b1a9493`                     | ✅                      |
| 4   | API: `GET /today` + `GET /tasks/standup/today?format=markdown`                | `cae92c7` `5f7a4e1`           | ✅                      |
| 4b  | แก้บั๊ก: วันกำหนดแบบ date ล้วน / เลยกำหนดของงานทั้งวัน                        | `17192f0`                     | ✅                      |
| 5   | Web: หน้า Expenses (quick capture, KPI 3 การ์ด, บิล, หมวด, transactions, CSV) | `caefba4` `6140d9a` `41e7122` | ✅ (รออนุมัติ baseline) |
| 6   | Web: หน้า Today (hero, widget registry, Developer Quick Actions, standup)     |                               | ⏳                      |
| 7   | Web: Analytics (donut, trend, fixed vs variable) + empty/error/skeleton       |                               | ⏳                      |
| 8   | Seed demo account ชุดเดียวกับ mockup · visual + axe ของหน้าใหม่               |                               | ⏳                      |
| 9   | Deploy staging (deploy-staging.yml)                                           |                               | ⏳                      |

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

---

## ขั้น 4 · API: `GET /today` + standup — `cae92c7` `5f7a4e1`

📚 **ความรู้พื้นฐาน:** aggregator บน registry, MaybePromise, `Promise.allSettled` / partial failure, layering ด้วย lint,
ค่าที่คำนวณแทนการเก็บ, config ที่ถูกเมินเงียบ ๆ → บท [15](../learn/15-phase2b-money-months-and-second-module.md) หัวข้อ 7 · บท [08](../learn/08-testing-and-quality.md)

**เป้าหมาย:** ข้อมูลของหน้า Today ทั้งหน้าในคำขอเดียว (สเปก 7.4) และปุ่ม "สร้าง Standup" (8.11.1)

**สิ่งที่เปลี่ยน**

- 📁 `apps/api/src/entries/today/` — `today.service.ts` (วน registry), `today.ts` (`greetingFor`, `localHour`, `toWidgetDto`), controller, module
- 📁 `packages/core/src/module.interface.ts` — `summarizeToday` คืน `TodayWidget | Promise<TodayWidget>`
- 📁 `packages/core/src/domain.ts` — `TodayWidget` เพิ่ม `progress`, `alerts`, `actions`, `data` · `TodayWidgetAlert`
- 📁 `packages/contracts/src/today.ts` — `TodayDto`, `TodayWidgetDto`, `StandupDto`
- 📁 `modules/expense/` — `expense-today.ts` (การ์ดการเงิน pure), trackable inject `ExpenseStatsService`,
  แยก `spend-rules.ts` (isSpent) และ `expense-labels.ts` ออกมา (กัน import วน trackable ↔ stats)
- 📁 `modules/task/` — `standup.ts` (pure), `TaskStatsService.standup()`, `GET /tasks/standup/today`, การ์ดงานเพิ่ม progress + ปุ่ม standup
- 📁 `apps/api/vitest.config.ts` — integration รันทีละไฟล์จริง (`cae92c7`)

**ตัวอย่าง response (ย่อ)**

```json
{
  "date": "2026-10-01",
  "timezone": "Asia/Bangkok",
  "greeting": "สวัสดีตอนเย็น Jay",
  "widgets": [
    {
      "module": "task",
      "headline": "งานวันนี้ 3 ชิ้น · เลยกำหนด 1",
      "progress": { "done": 1, "total": 3 },
      "actions": [{ "label": "สร้าง standup", "href": "/today?standup=1" }]
    },
    {
      "module": "expense",
      "headline": "วันนี้ใช้ ฿340 · เดือนนี้ ฿8,420 / ฿15,000",
      "progress": { "done": 842000, "total": 1500000 },
      "alerts": [{ "level": "warning", "message": "หมวดอาหารใช้ไป 87% ของงบแล้ว" }]
    }
  ],
  "failedModules": []
}
```

**การตัดสินใจ**

- **`summarizeToday` คืน Promise ได้** _(ต่างจากสเปก 3.2 ที่เป็น sync)_ — การ์ดการเงินตามสเปก 7.4 ต้องมียอดทั้งเดือน + งบ + บิลถัดไป
  ซึ่งไม่อยู่ใน entries ของวันนี้ · ทางเลือกที่ไม่เอา: ให้ TodayService ดึงข้อมูลเพิ่มให้ (core ต้องรู้จักงบ = ผิดกฎข้อ 1)
  หรือให้หน้าเว็บยิง 3 endpoint เอง (เสีย "คำขอเดียว" ของสเปก) · task ยังเป็น sync ได้ตามเดิม
- **TodayService อยู่ใน `entries/` ไม่ใช่ `core/`** — ครั้งแรกวางใน `core/today/` แล้ว lint (boundaries + no-restricted-imports) แดง:
  core ห้ามใช้ Prisma · ชั้น `entries/` ถูกนิยามไว้แล้วว่า "ทำงานกับโมดูลผ่าน registry" ซึ่งตรงกับงานนี้พอดี
- entries ที่ส่งให้โมดูล = เกิดวันนี้ ∪ ไม่มีวันที่แต่สร้างวันนี้ ∪ **ค้างจากวันก่อน (pending/active)** ∪ เสร็จวันนี้ —
  กว้างพอให้งานเลยกำหนดและบิลค้างจ่ายโผล่ · แต่ละโมดูลกรองต่อตามความหมายของตัวเอง (การเงินนับ "ใช้วันนี้" เฉพาะวันที่ตรงกับวันนี้)
- **`Promise.allSettled`** — การ์ดหนึ่งล้ม (เช่น query งบช้า/พัง) หน้า Today ยังได้การ์ดอื่น + `failedModules` ให้ UI แสดง error เฉพาะการ์ด
- `progress` ของเงินเป็นหน่วยย่อยเสมอ (ไม่แปลงเป็นบาทใน API) · `total: null` = ไม่มีงบ
- alert เรียง danger > warning > info และไม่เกิน 3 รายการ · บิลเตือนเมื่อเหลือ ≤ 1 วันหรือเลยกำหนด
- **standup**: Done = เสร็จวันนี้ · Blocked = dependency ที่ยังไม่จบ (ไม่นับงานที่ถูกลบ) หรือแท็ก `blocked` (ไม่สนตัวพิมพ์) ·
  Doing = ที่เหลือที่ active / ครบกำหนดภายในวันนี้ / เลยกำหนด — งานอนาคตและ inbox ไม่อยู่ ·
  กลุ่มว่างเขียน "- ไม่มี" · `?format=markdown` ตอบ `text/markdown; charset=utf-8` ค่าเริ่มต้นเป็น JSON (มี `markdown` ด้วย)
- ปุ่มในการ์ดงานชี้ `/today?standup=1` (หน้าเว็บเปิด sheet) ไม่ใช่ path ของ API ตามตัวอย่างสเปก

**บั๊กที่เจอระหว่างทาง (`cae92c7`)**

เพิ่ม `today.int-spec.ts` (ไฟล์ที่ 5) แล้วชุด integration แดงแบบสุ่ม — log มี Postgres `40P01 deadlock detected`
ระหว่าง TRUNCATE กับ INSERT · `vitest.config.ts` ตั้ง `fileParallelism: false` ไว้ใน `projects[]` ซึ่ง vitest 3 **เมินเงียบ ๆ**
(อยู่ในรายการ `NonProjectOptions` ของ type definition) → ไฟล์รันขนานกันมาตั้งแต่ Phase 1
หลักฐาน: เวลารวมของไฟล์ 2.8 + 3.0 + 3.3 s > Duration 5.3 s · แก้เป็น `pool: 'forks'` + `singleFork: true` →
รันซ้ำ 8 รอบ: **ไม่มี deadlock อีก** · 6 รอบผ่านหมด · 2 รอบล้มด้วย `Can't reach database server at localhost:5432`
และ timeout 30 s (การเชื่อมต่อ Mac → Docker Desktop สะดุด ไม่ใช่ตรรกะ — container healthy ไม่ restart) → ใช้ CI (Linux) เป็นตัวตัดสิน

**แก้เทสต์ที่ผิดเอง:** งาน "วันนี้" ในเทสต์เดิมใช้ `occurredAt = now` → พอเรียก `/today` เวลาผ่านไปแล้ว `isOverdue` (เทียบเวลาจริง
เหมือน sidebar) จึงนับเป็นเลยกำหนด · เปลี่ยนเป็น 23:59 ของวันนี้ตามเวลาไทย

**วิธีตรวจ**

- unit: `expense-today.spec.ts` 7 (headline ตามสเปก, ไม่มีงบ, บิลค้างเมื่อวานไม่นับเป็นวันนี้, alert ลำดับ/จำนวน, empty) ·
  `standup.spec.ts` 4 · `today.spec.ts` 7 (ขอบ 12:00 / 18:00, โซนผู้ใช้ไม่ใช่โซนเซิร์ฟเวอร์) · task widget ปรับตามสเปก
- integration `today.int-spec.ts` 4: ผู้ใช้ใหม่ได้การ์ดว่างครบ · งานวันนี้/เลยกำหนด/เสร็จวันนี้ไม่ปนของคนอื่น + การ์ดเงิน ·
  **ปิดโมดูลใน settings → การ์ดหาย** · standup แท็ก #blocked + `text/markdown`
- `pnpm test:int:local` 33/33 (3 รอบติดหลังแก้) · lint/typecheck/unit ทั้ง monorepo 20/20

**สิ่งที่ค้าง**

- การ์ดการเงินเรียก `userContext.forUser` ซ้ำ (TodayService 1 + stats 2) — 3 query เล็กต่อคำขอ ยังไม่ใช่ปัญหา
- `POST /tasks/:id/standup` (สเปก 7.3) ยังไม่ทำ — ไม่อยู่ใน checklist ของ 2b
- ยังไม่มี API สร้าง dependency ระหว่างงาน → Blocked จาก dependency ทดสอบได้แค่ใน unit test
- ~~บั๊กวันกำหนดแบบ date ล้วน (07:00 เวลาไทย)~~ → แก้แล้วในขั้น 4b (`17192f0`)

---

## ขั้น 4b · แก้บั๊ก: วันกำหนดแบบ date ล้วน — `17192f0`

📚 **ความรู้พื้นฐาน:** instant vs วันที่ตามปฏิทิน (local date), `new Date('YYYY-MM-DD')` คือ UTC,
"เลยกำหนด" ของงานทั้งวัน, เทสต์ที่ล็อกพฤติกรรมผิดไว้ → บท [15](../learn/15-phase2b-money-months-and-second-module.md) หัวข้อ 8 · บท [13](../learn/13-phase2a-task-api-sidebar-and-focus-timer.md) หัวข้อ 1

**อาการ:** งานที่กำหนด "วันนี้" ถูกนับว่าเลยกำหนดตั้งแต่ 07:00 ของวันนั้น (sidebar, `?overdue`, การ์ด Today, ป้ายแดงบนการ์ดงาน) ·
ผู้ใช้โซนตะวันตกของ UTC งานไปตกวันก่อนหน้า · มีมาตั้งแต่ Phase 1–2a — **เห็นได้ในภาพ baseline ที่อนุมัติแล้ว** (ป้ายแดง "⚠ วันนี้")

**สาเหตุ 2 ชั้น**

1. QuickCapture ส่ง `"2026-10-01"` → contracts ทำ `new Date("2026-10-01")` = 00:00 **UTC** = 07:00 เวลาไทย
   (ECMAScript: date-only form ตีความเป็น UTC แต่ date-time ที่ไม่มี offset ตีความเป็นเวลาท้องถิ่น)
2. "เลยกำหนด" เทียบ `occurredAt < now` โดยไม่สน `isAllDay` — งานทั้งวันจึงเลยกำหนดทันทีที่ผ่านเวลาที่เก็บไว้

**สิ่งที่เปลี่ยน**

| ชั้น      | ไฟล์                             | เปลี่ยน                                                                                                                                                                  |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| contracts | `entry.ts`                       | date ล้วนคงเป็น string (`DateInput = Date \| string`) — contracts ไม่รู้ว่าผู้ใช้อยู่โซนไหน                                                                              |
| core      | `time.ts`                        | `resolveDateInput(v, tz)` → 00:00 ตามโซนผู้ใช้ · `isEntryOverdue(entry, now, tz)` แทน `isOverdue`                                                                        |
| API       | `entries.service.ts`, `defer.ts` | create / update / defer / bulk defer แปลงตามโซน · date ล้วนบังคับ `isAllDay: true` · `?from`/`?to` date ล้วน = ทั้งวัน (`to` เดิมเป็น `lte 00:00Z` ตัดงานของวันนั้นทิ้ง) |
| API       | `common/overdue-where.ts`        | where ของ "เลยกำหนด" ที่เดียว: ทั้งวัน `occurredAt < ต้นวันนี้` · มีเวลา `occurredAt < now` — ใช้ใน sidebar และ `?overdue`                                               |
| API       | task widget, standup             | ใช้ `isEntryOverdue`                                                                                                                                                     |
| web       | `lib/format.ts`, `task-card.tsx` | `isOverdueDate(iso, status, isAllDay)` · เทียบวันด้วยโซนที่ระบุ (`DEFAULT_TIME_ZONE`) ไม่ใช่โซนของเครื่อง                                                                |
| e2e       | `support/mock-data.ts`           | งานตัวอย่างที่ตั้งใจให้ "เลยกำหนด" เดิมพึ่งบั๊ก (ทั้งวัน 00:00 วันนี้) → เปลี่ยนเป็นงานมีเวลา                                                                            |

**การตัดสินใจ**

- แปลงที่ **service** ไม่ใช่ contracts — การตีความวันที่ต้องรู้ timezone ของผู้ใช้ ซึ่งมีแค่ฝั่ง API
- ไม่ต้อง migrate ข้อมูลเดิม: แถวที่บันทึกเป็น 00:00Z (07:00 ไทย) ยังอยู่วันเดิมตามเวลาไทย และกฎ "ทั้งวัน = วันจบแล้ว" ให้ผลถูก
  · ผู้ใช้โซนตะวันตกของ UTC (ถ้ามี) จะยังเห็นข้อมูลเก่าเลื่อนไปหนึ่งวัน — ระบบยังไม่มีผู้ใช้จริงนอกไทย จึงยอมรับ
- web ยังใช้ `Asia/Bangkok` ตายตัว (เหมือน `TH_DATE` เดิม) แต่รับ `timeZone` เป็นพารามิเตอร์แล้ว — ผูกกับ `settings.timezone` ภายหลัง
- mock data แก้ให้เป็น "งานมีเวลา" แทนการสร้าง baseline ใหม่ — ภาพเหมือนเดิมทุกพิกเซล ไม่ต้องอนุมัติซ้ำ และความหมายของข้อมูลตรงกับคอมเมนต์

**เทสต์ที่ล็อกพฤติกรรมผิดไว้ (แก้ 2 ตัว)**

- `contracts/entry.test.ts` — "แปลง occurredAt เป็น Date เสมอ ไม่ว่าจะส่งมาแบบ ISO เต็มหรือแค่วันที่"
- `api/entry.mapper.spec.ts` — `resolveDeferTarget('2026-12-31')` → `'2026-12-31T00:00:00.000Z'`

ทั้งสองผ่านมาตลอดเพราะ **ทดสอบสิ่งที่โค้ดทำ ไม่ใช่สิ่งที่ผู้ใช้ต้องการ** — เปลี่ยนให้ assert ค่าที่ถูก (00:00 เวลาไทย)

**วิธีตรวจ**

- unit: core `resolveDateInput` (ไทย + New York), `isEntryOverdue` (07:30 / 23:59:59 / 00:00 วันถัดไป, งานมีเวลา, สถานะจบ) ·
  defer (date ล้วนสองโซน + ISO มี offset) · standup งานทั้งวัน · web `isOverdueDate` + `formatDueDate` **รันทั้งโซนไทยและ `TZ=UTC`** ผลเท่ากัน
- integration (`tasks.int-spec.ts`, ผู้ใช้ใหม่): date ล้วนเก็บเป็น 00:00 ไทย + `isAllDay` · sidebar `today 2, overdue 1` ·
  `?overdue` ได้เฉพาะเมื่อวาน · `from=to=วันนี้` ได้งานวันนี้ · การ์ด Today "งานวันนี้ 2 ชิ้น · เลยกำหนด 1" · defer ไปวันที่ได้ 00:00 ไทย
- visual + axe ใน Docker **เทียบกับ baseline ที่อนุมัติ โดยไม่อัปเดตภาพ** (`--update-snapshots=none`): 18/18
- `pnpm test:int:local` 35/35 · lint/typecheck/unit ทั้ง monorepo 20/20

**สิ่งที่ค้าง**

- web ยังไม่อ่าน timezone จาก `/me` (ใช้ `Asia/Bangkok`)
- QuickCapture ยังส่งวันที่อย่างเดียว ไม่มีช่องเวลา — งานมีเวลาสร้างได้ผ่าน API เท่านั้น

---

## ขั้น 5 · Web: หน้า Expenses — `caefba4` `6140d9a` `41e7122`

📚 **ความรู้พื้นฐาน:** กราฟ SVG ที่เข้าถึงได้, สถานะที่ไม่สื่อด้วยสีอย่างเดียว, debounce + preview ที่ล้าสมัย,
CSV (RFC 4180, BOM, CSV injection), mock data ที่ตัวเลขสอดคล้องกัน, flaky test จากโหลดแรก → บท [15](../learn/15-phase2b-money-months-and-second-module.md) หัวข้อ 9

**เป้าหมาย:** หน้า `/expenses` ตามสเปก 8.11.3 — "ตอบคำถาม 80% ได้ในหน้าเดียว"

**สิ่งที่เปลี่ยน**

- 📁 `apps/api/src/modules/expense/expenses.controller.ts` — `POST /expenses/parse` (preview ไม่บันทึก, `caefba4`)
- 📁 `apps/web/src/features/expenses/`
  | ไฟล์                                                                                  | หน้าที่                                                                                                         |
  | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
  | `expense-capture.tsx`                                                                 | บันทึกด่วน · preview หน่วง 250ms เฉพาะข้อความที่มีตัวเลข · ↵ ใช้ preview ถ้ายังตรงกับข้อความ ไม่งั้น parse ใหม่ |
  | `kpi-cards.tsx`                                                                       | รายจ่ายเดือนนี้ (+ ฟอร์มตั้งงบรวมเมื่อยังไม่มีงบ) · คาดการณ์ + sparkline · บิลประจำ · `ToneBadge`               |
  | `bills-card.tsx`                                                                      | บิลเดือนนี้ + ค้างจ่าย · ปุ่มสถานะ = จ่ายแล้ว · "ตัดบัตรแล้ว" เมื่อ paymentMethod = card                        |
  | `category-card.tsx`                                                                   | segmented งบประมาณ / แนวโน้ม · bar ตามกฎสีงบ · แนวโน้มโหลดเมื่อเปิดแท็บ                                         |
  | `transactions-card.tsx`                                                               | 8 รายการล่าสุด · ตาราง (desktop) / list 2 บรรทัด (มือถือ) · CSV ทั้งเดือนไล่ทุกหน้า                             |
  | `charts.tsx`                                                                          | `Sparkline`, `ColumnChart` (SVG เขียนเอง)                                                                       |
  | `api.ts`, `use-expense-queries.ts`, `categories.ts`, `format.ts`, `expenses-view.tsx` | ข้อมูล / ป้าย / รูปแบบเงิน / layout                                                                             |
- 📁 `apps/web/src/lib/csv.ts` (+ เทสต์ 3) · 📁 `lib/progress.ts` ใช้ `budgetTone` จาก contracts (ปิดสิ่งที่ค้างจากขั้น 2)
- 📁 `apps/web/package.json` + `next.config.ts` — ใช้ `@nosion/core` (formatMoney, parseAmountToMinor) แบบเดียวกับ contracts
- 📁 `components/shell/nav.ts` — เมนู "การเงิน" เปิดใช้ · 📁 `features/entries/use-entries.ts` — `useCreateEntry` รับข้อความ toast
- 📁 `apps/web/e2e/` — mock การเงิน, visual Expenses 4 ภาพ, axe `/expenses` 2 ธีม, รอหน้าพร้อม 15 s

**การตัดสินใจ**

- parser อยู่ฝั่ง server ที่เดียว → เพิ่ม `POST /expenses/parse` (เฉพาะโมดูล) แทนการ copy regex มาไว้ในเว็บ · ตัวกลาง `/parse` ยังเป็น Phase 5
- รายจ่ายจาก quick capture = `done` (เกิดขึ้นแล้ว) · บิล = `pending` (ยังไม่จ่าย)
- ตั้ง **งบรวม** ได้ในการ์ด KPI 1 เมื่อยังไม่มีงบ (empty state ที่ทำอะไรได้) · งบรายหมวดยังไม่มี UI (ใช้ API ได้)
- แท็บ "แนวโน้ม" ใช้ **column chart SVG** ไม่ใช่ line chart + lazy chart lib ตามสเปก — 6 จุดรายเดือนเทียบขนาดอ่านง่ายกว่าเป็นแท่ง
  และไม่ต้องเพิ่ม bundle · เดือนปัจจุบัน (ยังไม่จบ) จางลง **พร้อมคำอธิบายใต้กราฟ** ไม่ใช่สีอย่างเดียว
- กราฟ: series เดียวใช้ `--track-fill` ไม่มี legend · ป้ายตัวเลขเฉพาะแท่งที่เลือก (ค่าเริ่มต้น = เดือนล่าสุดที่จบแล้ว) ·
  hover มี tooltip · **ไม่ใส่ปุ่มที่ focus ได้ใน `<svg role="img">`** (ลูกของ img เป็น presentational) — ผู้ใช้คีย์บอร์ด/
  screen reader อ่านตาราง sr-only ที่ `aria-describedby` ชี้ไปแทน
- สถานะงบ/คาดการณ์ (`ปลอดภัย / ใกล้เกิน / เกินงบ`) = ไอคอน + ข้อความ + สี เสมอ
- CSV: จำนวนเงินเป็นตัวเลขล้วน (ไม่มี ฿/ลูกน้ำ) ให้ Excel คำนวณต่อได้ · BOM · ช่องที่ขึ้นต้นด้วย `= + - @` ใส่ `'` (ยกเว้นตัวเลขติดลบ)
- มือถือ: ตัวสลับของการ์ดหมวดหมู่ย้ายลงใต้หัวการ์ด — รอบแรกวางข้างหัวแล้วชื่อการ์ดถูกบีบเหลือคำละบรรทัด (เห็นจากภาพ baseline)

**วิธีตรวจ**

- `next build`: `/expenses` **169 kB** (< 180 kB) · lint/typecheck/unit ทั้ง monorepo 20/20 · integration 36/36 (+ parse)
- axe `/expenses` light + dark: **0 violation** (ทุกระดับ)
- ภาพ: ดูเองทั้ง desktop dark และ mobile light/dark — ตัวเลขตรงกัน (฿8,420 / ฿15,000 = 56.1%, เดินทาง 87% = ใกล้เกิน)
- Docker `--update-snapshots=none --retries=0` สองรอบ: 24/24
- ภาพ Tasks 4 ภาพเปลี่ยน **เฉพาะเมนู "การเงิน"** (sidebar y 167–184 / tab bar x 186–204) เพราะไม่ใช่ "เร็ว ๆ นี้" แล้ว — ตรวจด้วยการ diff พิกเซล

**Flaky ที่เจอ:** Docker รอบแรก visual Expenses (light desktop) รอ "Craft Specialty Coffee" เกิน 5 s แล้ว retry ผ่าน ·
ทำซ้ำบน Mac 20 รอบไม่เจอ → เป็นโหลดแรกของหน้า (API 5 ตัวพร้อมกัน) ใน container ที่รันหลาย worker ·
เพิ่มเวลารอ "หน้าพร้อม" เป็น 15 s ทุกหน้า (ไม่แตะการเทียบภาพ) · ไม่ปล่อยให้ retry ซ่อนไว้

**สิ่งที่ค้าง**

- [ ] **ภาพ baseline 8 ภาพรออนุมัติ** (Expenses ใหม่ 4 + Tasks ที่เปลี่ยนเมนู 4) — ยังไม่ commit · ยังไม่ push เพราะ job UI จะแดงจนกว่าจะมี baseline
- ปุ่มไมค์ (Web Speech) และอัปโหลดสลิป 🧾 (สเปก 8.11.3) ยังไม่ทำ — สลิปต้องมี attachment API ก่อน
- "เพิ่มรอบบิลใหม่" (rrule builder) รอ Phase 3 · UI ตั้งงบรายหมวด · หน้า `/expenses/analytics`, `/expenses/bills` (ขั้น 7)
- แก้ไข/ลบรายการจากตาราง transactions ยังไม่มี (ทำผ่าน API ได้)
