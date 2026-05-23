import { CompetitionFormat } from '@prisma/client';

export interface DivisionEntry {
  id?: string;
  displayName: string;
  declaredAverage: number;
  clubId?: string | null;
  userId?: string | null;
}

export interface BogeyEntry {
  displayName: string;
  declaredAverage: number;
  isBogey: true;
  bogeyScore: number;
}

export type DivisionMember = DivisionEntry | BogeyEntry;

export interface SuggestedDivision {
  name: string;
  entries: DivisionMember[];
}

/**
 * Sort entries by declaredAverage descending and chunk them into divisions of
 * approximately `targetDivisionSize` entries.
 *
 * For LEAGUE format: if a division ends up with an odd number of entries, a
 * bogey entry is automatically injected. The bogeyScore is the integer floor
 * of the mean of the division's declared averages.
 */
export function suggestDivisions(
  entries: DivisionEntry[],
  targetDivisionSize: number,
  format: CompetitionFormat,
): SuggestedDivision[] {
  if (entries.length === 0) return [];
  if (targetDivisionSize < 2) targetDivisionSize = 2;

  // Sort highest average first (seeding)
  const sorted = [...entries].sort((a, b) => b.declaredAverage - a.declaredAverage);

  // Chunk into divisions
  const chunks: DivisionEntry[][] = [];
  for (let i = 0; i < sorted.length; i += targetDivisionSize) {
    chunks.push(sorted.slice(i, i + targetDivisionSize));
  }

  return chunks.map((chunk, index) => {
    const members: DivisionMember[] = [...chunk];

    // For league format, ensure even number of entries for round-robin pairing
    if (format === CompetitionFormat.LEAGUE && members.length % 2 !== 0) {
      const avg = members.reduce((sum, e) => sum + e.declaredAverage, 0) / members.length;
      const bogeyScore = Math.floor(avg);
      const bogey: BogeyEntry = {
        displayName: 'Bogey',
        declaredAverage: bogeyScore,
        isBogey: true,
        bogeyScore,
      };
      members.push(bogey);
    }

    const divisionNumber = index + 1;
    return {
      name: `Division ${divisionNumber}`,
      entries: members,
    };
  });
}
