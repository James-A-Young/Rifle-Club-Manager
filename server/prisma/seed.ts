import { PrismaClient, Role, MembershipStatus, MembershipRole, OwnerType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const ownerPasswordHash = await bcrypt.hash('Password123!', 10);
  const memberPasswordHash = await bcrypt.hash('Password123!', 10);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@test.com' },
    update: {},
    create: {
      name: 'Club Owner',
      email: 'owner@test.com',
      passwordHash: ownerPasswordHash,
      role: Role.OWNER,
      gdprConsentDate: new Date(),
      address: '1 Main Street, London, SW1A 1AA',
      placeOfBirth: 'London',
      dateOfBirth: new Date('1980-01-01'),
    },
  });

  const member = await prisma.user.upsert({
    where: { email: 'member@test.com' },
    update: {},
    create: {
      name: 'Test Member',
      email: 'member@test.com',
      passwordHash: memberPasswordHash,
      role: Role.MEMBER,
      gdprConsentDate: new Date(),
      address: '2 High Street, Manchester, M1 1AA',
      placeOfBirth: 'Manchester',
      dateOfBirth: new Date('1990-06-15'),
    },
  });

  const club = await prisma.club.upsert({
    where: { id: 'seed-club-1' },
    update: {},
    create: {
      id: 'seed-club-1',
      name: 'Riverside Rifle Club',
      homeOfficeRef: 'HO-12345',
      ownerId: owner.id,
    },
  });

  await prisma.clubMembership.upsert({
    where: { userId_clubId: { userId: owner.id, clubId: club.id } },
    update: {},
    create: {
      userId: owner.id,
      clubId: club.id,
      status: MembershipStatus.APPROVED,
      role: MembershipRole.ADMIN,
    },
  });

  await prisma.clubMembership.upsert({
    where: { userId_clubId: { userId: member.id, clubId: club.id } },
    update: {},
    create: {
      userId: member.id,
      clubId: club.id,
      status: MembershipStatus.APPROVED,
      role: MembershipRole.MEMBER,
    },
  });

  const personalFirearm = await prisma.firearm.create({
    data: {
      make: 'Anschutz',
      model: '1827',
      caliber: '.22 LR',
      serialNumber: 'AZ123456',
      ownerType: OwnerType.USER,
      userId: owner.id,
    },
  });

  await prisma.firearm.create({
    data: {
      make: 'Tikka',
      model: 'T3x',
      caliber: '.308 Win',
      serialNumber: 'TK789012',
      ownerType: OwnerType.CLUB,
      clubId: club.id,
    },
  });

  await prisma.visitLog.create({
    data: {
      userId: owner.id,
      clubId: club.id,
      purpose: 'Practice',
      firearmUsedId: personalFirearm.id,
      timeIn: new Date(Date.now() - 2 * 60 * 60 * 1000),
      timeOut: new Date(Date.now() - 1 * 60 * 60 * 1000),
    },
  });

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
