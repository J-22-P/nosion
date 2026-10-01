-- Custom: ผู้ใช้หนึ่งคนมีงบรวม (category IS NULL) ได้ก้อนเดียวต่อ period
-- unique เดิม ("userId", "category", "period") กันไม่ได้ เพราะใน Postgres NULL ไม่เท่ากับ NULL
-- → INSERT งบรวมสองครั้งผ่านทั้งคู่ (ทดลองแล้วบนฐานเทสต์) · partial index นี้ปิดช่องนั้น
-- (Postgres 15+ มี NULLS NOT DISTINCT แต่ประกาศใน schema.prisma ไม่ได้ · partial index แบบเดียวกับ
--  focus_sessions ยืนยันแล้วว่า prisma migrate diff ไม่นับเป็น drift)
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_one_total_per_user_period"
  ON "budgets" ("userId", "period")
  WHERE "category" IS NULL;
