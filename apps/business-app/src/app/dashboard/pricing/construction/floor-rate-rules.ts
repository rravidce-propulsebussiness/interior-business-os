/** Package defaults for split-floor pricing.
 * Stored as ONE ordinary, company-scoped package specification to remain
 * compatible with the existing validated package RPC and historical data.
 * This is pricing metadata, not a material and not an extra charged line.
 */
export const FLOOR_RATE_TITLE = 'Floor area price defaults';
export type FloorRateDefaults = { parking: string; penthouse: string };
type SpecLike = { title: string; description: string; brand?: string | undefined; grade?: string | undefined;
  allowancePerSqft?: string | undefined; unit?: string | undefined; pricingTreatment?: string | undefined; allowanceValue?: string | undefined };
const valid = (value: string) =>
  !value || (/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/.test(value) && Number(value) > 0);

export function readFloorRateDefaults(sections: readonly SpecLike[]): FloorRateDefaults {
  const spec = sections.find(section => section.title === FLOOR_RATE_TITLE);
  if (!spec) return { parking: '', penthouse: '' };
  try {
    const value: unknown = JSON.parse(spec.description);
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return { parking: '', penthouse: '' };
    const object = value as Record<string, unknown>;
    const parking = typeof object.parking === 'string' ? object.parking : '';
    const penthouse = typeof object.penthouse === 'string' ? object.penthouse : '';
    return {
      parking: valid(parking) ? parking : '',
      penthouse: valid(penthouse) ? penthouse : '',
    };
  } catch { return { parking: '', penthouse: '' }; }
}

export function writeFloorRateDefaults<T extends SpecLike>(
  source: readonly T[], rates: FloorRateDefaults, maximum = 18,
): T[] {
  if (!valid(rates.parking) || !valid(rates.penthouse))
    throw new Error('Enter valid positive parking and penthouse rates per SFT.');
  const rows = source.filter(s => s.title !== FLOOR_RATE_TITLE);
  if (!rates.parking && !rates.penthouse) return [...rows];
  if (rows.length >= maximum)
    throw new Error('Package is full. Remove one specification to add separate parking/penthouse rates.');
  const metadata = {
    title: FLOOR_RATE_TITLE,
    description: JSON.stringify({ parking: rates.parking, penthouse: rates.penthouse }),
    brand: '', grade: '', allowancePerSqft: '', unit: 'sqft',
    pricingTreatment: 'included', allowanceValue: '',
  };
  return [...rows, metadata as T];
}
