-- personal access token ของ GitHub ที่ผู้ใช้วางเอง — ทางออกเมื่อ org จำกัด OAuth app (ซ่อน issue จากแอปที่ยังไม่อนุมัติ)
-- เพิ่มคอลัมน์ nullable ล้วน — โค้ดรุ่นเก่าไม่รู้จักก็ทำงานได้ (backward-compatible · สเปก 13.4)
ALTER TABLE "github_integrations" ADD COLUMN "personalTokenEnc" TEXT;
ALTER TABLE "github_integrations" ADD COLUMN "personalTokenLogin" TEXT;
ALTER TABLE "github_integrations" ADD COLUMN "personalTokenScopes" TEXT;
