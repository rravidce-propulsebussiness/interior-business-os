/** Construction floors follow the level directly below unless explicitly
 * customized. Parking and penthouse portions remain independent. This helper
 * has no browser or React dependency so propagation can be tested directly. */
export type FloorWork = {
  kind: 'floor' | 'additional';
  name: string;
  lengthFeet: string;
  widthFeet: string;
  ratePerSqft: string;
  inheritFromPrevious?: boolean | undefined;
};
export const LEVEL_NAMES = [
  'Ground Floor',
  'First Floor',
  'Second Floor',
  'Third Floor',
  'Fourth Floor',
  'Fifth Floor',
  'Sixth Floor',
  'Seventh Floor',
] as const;
export type FloorZone = 'construction' | 'parking' | 'penthouse';
export const floorLevel = (name: string) =>
  LEVEL_NAMES.findIndex((n) => name === n || name.startsWith(n + ' — '));
export const floorZone = (name: string): FloorZone =>
  name.endsWith(' — Parking')
    ? 'parking'
    : name.endsWith(' — Penthouse')
      ? 'penthouse'
      : 'construction';
const numericArea = (row: FloorWork) =>
  (Number(row.lengthFeet) || 0) * (Number(row.widthFeet) || 0);
const isFloor = (row: FloorWork, level: number) =>
  row.kind === 'floor' && floorLevel(row.name) === level;
export function followPreviousFloor<T extends FloorWork>(
  rows: readonly T[],
  level: number,
): T[] {
  if (level <= 0) return [...rows];
  const previous = rows.filter((row) => isFloor(row, level - 1));
  const source = previous.find((row) => floorZone(row.name) === 'construction');
  const area = previous.reduce((sum, row) => sum + numericArea(row), 0);
  if (!previous.length) return [...rows];
  // A split floor contributes its combined footprint to the next floor.
  const dimensions =
    source && previous.length === 1
      ? { lengthFeet: source.lengthFeet, widthFeet: source.widthFeet }
      : {
          lengthFeet: area > 0 ? String(Number(area.toFixed(2))) : '',
          widthFeet: area > 0 ? '1' : '',
        };
  return rows.map((row) =>
    isFloor(row, level) &&
    floorZone(row.name) === 'construction' &&
    row.inheritFromPrevious !== false
      ? {
          ...row,
          ...dimensions,
          ratePerSqft: source?.ratePerSqft || row.ratePerSqft,
          inheritFromPrevious: true,
        }
      : row,
  );
}
export function propagateFloorChanges<T extends FloorWork>(
  original: readonly T[],
  index: number,
  patch: Partial<T>,
): T[] {
  const originalRow = original[index];
  if (!originalRow) return [...original];
  const changed = original.map((row, i) =>
    i === index
      ? {
          ...row,
          ...patch,
          ...(row.kind === 'floor' &&
          floorLevel(row.name) > 0 &&
          floorZone(row.name) === 'construction'
            ? { inheritFromPrevious: false }
            : {}),
        }
      : row,
  );
  if (originalRow.kind !== 'floor') return changed;
  const start = floorLevel(originalRow.name);
  if (start < 0) return changed;
  let updated = changed;
  for (let level = start + 1; level < LEVEL_NAMES.length; level++) {
    updated = followPreviousFloor(updated, level);
  }
  if (floorZone(originalRow.name) !== 'construction') return updated;
  // Penthouse is constructed area: when it still uses the construction
  // rate, carry a changed construction rate through to the same-level
  // penthouse. Never overwrite a separately customized penthouse rate.
  return updated.map((row) => {
    if (row.kind !== 'floor' || floorZone(row.name) !== 'penthouse') return row;
    const level = floorLevel(row.name);
    const before = original.find(
      (x) => isFloor(x, level) && floorZone(x.name) === 'construction',
    );
    const after = updated.find(
      (x) => isFloor(x, level) && floorZone(x.name) === 'construction',
    );
    if (
      !before ||
      !after ||
      row.ratePerSqft !== before.ratePerSqft ||
      after.ratePerSqft === before.ratePerSqft
    )
      return row;
    return { ...row, ratePerSqft: after.ratePerSqft };
  });
}
export function restoreFloorFollowing<T extends FloorWork>(
  rows: readonly T[],
  level: number,
): T[] {
  const reset = rows.map((row) =>
    isFloor(row, level) && floorZone(row.name) === 'construction'
      ? { ...row, inheritFromPrevious: true }
      : row,
  );
  let updated = reset;
  for (let next = level; next < LEVEL_NAMES.length; next++)
    updated = followPreviousFloor(updated, next);
  return updated;
}
