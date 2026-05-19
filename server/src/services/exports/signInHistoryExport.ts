import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { prisma } from '../../prisma';

const CSV_BATCH_SIZE = 1000;

export function csvCell(value: unknown): string {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

export const SIGN_IN_HISTORY_HEADERS = [
  'visit_id',
  'visitor_type',
  'visitor_name',
  'visitor_email',
  'guest_club_represented',
  'purpose',
  'firearm_serial',
  'firearm_make',
  'firearm_model',
  'firearm_caliber',
  'time_in',
  'time_out',
];

type SignInHistoryRow = {
  id: string;
  userId: string | null;
  purpose: string;
  timeIn: Date;
  timeOut: Date | null;
  guestName: string | null;
  guestEmail: string | null;
  guestClubRepresented: string | null;
  user: {
    name: string;
    email: string;
  } | null;
  firearmUsed: {
    serialNumber: string;
    make: string;
    model: string;
    caliber: string;
  } | null;
};

function applyHistoryCursor(
  where: Prisma.VisitLogWhereInput,
  cursor: { timeIn: Date; id: string } | null
): Prisma.VisitLogWhereInput {
  if (!cursor) {
    return where;
  }

  return {
    AND: [
      where,
      {
        OR: [
          { timeIn: { lt: cursor.timeIn } },
          {
            AND: [
              { timeIn: cursor.timeIn },
              { id: { lt: cursor.id } },
            ],
          },
        ],
      },
    ],
  };
}

function rowToCsv(row: SignInHistoryRow): string {
  const visitorType = row.userId ? 'member' : 'guest';
  const visitorName = row.userId ? row.user?.name : row.guestName;
  const visitorEmail = row.userId ? row.user?.email : row.guestEmail;

  return [
    csvCell(row.id),
    csvCell(visitorType),
    csvCell(visitorName ?? ''),
    csvCell(visitorEmail ?? ''),
    csvCell(row.guestClubRepresented ?? ''),
    csvCell(row.purpose),
    csvCell(row.firearmUsed?.serialNumber ?? ''),
    csvCell(row.firearmUsed?.make ?? ''),
    csvCell(row.firearmUsed?.model ?? ''),
    csvCell(row.firearmUsed?.caliber ?? ''),
    csvCell(row.timeIn.toISOString()),
    csvCell(row.timeOut ? row.timeOut.toISOString() : ''),
  ].join(',');
}

export async function streamSignInHistoryCsv(
  res: Response,
  where: Prisma.VisitLogWhereInput
): Promise<void> {
  res.write(`${SIGN_IN_HISTORY_HEADERS.join(',')}\n`);

  let cursor: { timeIn: Date; id: string } | null = null;

  while (true) {
    const rows: SignInHistoryRow[] = await prisma.visitLog.findMany({
      where: applyHistoryCursor(where, cursor),
      take: CSV_BATCH_SIZE,
      orderBy: [
        { timeIn: 'desc' },
        { id: 'desc' },
      ],
      select: {
        id: true,
        userId: true,
        purpose: true,
        timeIn: true,
        timeOut: true,
        guestName: true,
        guestEmail: true,
        guestClubRepresented: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        firearmUsed: {
          select: {
            serialNumber: true,
            make: true,
            model: true,
            caliber: true,
          },
        },
      },
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      res.write(`${rowToCsv(row)}\n`);
    }

    if (rows.length < CSV_BATCH_SIZE) {
      break;
    }

    const last = rows[rows.length - 1];
    cursor = { timeIn: last.timeIn, id: last.id };
  }
}

export async function buildSignInHistoryCsvForMonth(
  clubId: string,
  monthStartUtc: Date,
  monthEndUtcExclusive: Date
): Promise<string> {
  const lines: string[] = [SIGN_IN_HISTORY_HEADERS.join(',')];
  const where: Prisma.VisitLogWhereInput = {
    clubId,
    timeIn: {
      gte: monthStartUtc,
      lt: monthEndUtcExclusive,
    },
  };

  let cursor: { timeIn: Date; id: string } | null = null;

  while (true) {
    const rows: SignInHistoryRow[] = await prisma.visitLog.findMany({
      where: applyHistoryCursor(where, cursor),
      take: CSV_BATCH_SIZE,
      orderBy: [{ timeIn: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        userId: true,
        purpose: true,
        timeIn: true,
        timeOut: true,
        guestName: true,
        guestEmail: true,
        guestClubRepresented: true,
        user: { select: { name: true, email: true } },
        firearmUsed: { select: { serialNumber: true, make: true, model: true, caliber: true } },
      },
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      lines.push(rowToCsv(row));
    }

    if (rows.length < CSV_BATCH_SIZE) break;
    const last = rows[rows.length - 1];
    cursor = { timeIn: last.timeIn, id: last.id };
  }

  return lines.join('\n');
}
