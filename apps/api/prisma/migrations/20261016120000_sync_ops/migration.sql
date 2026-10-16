-- Phase 7: idempotency ของ POST /sync/push — additive (ตารางใหม่) deploy ได้โดยไม่หยุดระบบ
-- CreateTable
CREATE TABLE "sync_ops" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_ops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_ops_createdAt_idx" ON "sync_ops"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sync_ops_userId_opId_key" ON "sync_ops"("userId", "opId");

-- AddForeignKey
ALTER TABLE "sync_ops" ADD CONSTRAINT "sync_ops_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

