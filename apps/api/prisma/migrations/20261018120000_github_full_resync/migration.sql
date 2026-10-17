-- ข้อมูลเท่านั้น (ไม่แตะ schema): ตัวดึง GitHub รุ่นใหม่นำเข้า issue ที่ปิดแล้ว + วันจาก GitHub Project
-- ผู้ใช้ที่เคยดึงด้วยรุ่นเก่ามี lastSyncAt แล้ว → รอบต่อไปถามเฉพาะ "ที่เปลี่ยนหลังรอบก่อน" งานเก่าจะไม่มาเลย
-- ล้างจุดเริ่มครั้งเดียวให้ดึงใหม่ทั้งหมด (ซ้ำไม่ได้: clientId กันซ้ำ · งานที่ผู้ใช้แก้/ลบ planIssue ไม่ทับ)
UPDATE "github_integrations" SET "lastSyncAt" = NULL, "syncCursor" = NULL, "syncRunStartedAt" = NULL;
