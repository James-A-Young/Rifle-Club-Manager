import { prisma } from '../../prisma.js';
import { csvCell } from './signInHistoryExport.js';

export const COMPETITION_RESULTS_HEADERS = [
  'Season',
  'Competition',
  'Round',
  'Due Date',
  'Card Number',
  'Member Name',
  'Member Email',
  'Score',
  'Updated At',
];

type RawCompetitionRow = {
  cardNumber: number;
  score: number | null;
  updatedAt: Date;
  competition: { name: string };
  round: { roundNumber: number; dueDate: Date };
  user: { name: string; email: string };
};

function compareRows(a: RawCompetitionRow, b: RawCompetitionRow): number {
  const byCompetition = a.competition.name.localeCompare(b.competition.name);
  if (byCompetition !== 0) return byCompetition;
  const byRound = a.round.roundNumber - b.round.roundNumber;
  if (byRound !== 0) return byRound;
  const byCard = a.cardNumber - b.cardNumber;
  if (byCard !== 0) return byCard;
  return a.user.name.localeCompare(b.user.name);
}

function rowToCsv(seasonName: string, row: RawCompetitionRow): string {
  return [
    csvCell(seasonName),
    csvCell(row.competition.name),
    csvCell(row.round.roundNumber),
    csvCell(row.round.dueDate.toISOString()),
    csvCell(row.cardNumber),
    csvCell(row.user.name),
    csvCell(row.user.email),
    csvCell(row.score ?? ''),
    csvCell(row.updatedAt.toISOString()),
  ].join(',');
}

export async function buildRawSeasonCompetitionResultsCsv(params: {
  clubId: string;
  seasonId: string;
  competitionId?: string;
}): Promise<{ csv: string; seasonName: string }> {
  const season = await prisma.season.findFirst({
    where: { id: params.seasonId, clubId: params.clubId },
    select: { id: true, name: true },
  });

  if (!season) {
    throw new Error('SEASON_NOT_FOUND');
  }

  const scoreRows = await prisma.score.findMany({
    where: {
      competition: {
        clubId: params.clubId,
        seasonId: params.seasonId,
        ...(params.competitionId && { id: params.competitionId }),
      },
    },
    select: {
      cardNumber: true,
      score: true,
      updatedAt: true,
      competition: { select: { name: true } },
      round: { select: { roundNumber: true, dueDate: true } },
      user: { select: { name: true, email: true } },
    },
  });

  const sorted = [...scoreRows].sort(compareRows);
  const rows = sorted.map(row => rowToCsv(season.name, row));
  return {
    csv: [COMPETITION_RESULTS_HEADERS.map(h => csvCell(h)).join(','), ...rows].join('\n'),
    seasonName: season.name,
  };
}

export async function buildMonthlyCompetitionResultsCsv(
  clubId: string,
  monthStartUtc: Date,
  monthEndUtcExclusive: Date
): Promise<string> {
  const rows = await prisma.score.findMany({
    where: {
      competition: { clubId },
      updatedAt: {
        gte: monthStartUtc,
        lt: monthEndUtcExclusive,
      },
    },
    select: {
      cardNumber: true,
      score: true,
      updatedAt: true,
      competition: { select: { name: true, season: { select: { name: true } } } },
      round: { select: { roundNumber: true, dueDate: true } },
      user: { select: { name: true, email: true } },
    },
  });

  const sorted = [...rows].sort((a, b) => {
    const bySeason = a.competition.season.name.localeCompare(b.competition.season.name);
    if (bySeason !== 0) return bySeason;
    const byComp = a.competition.name.localeCompare(b.competition.name);
    if (byComp !== 0) return byComp;
    const byRound = a.round.roundNumber - b.round.roundNumber;
    if (byRound !== 0) return byRound;
    const byCard = a.cardNumber - b.cardNumber;
    if (byCard !== 0) return byCard;
    return a.user.name.localeCompare(b.user.name);
  });

  const lines = [COMPETITION_RESULTS_HEADERS.map(h => csvCell(h)).join(',')];
  for (const row of sorted) {
    lines.push([
      csvCell(row.competition.season.name),
      csvCell(row.competition.name),
      csvCell(row.round.roundNumber),
      csvCell(row.round.dueDate.toISOString()),
      csvCell(row.cardNumber),
      csvCell(row.user.name),
      csvCell(row.user.email),
      csvCell(row.score ?? ''),
      csvCell(row.updatedAt.toISOString()),
    ].join(','));
  }

  return lines.join('\n');
}

