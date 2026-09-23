-- Index ที่ Prisma ยังประกาศใน schema ไม่ได้ (GIN บน JSONB path และ partial index)
-- ถูกนำเข้าเป็น migration จริงด้วย `pnpm db:migrate:indexes`

-- ค้นหา expense ตามหมวด (ใช้บ่อยมากในหน้า analytics)
CREATE INDEX IF NOT EXISTS idx_entries_expense_category
  ON entries ((payload->>'category'))
  WHERE module = 'expense' AND "deletedAt" IS NULL;

-- ค้นหาบิลที่ยังไม่จ่าย
CREATE INDEX IF NOT EXISTS idx_entries_unpaid_bills
  ON entries ("userId", "occurredAt")
  WHERE module = 'expense'
    AND (payload->>'isBill')::boolean = true
    AND status = 'pending'
    AND "deletedAt" IS NULL;

-- ค้นหาข้อความไทย+อังกฤษด้วย trigram (ต้องมี extension pg_trgm ซึ่งประกาศไว้ใน schema แล้ว)
CREATE INDEX IF NOT EXISTS idx_entries_title_trgm
  ON entries USING gin (title gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

-- partial index สำหรับ scheduler — เฉพาะ reminder ที่ยังไม่ยิง
-- ทำให้ตารางระดับล้านแถวยัง query "reminder ที่ต้องยิงใน 5 นาทีข้างหน้า" ได้ระดับ sub-millisecond
-- เพราะ index มีขนาดเท่ากับจำนวน reminder ที่ยัง scheduled เท่านั้น
CREATE INDEX IF NOT EXISTS idx_reminders_pending
  ON reminders ("fireAt")
  WHERE status = 'scheduled';
