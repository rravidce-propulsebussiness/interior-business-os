/** Package defaults for split-floor pricing.
 * Stored as ONE ordinary, company-scoped package specification to remain
 * compatible with the existing validated package RPC and historical data.
 * This is pricing metadata, not a material and not an extra charged line.
 */
export const FLOOR_RATE_TITLE = 'Floor area price defaults';
export type FloorRateDefaults = { parking: string; penthouse: string };
type SpecLike = {
  title: string;
  description: string;
  brand?: string | undefined;
  grade?: string | undefined;
  allowancePerSqft?: string | undefined;
  unit?: string | undefined;
  pricingTreatment?: string | undefined;
  allowanceValue?: string | undefined;
};
const valid = (value: string) =>
  !value || (/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/.test(value) && Number(value) > 0);

export function readFloorRateDefaults(
  sections: readonly SpecLike[],
): FloorRateDefaults {
  const spec = sections.find((section) => section.title === FLOOR_RATE_TITLE);
  if (!spec) return { parking: '', penthouse: '' };
  try {
    const value: unknown = JSON.parse(spec.description);
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return { parking: '', penthouse: '' };
    const object = value as Record<string, unknown>;
    const parking = typeof object.parking === 'string' ? object.parking : '';
    const penthouse =
      typeof object.penthouse === 'string' ? object.penthouse : '';
    return {
      parking: valid(parking) ? parking : '',
      penthouse: valid(penthouse) ? penthouse : '',
    };
  } catch {
    return { parking: '', penthouse: '' };
  }
}

/** Recognize the existing company package specification, never the plinth
 * height, bathroom tile height or an ambiguous range. */
const FLOOR_HEIGHT_SPEC_TITLE = 'plinth and floor-to-floor heights';
const floorHeightPattern = () =>
  /\bfloor[- ]to[- ]floor(?:\s+finished)?\s+height\s*(?:(?:is|of)\s+|[:=]\s*)?([0-9]+(?:\.[0-9]{1,2})?)\s*(?:ft\b|feet\b)(?=\s*(?:[.;,]|$))/gi;
const isHeightSpec = (section: SpecLike) =>
  section.title.trim().toLowerCase() === FLOOR_HEIGHT_SPEC_TITLE;
const validHeight = (value: string) =>
  valid(value) && Number(value) > 0 && Number(value) <= 9999.99;

export function readSpecificationFloorHeight(
  sections: readonly SpecLike[],
): string {
  const values = sections.filter(isHeightSpec).flatMap((section) =>
    Array.from(section.description.matchAll(floorHeightPattern()), (match) =>
      match[1] ?? '',
    ).filter(validHeight),
  );
  const unique = new Set(values.map(Number));
  return unique.size === 1 ? String([...unique][0]) : '';
}

/** Prefer an explicit numeric field, then the original package specification. */
export function readPackageFloorHeight(sections: readonly SpecLike[]): string {
  const spec = sections.find((section) => section.title === FLOOR_RATE_TITLE);
  try {
    const value: unknown = JSON.parse(spec?.description ?? '{}')?.heightFeet;
    if (typeof value === 'string' && validHeight(value)) return value;
  } catch {
    // Older package metadata may not contain a machine-readable height.
  }
  return readSpecificationFloorHeight(sections);
}

export function writeFloorRateDefaults<T extends SpecLike>(
  source: readonly T[],
  rates: FloorRateDefaults,
  maximum = 18,
  heightFeet = readPackageFloorHeight(source),
): T[] {
  if (!valid(heightFeet) || Number(heightFeet) > 9999.99)
    throw new Error('Enter a valid positive floor-to-floor height in feet.');
  if (!valid(rates.parking) || !valid(rates.penthouse))
    throw new Error(
      'Enter valid positive parking and penthouse rates per SFT.',
    );
  const rows = source.filter((s) => s.title !== FLOOR_RATE_TITLE).map((section) =>
    heightFeet && isHeightSpec(section)
      ? { ...section, description: section.description.replace(floorHeightPattern(), (match, value: string) => match.replace(value, heightFeet)) }
      : section,
  );
  if (!rates.parking && !rates.penthouse && !heightFeet) return [...rows];
  if (rows.length >= maximum)
    throw new Error(
      'Package is full. Remove one specification to add floor defaults.',
    );
  const metadata = {
    title: FLOOR_RATE_TITLE,
    description: JSON.stringify({
      parking: rates.parking,
      penthouse: rates.penthouse,
      ...(heightFeet ? { heightFeet } : {}),
    }),
    brand: '',
    grade: '',
    allowancePerSqft: '',
    unit: 'sqft',
    pricingTreatment: 'included',
    allowanceValue: '',
  };
  return [...rows, metadata as T];
}

/** Fill only missing floor heights from a configured package. Never touch
 * additional work measurements, existing quote dimensions, rates or totals. */
export function applyPackageFloorHeight<
  T extends {
    kind?: 'floor' | 'additional' | undefined;
    heightFeet?: string | undefined;
  },
>(rows: T[], heightFeet: string): T[] {
  if (
    !valid(heightFeet) ||
    !(Number(heightFeet) > 0) ||
    Number(heightFeet) > 9999.99
  )
    return rows;
  let changed = false;
  const result = rows.map((row) => {
    if ((row.kind ?? 'floor') !== 'floor' || Number(row.heightFeet) > 0)
      return row;
    changed = true;
    return { ...row, heightFeet };
  });
  return changed ? result : rows;
}

/** Resolve the exact tenant package from the saved quotation snapshot.
 * For older snapshots without an ID, require an unambiguous code and name.
 * Do not silently switch to another package or invent a height. */
export function linkedPackageFloorHeight(
  snapshot: { id?: string | undefined; code: string; name: string } | undefined,
  packages: readonly {
    id: string;
    code: string;
    name: string;
    specSections: readonly SpecLike[];
  }[],
): string {
  if (!snapshot) return '';
  const matches = packages.filter((pkg) =>
    snapshot.id
      ? pkg.id === snapshot.id
      : pkg.code === snapshot.code && pkg.name === snapshot.name,
  );
  return matches.length === 1
    ? readPackageFloorHeight(matches[0]!.specSections)
    : '';
}
