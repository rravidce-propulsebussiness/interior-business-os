/**
 * Work that a complete home-construction estimate must explicitly address.
 * These are NOT assumed charges: price a measured BOQ item or confirm that
 * the work is already covered by another contract or excluded from scope.
 */
export const BOQ_SCOPE_WORKS = [
  {
    code: 'soil_disposal',
    name: 'Excavated soil removal and disposal',
    stage: 'foundation',
    unit: 'm³',
  },
  {
    code: 'dewatering',
    name: 'Foundation dewatering (if required)',
    stage: 'foundation',
    unit: 'day',
  },
  {
    code: 'anti_termite',
    name: 'Anti-termite treatment to plinth and foundation',
    stage: 'foundation',
    unit: 'sqft',
  },
  {
    code: 'backfill_compaction',
    name: 'Backfilling, watering and mechanical compaction',
    stage: 'foundation',
    unit: 'm³',
  },
  {
    code: 'dpc',
    name: 'Damp-proof course and DPC bands',
    stage: 'ground',
    unit: 'rft',
  },
  {
    code: 'lintels_sills',
    name: 'Door/window RCC lintels and window sills',
    stage: 'ground',
    unit: 'rft',
  },
  {
    code: 'plaster_mesh',
    name: 'Mesh reinforcement at plaster junctions',
    stage: 'ground',
    unit: 'rft',
  },
  {
    code: 'window_grills',
    name: 'Window grills or safety metalwork',
    stage: 'ground',
    unit: 'sqft',
  },
  {
    code: 'balcony_waterproofing',
    name: 'Balcony and exposed projection waterproofing',
    stage: 'ground',
    unit: 'sqft',
  },
  {
    code: 'elevation',
    name: 'Architectural elevation features and finishing',
    stage: 'ground',
    unit: 'sqft',
  },
  {
    code: 'plinth_protection',
    name: 'Plinth protection around building',
    stage: 'ground',
    unit: 'rft',
  },
  {
    code: 'site_drainage',
    name: 'External drainage and inspection chambers',
    stage: 'ground',
    unit: 'rft',
  },
  {
    code: 'site_paving',
    name: 'Driveway, parking ramp and external paving',
    stage: 'ground',
    unit: 'sqft',
  },
  {
    code: 'sewer_connection',
    name: 'Septic tank, soak pit or sewer connection',
    stage: 'ground',
    unit: 'lot',
  },
  {
    code: 'service_connections',
    name: 'External power/water service connections',
    stage: 'ground',
    unit: 'lot',
  },
  {
    code: 'terrace_protection',
    name: 'Terrace slope screed and waterproofing protection',
    stage: 'top',
    unit: 'sqft',
  },
] as const;

export type BoqScopeWork = (typeof BOQ_SCOPE_WORKS)[number];
export type BoqScopeReview = 'covered' | 'excluded';
export type BoqScopeReviews = Record<string, BoqScopeReview>;
export type BoqScopeStatus =
  'pending' | 'priced' | 'unpriced' | 'covered' | 'excluded';

export type BoqScopeLine = {
  inputs?: Readonly<Record<string, unknown>>;
  outputs?: readonly { quantity: number; rate?: number }[];
};

export function summarizeBoqScope(
  lines: readonly BoqScopeLine[],
  reviews: Readonly<BoqScopeReviews>,
) {
  const items = BOQ_SCOPE_WORKS.map((item) => {
    const found = lines.filter((line) => line.inputs?.scopeCode === item.code);
    let status: BoqScopeStatus = reviews[item.code] ?? 'pending';
    if (found.length)
      status = found.every((line) =>
        (line.outputs ?? []).some(
          (output) => output.quantity > 0 && (output.rate ?? 0) > 0,
        ),
      )
        ? 'priced'
        : 'unpriced';
    return { ...item, status };
  });
  const count = (status: BoqScopeStatus) =>
    items.filter((item) => item.status === status).length;
  const pending = count('pending');
  const unpriced = count('unpriced');
  const priced = count('priced');
  const covered = count('covered');
  const excluded = count('excluded');
  return {
    items,
    total: items.length,
    pending,
    unpriced,
    priced,
    covered,
    excluded,
    complete: pending === 0 && unpriced === 0,
  };
}
