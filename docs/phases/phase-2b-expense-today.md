# Phase 2b · Expense + Today (สัปดาห์ 7–9)

> เป้าหมาย: โมดูลการเงินใช้งานได้จริง (รายจ่าย งบ บิล คาดการณ์) และหน้า Today ที่รวม widget ทุกโมดูล — สเปก 15 Phase 2b, 7.3, 8.11.1, 8.11.3
> **DoD:** ใช้แอปบันทึกรายจ่ายจริงของตัวเองได้ตลอดสัปดาห์ · ตัวเลขในหน้า Today ถูกต้อง ·
> Today / Tasks / Expenses ตรงกับ mockup ทั้ง dark + light บน desktop + mobile · axe 0 serious ทั้ง 2 ธีม
> ความรู้เบื้องหลัง: [15 เงิน, เดือนตามโซนเวลา, โมดูลที่สอง](../learn/15-phase2b-money-months-and-second-module.md)

## แผน (ปรับได้ระหว่างทาง)

| #   | ขั้น                                                                          | Commit    | สถานะ |
| --- | ----------------------------------------------------------------------------- | --------- | ----- |
| 1   | API: ExpenseModule + NL parser + helper เงิน/เดือน                            | `6cc6284` | ✅    |
| 2   | API: Budget CRUD + `GET /budgets/status` (กฎสี 85% / 100%)                    |           | ⏳    |
| 3   | API: `/expenses/summary`, `/forecast`, `/trends`, `/bills/upcoming`           |           | ⏳    |
| 4   | API: `GET /today` + `GET /tasks/standup/today?format=markdown`                |           | ⏳    |
| 5   | Web: หน้า Expenses (quick capture, KPI 3 การ์ด, บิล, หมวด, transactions, CSV) |           | ⏳    |
| 6   | Web: หน้า Today (hero, widget registry, Developer Quick Actions, standup)     |           | ⏳    |
| 7   | Web: Analytics (donut, trend, fixed vs variable) + empty/error/skeleton       |           | ⏳    |
| 8   | Seed demo account ชุดเดียวกับ mockup · visual + axe ของหน้าใหม่               |           | ⏳    |
| 9   | Deploy staging (deploy-staging.yml)                                           |           | ⏳    |

**ค้างจาก Phase 2a ที่กระทบ 2b:** baseline visual 8 ภาพรออนุมัติ (ยังไม่ commit) · commit ทั้งหมดยังไม่ push → CI ยังไม่เคยรัน job "UI"

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
