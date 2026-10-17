-- ดึง issue ทั้งหมด (รวมที่ปิดแล้ว) แบบแบ่งหลายรอบ — Vercel Function มีเวลา 10 วิ แต่ issue หลายร้อยรายการใช้นานกว่านั้น
-- เพิ่มคอลัมน์ nullable ล้วน — โค้ดรุ่นเก่าไม่รู้จักก็ทำงานได้ (backward-compatible · สเปก 13.4)
ALTER TABLE "github_integrations" ADD COLUMN "syncCursor" TEXT;
ALTER TABLE "github_integrations" ADD COLUMN "syncRunStartedAt" TIMESTAMP(3);
