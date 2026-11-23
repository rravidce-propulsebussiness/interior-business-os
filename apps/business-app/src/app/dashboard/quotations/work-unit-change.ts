export type WorkUnit =
  'sqft' | 'wall_sqft' | 'running_ft' | 'cubic_ft' | 'piece' | 'lumpsum';

type UnitDimensions = {
  unit?: WorkUnit | undefined;
  lengthFeet: string;
  widthFeet: string;
  quantity?: string | undefined;
};

const counted = (unit: WorkUnit | undefined) =>
  unit === 'piece' || unit === 'lumpsum';

/**
 * Dimensions to apply when a work item's unit changes.
 *
 * Piece and lump-sum items hide length/width, but the saved estimate still
 * requires positive dimensions, so they carry the same neutral `1` that new
 * counted items start with. Switching back to a measured unit clears those
 * placeholders instead of silently pricing one foot.
 */
export function workUnitChange(
  row: UnitDimensions,
  unit: WorkUnit,
): {
  unit: WorkUnit;
  lengthFeet: string;
  widthFeet: string;
  quantity: string | undefined;
} {
  const wasCounted = counted(row.unit);
  const areaOrVolume = unit === 'sqft' || unit === 'cubic_ft';
  if (counted(unit))
    return { unit, lengthFeet: '1', widthFeet: '1', quantity: '1' };
  return {
    unit,
    lengthFeet: wasCounted ? '' : row.lengthFeet,
    widthFeet: areaOrVolume ? (wasCounted ? '' : row.widthFeet) : '1',
    quantity: undefined,
  };
}
