-- รูปย่อของรูปในรายละเอียดงาน (เช่น รูปแนบใน issue ของ repo ส่วนตัวบน GitHub ที่ฝังข้ามโดเมนไม่ได้)
-- เก็บ WebP ขนาดเล็กไว้ในแถวเลย (data) · storageKey ไม่บังคับแล้ว (ยังไม่มีไฟล์ไหนใช้ object storage)
ALTER TABLE "attachments" ALTER COLUMN "storageKey" DROP NOT NULL;
ALTER TABLE "attachments" ADD COLUMN "data" BYTEA,
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER;

CREATE UNIQUE INDEX "attachments_entryId_sourceUrl_key" ON "attachments"("entryId", "sourceUrl");
