-- ============================================================================
-- SAFE ADDITIVE MIGRATION: Schema Parity for DepositRequest, AuditLog & Status
-- ============================================================================

-- 1. Add 'AUTO_RESOLVED' value to DepositStatus enum if not exists
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'AUTO_RESOLVED';

-- 2. Add missing columns to DepositRequest table
ALTER TABLE "DepositRequest" 
  ADD COLUMN IF NOT EXISTS "baseAmount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "depositTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "exactAmount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "screenshotStorageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "utrNumber" TEXT;

-- 3. Backfill exactAmount and baseAmount for any existing rows in DepositRequest
-- Old rows had only 'amount'. We copy 'amount' into 'exactAmount' and 'baseAmount'
-- so historical records remain 100% intact and non-null for queries.
UPDATE "DepositRequest"
SET "exactAmount" = "amount",
    "baseAmount" = "amount"
WHERE "exactAmount" IS NULL OR "baseAmount" IS NULL;

-- 4. Create AuditLog table if not exists
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- 5. Enable Row Level Security (RLS) on AuditLog (backend-only, 0 public policies)
-- This satisfies Supabase Security Advisor and blocks direct anon/authenticated PostgREST access.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- 6. Create Indexes on AuditLog
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_targetId_idx" ON "AuditLog"("targetId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- 7. Create Indexes and Constraints on DepositRequest
CREATE UNIQUE INDEX IF NOT EXISTS "DepositRequest_utrNumber_key" ON "DepositRequest"("utrNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "DepositRequest_depositTransactionId_key" ON "DepositRequest"("depositTransactionId");
CREATE INDEX IF NOT EXISTS "DepositRequest_depositTransactionId_idx" ON "DepositRequest"("depositTransactionId");
CREATE INDEX IF NOT EXISTS "DepositRequest_utrNumber_idx" ON "DepositRequest"("utrNumber");

-- 8. Add Foreign Key on DepositRequest.depositTransactionId referencing Transaction.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DepositRequest_depositTransactionId_fkey'
  ) THEN
    ALTER TABLE "DepositRequest" 
      ADD CONSTRAINT "DepositRequest_depositTransactionId_fkey" 
      FOREIGN KEY ("depositTransactionId") REFERENCES "Transaction"("id") 
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
