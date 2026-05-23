import { Prisma } from '../generated/client.js';
import { prisma } from '../prisma.js';

export type TrackedProfile = {
  name: string;
  address: string;
  placeOfBirth: string;
  dateOfBirth: Date;
  firearmCertificateNumber: string | null;
  firearmCertificateExpiry: Date | null;
  shotgunCertificateNumber: string | null;
  shotgunCertificateExpiry: Date | null;
};

export type ProfileFieldChange = {
  field: keyof TrackedProfile;
  oldValue: string | null;
  newValue: string | null;
};

export type ProfileHistoryEntry = {
  id: string;
  changedAt: Date;
  changedByUserId: string | null;
  changes: ProfileFieldChange[];
};

const TRACKED_FIELDS: Array<keyof TrackedProfile> = [
  'name',
  'address',
  'placeOfBirth',
  'dateOfBirth',
  'firearmCertificateNumber',
  'firearmCertificateExpiry',
  'shotgunCertificateNumber',
  'shotgunCertificateExpiry',
];

function normalizeValue(value: string | Date | null): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function isEqual(
  left: string | Date | null,
  right: string | Date | null,
): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  return left === right;
}

export function buildProfileDiff(
  previous: TrackedProfile,
  next: TrackedProfile,
): ProfileFieldChange[] {
  return TRACKED_FIELDS
    .filter(field => !isEqual(previous[field], next[field]))
    .map(field => ({
      field,
      oldValue: normalizeValue(previous[field]),
      newValue: normalizeValue(next[field]),
    }));
}

export async function recordUserProfileHistoryChange(params: {
  userId: string;
  changedByUserId: string | null;
  previous: TrackedProfile;
  next: TrackedProfile;
}): Promise<void> {
  const changes = buildProfileDiff(params.previous, params.next);
  if (changes.length === 0) {
    return;
  }

  await prisma.userProfileHistory.create({
    data: {
      userId: params.userId,
      changedByUserId: params.changedByUserId,
      changes: changes as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getUserProfileHistorySince(params: {
  userId: string;
  since: Date;
}): Promise<ProfileHistoryEntry[]> {
  const rows = await prisma.userProfileHistory.findMany({
    where: {
      userId: params.userId,
      changedAt: { gte: params.since },
    },
    orderBy: {
      changedAt: 'desc',
    },
    select: {
      id: true,
      changedAt: true,
      changedByUserId: true,
      changes: true,
    },
  });

  return rows.map(row => ({
    id: row.id,
    changedAt: row.changedAt,
    changedByUserId: row.changedByUserId,
    changes: row.changes as unknown as ProfileFieldChange[],
  }));
}
