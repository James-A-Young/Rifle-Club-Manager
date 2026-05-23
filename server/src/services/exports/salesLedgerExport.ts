import { Prisma } from '../../generated/client.js';
import { Response } from 'express';
import { prisma } from '../../prisma.js';
import { csvCell } from './signInHistoryExport.js';

const CSV_BATCH_SIZE = 1000;

export const SALES_LEDGER_HEADERS = [
  'sale_id',
  'sold_at',
  'buyer_first_name',
  'buyer_last_name',
  'buyer_user_id',
  'seller_user_id',
  'seller_name',
  'ammunition_type',
  'safe_name',
  'quantity',
  'unit_price_pence',
  'total_price_pence',
  'payment_method',
];

type SalesRow = {
  id: string;
  createdAt: Date;
  buyerFirstName: string;
  buyerLastName: string;
  buyerUserId: string | null;
  soldByUserId: string;
  quantity: number;
  unitPricePence: number;
  totalPricePence: number;
  paymentMethod: string;
  soldBy: { name: string };
  ammunitionType: { name: string };
  ammunitionSafe: { name: string };
};

function applySalesCursor(
  where: Prisma.AmmunitionSaleWhereInput,
  cursor: { createdAt: Date; id: string } | null
): Prisma.AmmunitionSaleWhereInput {
  if (!cursor) return where;

  return {
    AND: [
      where,
      {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          {
            AND: [
              { createdAt: cursor.createdAt },
              { id: { lt: cursor.id } },
            ],
          },
        ],
      },
    ],
  };
}

function rowToCsv(row: SalesRow): string {
  return [
    csvCell(row.id),
    csvCell(row.createdAt.toISOString()),
    csvCell(row.buyerFirstName),
    csvCell(row.buyerLastName),
    csvCell(row.buyerUserId ?? ''),
    csvCell(row.soldByUserId),
    csvCell(row.soldBy.name),
    csvCell(row.ammunitionType.name),
    csvCell(row.ammunitionSafe.name),
    csvCell(row.quantity),
    csvCell(row.unitPricePence),
    csvCell(row.totalPricePence),
    csvCell(row.paymentMethod),
  ].join(',');
}

export async function streamSalesLedgerCsv(
  res: Response,
  where: Prisma.AmmunitionSaleWhereInput
): Promise<void> {
  res.write(`${SALES_LEDGER_HEADERS.join(',')}\n`);
  let cursor: { createdAt: Date; id: string } | null = null;

  while (true) {
    const rows: SalesRow[] = await prisma.ammunitionSale.findMany({
      where: applySalesCursor(where, cursor),
      take: CSV_BATCH_SIZE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        soldBy: { select: { name: true } },
        ammunitionType: { select: { name: true } },
        ammunitionSafe: { select: { name: true } },
      },
    });

    if (rows.length === 0) break;
    for (const row of rows) {
      res.write(`${rowToCsv(row)}\n`);
    }
    if (rows.length < CSV_BATCH_SIZE) break;
    const last = rows[rows.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }
}

export async function buildSalesLedgerCsvForMonth(
  clubId: string,
  monthStartUtc: Date,
  monthEndUtcExclusive: Date
): Promise<string> {
  const lines: string[] = [SALES_LEDGER_HEADERS.join(',')];
  const where: Prisma.AmmunitionSaleWhereInput = {
    clubId,
    createdAt: {
      gte: monthStartUtc,
      lt: monthEndUtcExclusive,
    },
  };

  let cursor: { createdAt: Date; id: string } | null = null;
  while (true) {
    const rows: SalesRow[] = await prisma.ammunitionSale.findMany({
      where: applySalesCursor(where, cursor),
      take: CSV_BATCH_SIZE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        soldBy: { select: { name: true } },
        ammunitionType: { select: { name: true } },
        ammunitionSafe: { select: { name: true } },
      },
    });

    if (rows.length === 0) break;
    for (const row of rows) {
      lines.push(rowToCsv(row));
    }
    if (rows.length < CSV_BATCH_SIZE) break;
    const last = rows[rows.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }

  return lines.join('\n');
}
