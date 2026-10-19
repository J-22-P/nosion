-- ข้อมูลเท่านั้น (ไม่แตะ schema): ตัวดึง GitHub รุ่นใหม่เก็บวันเริ่ม (Start Date / วันแรกของ Sprint) ด้วย
-- → ปฏิทินแสดงงานเป็นแถบตั้งแต่วันเริ่มถึงวันกำหนด · งานที่ดึงไว้แล้วจะได้วันเริ่มเมื่อถูกดึงอีกครั้ง
-- ล้างจุดเริ่มครั้งเดียวให้ดึงใหม่ทั้งหมด (ซ้ำไม่ได้: clientId กันซ้ำ · งานที่ผู้ใช้แก้/ลบ planIssue ไม่ทับ)
UPDATE "github_integrations" SET "lastSyncAt" = NULL, "syncCursor" = NULL, "syncRunStartedAt" = NULL;
