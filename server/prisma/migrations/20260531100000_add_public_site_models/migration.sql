-- CreateEnum
CREATE TYPE "PublicAnnouncementVariant" AS ENUM ('INFO', 'WARNING', 'SUCCESS');

-- CreateEnum
CREATE TYPE "PublicDomainStatus" AS ENUM ('PENDING', 'VERIFIED');

-- CreateTable
CREATE TABLE "ClubPublicSiteProfile" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "vanitySlug" TEXT,
  "heroTitle" TEXT,
  "heroSubtitle" TEXT,
  "headerImageUrl" TEXT,
  "headerImageAlt" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClubPublicSiteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPublicSessionBlock" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "dayLabel" TEXT NOT NULL,
  "sessionType" TEXT NOT NULL,
  "startsAt" TEXT NOT NULL,
  "endsAt" TEXT NOT NULL,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClubPublicSessionBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPublicAnnouncement" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "variant" "PublicAnnouncementVariant" NOT NULL DEFAULT 'INFO',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClubPublicAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPublicBlogPost" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "excerpt" TEXT,
  "markdownBody" TEXT NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClubPublicBlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPublicDomain" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "verificationToken" TEXT NOT NULL,
  "expectedCnameTarget" TEXT NOT NULL,
  "status" "PublicDomainStatus" NOT NULL DEFAULT 'PENDING',
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClubPublicDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubPublicSiteProfile_clubId_key" ON "ClubPublicSiteProfile"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubPublicSiteProfile_vanitySlug_key" ON "ClubPublicSiteProfile"("vanitySlug");

-- CreateIndex
CREATE INDEX "ClubPublicSessionBlock_clubId_sortOrder_idx" ON "ClubPublicSessionBlock"("clubId", "sortOrder");

-- CreateIndex
CREATE INDEX "ClubPublicAnnouncement_clubId_sortOrder_idx" ON "ClubPublicAnnouncement"("clubId", "sortOrder");

-- CreateIndex
CREATE INDEX "ClubPublicAnnouncement_clubId_isEnabled_idx" ON "ClubPublicAnnouncement"("clubId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "ClubPublicBlogPost_clubId_slug_key" ON "ClubPublicBlogPost"("clubId", "slug");

-- CreateIndex
CREATE INDEX "ClubPublicBlogPost_clubId_isPublished_publishedAt_idx" ON "ClubPublicBlogPost"("clubId", "isPublished", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClubPublicDomain_domain_key" ON "ClubPublicDomain"("domain");

-- CreateIndex
CREATE INDEX "ClubPublicDomain_clubId_isActive_idx" ON "ClubPublicDomain"("clubId", "isActive");

-- AddForeignKey
ALTER TABLE "ClubPublicSiteProfile"
ADD CONSTRAINT "ClubPublicSiteProfile_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPublicSessionBlock"
ADD CONSTRAINT "ClubPublicSessionBlock_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPublicAnnouncement"
ADD CONSTRAINT "ClubPublicAnnouncement_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPublicBlogPost"
ADD CONSTRAINT "ClubPublicBlogPost_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPublicDomain"
ADD CONSTRAINT "ClubPublicDomain_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
