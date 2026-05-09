-- CreateTable
CREATE TABLE "ClubSettings" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT DEFAULT '#1f2937',
    "secondaryColor" TEXT DEFAULT '#374151',
    "accentColor" TEXT DEFAULT '#3b82f6',
    "passIssuingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "memberCardSignInEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassTemplate" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "googleClassId" TEXT,
    "googleIssuerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "googleObjectId" TEXT,
    "qrCode" TEXT NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubSettings_clubId_key" ON "ClubSettings"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "PassTemplate_clubId_key" ON "PassTemplate"("clubId");

-- CreateIndex
CREATE INDEX "MembershipPass_clubId_createdAt_idx" ON "MembershipPass"("clubId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPass_userId_clubId_key" ON "MembershipPass"("userId", "clubId");

-- AddForeignKey
ALTER TABLE "ClubSettings" ADD CONSTRAINT "ClubSettings_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassTemplate" ADD CONSTRAINT "PassTemplate_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPass" ADD CONSTRAINT "MembershipPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPass" ADD CONSTRAINT "MembershipPass_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
