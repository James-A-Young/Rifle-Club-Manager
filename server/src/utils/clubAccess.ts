import { MembershipRole, MembershipStatus } from '@prisma/client';
import { prisma } from '../prisma';

export async function ensureAdminForClub(userId: string, clubId: string): Promise<boolean> {
  const membership = await prisma.clubMembership.findFirst({
    where: {
      userId,
      clubId,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
    select: { id: true },
  });

  return Boolean(membership);
}

export async function ensureMemberOfClub(userId: string, clubId: string): Promise<boolean> {
  const membership = await prisma.clubMembership.findFirst({
    where: {
      userId,
      clubId,
      status: MembershipStatus.APPROVED,
    },
    select: { id: true },
  });

  return Boolean(membership);
}