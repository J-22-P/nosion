-- Phase 8 ขั้น 5: GitHub — ดึง issue ลงปฏิทิน + webhook ปิดงานเมื่อ PR merged
-- ตารางใหม่ล้วน — ไม่แตะตารางเดิม (backward-compatible · สเปก 13.4)
CREATE TABLE "github_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "webhookSecretEnc" TEXT,
    "lastDeliveryAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncCount" INTEGER,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_integrations_userId_key" ON "github_integrations"("userId");
CREATE INDEX "github_integrations_lastSyncAt_idx" ON "github_integrations"("lastSyncAt");

ALTER TABLE "github_integrations" ADD CONSTRAINT "github_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
