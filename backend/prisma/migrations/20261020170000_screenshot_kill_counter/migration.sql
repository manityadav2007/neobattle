-- ============================================================================
-- SAFE ADDITIVE MIGRATION: Screenshot-based AI Kill Counter & RLS
-- ============================================================================

-- 1. Add 'screenshotUrls' JSONB column to ResultSubmission if not exists
ALTER TABLE "ResultSubmission"
  ADD COLUMN IF NOT EXISTS "screenshotUrls" JSONB;

-- 2. Create ScreenshotHash table for duplicate screenshot detection across tournaments
CREATE TABLE IF NOT EXISTS "ScreenshotHash" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenshotHash_pkey" PRIMARY KEY ("id")
);

-- 3. Enable Row Level Security (RLS) on ScreenshotHash (backend-only, 0 public policies)
ALTER TABLE "ScreenshotHash" ENABLE ROW LEVEL SECURITY;

-- 4. Create Unique Index & Performance Indexes on ScreenshotHash
CREATE UNIQUE INDEX IF NOT EXISTS "ScreenshotHash_hash_key" ON "ScreenshotHash"("hash");
CREATE INDEX IF NOT EXISTS "ScreenshotHash_tournamentId_idx" ON "ScreenshotHash"("tournamentId");
CREATE INDEX IF NOT EXISTS "ScreenshotHash_uploadedById_idx" ON "ScreenshotHash"("uploadedById");
CREATE INDEX IF NOT EXISTS "ScreenshotHash_hash_idx" ON "ScreenshotHash"("hash");
