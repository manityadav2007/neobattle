-- ============================================================================
-- SAFE ADDITIVE MIGRATION: Push Notifications & RLS
-- ============================================================================

-- 1. Create push_tokens table
CREATE TABLE IF NOT EXISTS "push_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 2. Enable Row Level Security (RLS) on push_tokens (0 public policies, service role only)
ALTER TABLE "push_tokens" ENABLE ROW LEVEL SECURITY;

-- 3. Create Unique & Performance Indexes on push_tokens
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_key" ON "push_tokens"("token");
CREATE INDEX IF NOT EXISTS "push_tokens_user_id_idx" ON "push_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "push_tokens_token_idx" ON "push_tokens"("token");

-- 4. Add pushNotificationsEnabled to User if not exists
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- 5. Add startReminderSent to Tournament if not exists
ALTER TABLE "Tournament"
  ADD COLUMN IF NOT EXISTS "startReminderSent" BOOLEAN NOT NULL DEFAULT false;
