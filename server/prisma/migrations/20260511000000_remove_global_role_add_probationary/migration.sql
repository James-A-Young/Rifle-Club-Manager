-- Migration: remove global user role, add PROBATIONARY_MEMBER to MembershipRole
--
-- Data-safe: no rows are deleted or modified. The User.role column is dropped
-- (it held OWNER/ADMIN/MEMBER – a legacy system-wide concept). Club-scoped
-- authorization is handled entirely by ClubMembership.role. The new
-- PROBATIONARY_MEMBER value extends MembershipRole for tracked categories.

-- AddValue to MembershipRole enum (must come before any column changes that use it)
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'PROBATIONARY_MEMBER';

-- Drop the global role column from User
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";

-- Drop the Role enum (no longer used)
DROP TYPE IF EXISTS "Role";
