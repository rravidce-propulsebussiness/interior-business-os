import type { BoqFloor, WallMeasure } from '@business-os/core/construction-boq';

export const isPenthouseFloor = (floor: BoqFloor): boolean =>
  /penthouse/i.test(floor.name) || (floor.penthouseSqft ?? 0) > 0;

/**
 * Copies only the drawn external wall segments, and only to full floors with
 * no externally measured wall yet. Internal walls, doors, finishes and floors
 * with explicit wall dimensions are never overwritten. Penthouse is excluded.
 */
export function copyExteriorWallsToFullFloors(
  floors: readonly BoqFloor[],
  current: Record<string, WallMeasure[]> | undefined,
  source: string,
): Record<string, WallMeasure[]> {
  const original = current ?? {};
  const sourceFloor = floors.find((floor) => floor.name === source);
  if (!sourceFloor || isPenthouseFloor(sourceFloor)) return original;
  const external = (original[source] ?? []).filter(
    (wall) => wall.location === 'external',
  );
  if (!external.length) return original;
  const copy: Record<string, WallMeasure[]> = { ...original };
  for (const floor of floors) {
    if (floor.name === source || isPenthouseFloor(floor)) continue;
    const existing = copy[floor.name] ?? [];
    if (existing.some((wall) => wall.location === 'external')) continue;
    copy[floor.name] = [
      ...existing,
      ...external.map((wall, index) => ({
        ...wall,
        id: wall.id + '-copy-' + floor.name + '-' + index,
      })),
    ];
  }
  return copy;
}
