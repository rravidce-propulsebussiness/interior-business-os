/** Select a penthouse *instead* of an ordinary constructed floor.
 * Retain dimensions and rate; never bill the same level twice.
 * Legacy quotations containing both rows are normalized in the editor.
 */
export type PenthouseFloor = {
  kind: 'floor' | 'additional';
  name: string;
  lengthFeet: string;
  widthFeet: string;
  ratePerSqft: string;
  inheritFromPrevious?: boolean | undefined;
};
const names = [
  'Ground Floor',
  'First Floor',
  'Second Floor',
  'Third Floor',
  'Fourth Floor',
  'Fifth Floor',
  'Sixth Floor',
  'Seventh Floor',
] as const;
export const floorNumber = (name: string) =>
  names.findIndex((n) => name === n || name.startsWith(n + ' — '));
export const penthouseName = (level: number) => names[level] + ' — Penthouse';

/** Prefer an explicitly edited penthouse row when legacy data has both. */
export function normalizePenthouseFloors<T extends PenthouseFloor>(
  rows: readonly T[],
): T[] {
  const penthouseLevels = new Set(
    rows
      .filter((r) => r.kind === 'floor' && r.name.endsWith(' — Penthouse'))
      .map((r) => floorNumber(r.name)),
  );
  const seen = new Set<number>();
  return rows
    .filter((r) => {
      if (r.kind !== 'floor') return true;
      const level = floorNumber(r.name);
      if (!penthouseLevels.has(level)) return true;
      if (r.name !== penthouseName(level) || seen.has(level)) return false;
      seen.add(level);
      return true;
    })
    .map((r) =>
      r.kind === 'floor' && r.name.endsWith(' — Penthouse')
        ? { ...r, inheritFromPrevious: false }
        : r,
    );
}

export function selectPenthouseFloor<T extends PenthouseFloor>(
  rows: readonly T[],
  level: number,
): T[] {
  const eligible = rows.filter(
    (r) => r.kind === 'floor' && floorNumber(r.name) === level,
  );
  const existing = eligible.find((r) => r.name === penthouseName(level));
  const construction = eligible.find((r) => r.name === names[level]);
  const source = existing ?? construction ?? eligible[0];
  if (!source) return [...rows];
  const updated = rows.map((r) =>
    r === source
      ? { ...r, name: penthouseName(level), inheritFromPrevious: false }
      : r,
  );
  return normalizePenthouseFloors(updated);
}

export function selectNormalFloor<T extends PenthouseFloor>(
  rows: readonly T[],
  level: number,
): T[] {
  return rows.map((r) =>
    r.kind === 'floor' && r.name === penthouseName(level)
      ? { ...r, name: names[level]!, inheritFromPrevious: false }
      : r,
  );
}
