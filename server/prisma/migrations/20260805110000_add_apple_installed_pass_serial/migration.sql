-- Track WalletWallet Apple pass serials for membership update flow.
ALTER TABLE "ClubMembership"
ADD COLUMN "appleInstalledPassSerial" TEXT;

CREATE UNIQUE INDEX "ClubMembership_appleInstalledPassSerial_key"
ON "ClubMembership"("appleInstalledPassSerial");
