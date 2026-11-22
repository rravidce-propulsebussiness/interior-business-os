/**
 * Beam entry stores the total running feet per floor, with optional
 * identical-member counts. When changing an already measured count,
 * retain the previous length of each physical beam.
 *
 * Migrating an old total-run-only entry (count = 0) keeps that total
 * unchanged so previously saved BOQs are never inflated.
 */
export function beamTotalRunAfterCountChange(
  totalRunFeet: number,
  oldCount: number,
  newCount: number,
): number {
  if (!(Number.isFinite(totalRunFeet) && totalRunFeet > 0))
    return 0;
  if (!(oldCount > 0 && newCount > 0))
    return totalRunFeet;
  return (totalRunFeet / oldCount) * newCount;
}
