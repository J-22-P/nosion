-- Phase 8 ขั้น 6: i18n — ผู้ใช้เลือกแสดงปีเป็นพุทธศักราชได้ (สเปก 8.9)
-- ค่าเริ่มต้น true = เหมือน Intl `th-TH` ที่แอปใช้อยู่เดิม (วันที่ภาษาไทยเป็น พ.ศ.) · มีค่าเริ่มต้น = backward-compatible (สเปก 13.4)
ALTER TABLE "user_settings" ADD COLUMN "buddhistEra" BOOLEAN NOT NULL DEFAULT true;
