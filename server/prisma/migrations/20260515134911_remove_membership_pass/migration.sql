/*
  Warnings:

  - You are about to drop the `MembershipPass` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "MembershipPass" DROP CONSTRAINT "MembershipPass_clubId_fkey";

-- DropForeignKey
ALTER TABLE "MembershipPass" DROP CONSTRAINT "MembershipPass_userId_fkey";

-- DropTable
DROP TABLE "MembershipPass";
