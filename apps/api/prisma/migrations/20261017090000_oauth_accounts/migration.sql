-- Phase 8 ขั้น 4b: เข้าสู่ระบบด้วย Google / GitHub
-- เพิ่มคอลัมน์แบบ nullable/มีค่าเริ่มต้นเท่านั้น — backward-compatible กับโค้ดรุ่นก่อน (สเปก 13.4)
ALTER TABLE "oauth_accounts" ADD COLUMN "login" TEXT;
ALTER TABLE "oauth_accounts" ADD COLUMN "accessTokenEnc" TEXT;
ALTER TABLE "oauth_accounts" ADD COLUMN "scopes" TEXT;
ALTER TABLE "oauth_accounts" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ตารางนี้ยังไม่เคยมีแถว (ยังไม่มี OAuth มาก่อน) — สร้าง unique ได้ทันที
CREATE UNIQUE INDEX "oauth_accounts_userId_provider_key" ON "oauth_accounts"("userId", "provider");
