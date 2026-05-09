import { beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/prisma';

const tables = [
  'VisitLog',
  'SignInLink',
  'ClubInvite',
  'ClubMembership',
  'Firearm',
  'Club',
  'User',
];

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  const quoted = tables.map(t => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} CASCADE;`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
