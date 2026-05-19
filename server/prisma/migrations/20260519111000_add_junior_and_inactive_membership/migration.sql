-- Migration: add JUNIOR membership role and INACTIVE membership status
--
-- Data-safe enum extension used for non-destructive member lifecycle changes.

ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'JUNIOR';
ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';
