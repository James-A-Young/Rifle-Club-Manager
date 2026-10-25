import { HandicapSystem } from '../types/club';

/**
 * McCrae handicap formula: (GunScore - Handicap) / (100 * 31/30 - Handicap) + 100
 */
function computeMcCraeHandicapScore(gunScore: number, handicap: number): number | null {
  const denominator = (100 * 31 / 30) - handicap;
  if (denominator === 0) return null;
  return (gunScore - handicap) / denominator + 100;
}

export function computeHandicapScore(
  system: HandicapSystem,
  gunScore: number | null,
  handicap: number | null | undefined
): number | null {
  if (system === 'NONE' || gunScore === null || handicap === null || handicap === undefined) return null;
  if (system === 'MCCRAE') return computeMcCraeHandicapScore(gunScore, handicap);
  return null;
}
