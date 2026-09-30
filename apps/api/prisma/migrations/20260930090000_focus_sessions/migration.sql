-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "focusGoalMinutes" INTEGER NOT NULL DEFAULT 240;

-- CreateTable
CREATE TABLE "focus_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "focus_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "focus_sessions_userId_startedAt_idx" ON "focus_sessions"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "focus_sessions_entryId_idx" ON "focus_sessions"("entryId");

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom: ผู้ใช้หนึ่งคนมีรอบที่ยังไม่จบได้ครั้งละ 1 รอบ
-- กด "เริ่มจับเวลา" สองแท็บพร้อมกัน → แถวที่สองชน index นี้แทนที่จะได้ timer ซ้อนกัน
CREATE UNIQUE INDEX IF NOT EXISTS "focus_sessions_one_running_per_user"
  ON "focus_sessions" ("userId")
  WHERE "endedAt" IS NULL;
