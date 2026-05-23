ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "twoFactorPendingSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "twoFactorPendingExpiresAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "TwoFactorDisableToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "usedByIp" TEXT,
  "usedByUserAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TwoFactorDisableToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TwoFactorDisableToken_token_key" ON "TwoFactorDisableToken"("token");
CREATE INDEX IF NOT EXISTS "TwoFactorDisableToken_userId_idx" ON "TwoFactorDisableToken"("userId");
CREATE INDEX IF NOT EXISTS "TwoFactorDisableToken_expiresAt_idx" ON "TwoFactorDisableToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "TwoFactorDisableToken_usedAt_idx" ON "TwoFactorDisableToken"("usedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TwoFactorDisableToken_userId_fkey'
  ) THEN
    ALTER TABLE "TwoFactorDisableToken"
      ADD CONSTRAINT "TwoFactorDisableToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
