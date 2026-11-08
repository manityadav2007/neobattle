-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "notified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RedeemRequest" ADD COLUMN IF NOT EXISTS "notified" BOOLEAN NOT NULL DEFAULT false;
