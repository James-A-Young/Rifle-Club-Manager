import { MembershipStatus } from '../../generated/client.js';
import { prisma } from '../../prisma.js';
import { deriveDeclarationStatusFromDueDate } from '../section21Declaration.js';
import { csvCell } from './signInHistoryExport.js';

export const MEMBER_DEMOGRAPHICS_HEADERS = [
  'memberId',
  'userId',
  'name',
  'email',
  'membershipStatus',
  'membershipRole',
  'section21Status',
  'address',
  'placeOfBirth',
  'dateOfBirth',
  'phoneNumber',
  'firearmCertificateNumber',
  'firearmCertificateExpiry',
  'shotgunCertificateNumber',
  'shotgunCertificateExpiry',
  'gdprConsentDate',
];

export async function buildMemberDemographicsCsv(clubId: string): Promise<string> {
  const members = await prisma.clubMembership.findMany({
    where: {
      clubId,
      status: { not: MembershipStatus.INACTIVE },
    },
    orderBy: [
      { status: 'asc' },
      { role: 'asc' },
      { user: { name: 'asc' } },
    ],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          address: true,
          placeOfBirth: true,
          dateOfBirth: true,
          phoneNumber: true,
          firearmCertificateNumber: true,
          firearmCertificateExpiry: true,
          shotgunCertificateNumber: true,
          shotgunCertificateExpiry: true,
          gdprConsentDate: true,
          section21Declarations: {
            orderBy: { signedDate: 'desc' },
            take: 1,
            select: {
              nextDueDate: true,
            },
          },
        },
      },
    },
  });

  const now = new Date();
  const lines = [MEMBER_DEMOGRAPHICS_HEADERS.map(csvCell).join(',')];

  for (const member of members) {
    const latestDeclaration = member.user.section21Declarations[0];
    const section21Status = latestDeclaration
      ? deriveDeclarationStatusFromDueDate(latestDeclaration.nextDueDate, now)
      : 'NOT_DECLARED';

    const row = [
      member.id,
      member.userId,
      member.user.name,
      member.user.email,
      member.status,
      member.role,
      section21Status,
      member.user.address,
      member.user.placeOfBirth,
      member.user.dateOfBirth?.toISOString().slice(0, 10),
      member.user.phoneNumber,
      member.user.firearmCertificateNumber,
      member.user.firearmCertificateExpiry?.toISOString().slice(0, 10),
      member.user.shotgunCertificateNumber,
      member.user.shotgunCertificateExpiry?.toISOString().slice(0, 10),
      member.user.gdprConsentDate?.toISOString(),
    ];

    lines.push(row.map(csvCell).join(','));
  }

  return lines.join('\n');
}

export async function buildMonthlyMemberDemographicsCsv(
  clubId: string,
  _monthStartUtc: Date,
  _monthEndUtcExclusive: Date
): Promise<string> {
  return buildMemberDemographicsCsv(clubId);
}
