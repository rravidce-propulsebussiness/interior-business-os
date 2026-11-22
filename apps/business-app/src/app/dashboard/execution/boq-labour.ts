/** Project-scoped BOQ labour estimation. Pure: no React, database, or payroll. */
export const LABOUR_WORKS = [
  { id: 'bar-bending', name: 'Bar bending' },
  { id: 'shuttering', name: 'Shuttering' },
  { id: 'concreting', name: 'Structural concreting' },
  { id: 'brickwork', name: 'Brickwork' },
  { id: 'plastering', name: 'Plastering' },
  { id: 'parapet', name: 'Parapet wall' },
  { id: 'compound', name: 'Compound wall' },
  { id: 'elevation', name: 'Elevation' },
  { id: 'excavation', name: 'Excavation' },
  { id: 'pcc', name: 'PCC work' },
  { id: 'sajjas', name: 'Sajjas / sunshades' },
  { id: 'shelves', name: 'RCC shelves' },
  { id: 'tiling', name: 'Tile laying' },
  { id: 'painting', name: 'Painting' },
  { id: 'electrical', name: 'Electrical labour' },
  { id: 'plumbing', name: 'Plumbing labour' },
  { id: 'other', name: 'Other / miscellaneous' },
] as const;
export type LabourWorkId = (typeof LABOUR_WORKS)[number]['id'];
export type LabourMethod = 'composite' | 'itemwise' | 'daily';
export type LabourExtraMethod = 'itemwise' | 'daily';
export type LabourExtra = {
  id: string;
  name: string;
  stage: string;
  work: LabourWorkId;
  /** Multiple trades can share one rate and one selected measurement basis. */
  includedWorks?: LabourWorkId[];
  method: LabourExtraMethod;
  unit: string;
  /** Captured quantity, or updated automatically from the matching measured BOQ work. */
  quantity: number;
  quantitySource: 'manual' | 'boq';
  rate: number;
  workers: number;
  days: number;
  /** Explicit additional scope outside a composite package, never a duplicate of covered work. */
  outsideScope: boolean;
};
export type LabourDayRate = {
  id: string;
  name: string;
  workers: number;
  days: number;
  rate: number;
};
export type LabourConfig = {
  version: 1;
  method: LabourMethod;
  packageName: string;
  rate: number;
  /** Null uses total quotation floor area, otherwise agreed contract area. */
  areaOverrideSqft: number | null;
  coveredWorks: LabourWorkId[];
  itemRates: Partial<Record<LabourWorkId, number>>;
  dailyRates: LabourDayRate[];
  extras: LabourExtra[];
};
export type LabourLine = {
  id: string;
  name: string;
  section: string;
  kind: string;
  inputs: Record<string, string | number | boolean>;
  outputs: {
    name: string;
    material?: string;
    quantity: number;
    unit: string;
    weightKg?: number;
  }[];
};
export type LabourMeasure = {
  stage: string;
  work: LabourWorkId;
  quantity: number;
  unit: string;
};

export const COVERED_BY_DEFAULT: LabourWorkId[] = [
  'bar-bending',
  'shuttering',
  'concreting',
  'brickwork',
  'plastering',
  'parapet',
  'compound',
  'elevation',
];
export const LEGACY_CIVIL_LABOUR_MATERIALS = new Set([
  'labour_civil',
  'labour_rcc',
  'labour_brickwork_9',
  'labour_brickwork_4',
  'plaster_labour',
  'shuttering',
]);
export const DEFAULT_LABOUR: LabourConfig = {
  version: 1,
  method: 'composite',
  packageName: 'Full Civil Labour',
  rate: 400,
  areaOverrideSqft: null,
  coveredWorks: [...COVERED_BY_DEFAULT],
  itemRates: {},
  dailyRates: [
    { id: 'mason', name: 'Mason', workers: 0, days: 0, rate: 1000 },
    { id: 'helper', name: 'Helper', workers: 0, days: 0, rate: 650 },
  ],
  extras: [],
};
const finite = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const normalizeUnit = (unit: string) =>
  unit
    .toLowerCase()
    .replace(/sq\.?\s*ft|sqft|sft/g, 'sft')
    .replace(/cubic metres?|cum|m³/g, 'm³')
    .trim();
const cap = (v: number) => Math.round(v * 100) / 100;

export function labourWorkName(work: LabourWorkId): string {
  return LABOUR_WORKS.find((item) => item.id === work)?.name ?? work;
}

/** Stage-wise takeoff measurements are informational even if covered by one contract. */
export function labourMeasurements(
  lines: readonly LabourLine[],
): LabourMeasure[] {
  const rows = new Map<string, LabourMeasure>();
  const push = (
    stage: string,
    work: LabourWorkId,
    quantity: number,
    unit: string,
  ) => {
    if (!(finite(quantity) > 0)) return;
    const key = [stage, work, normalizeUnit(unit)].join('|');
    const previous = rows.get(key);
    rows.set(key, {
      stage,
      work,
      unit: normalizeUnit(unit),
      quantity: cap((previous?.quantity ?? 0) + quantity),
    });
  };
  for (const line of lines) {
    const kind = line.kind.toLowerCase();
    const category = String(line.inputs.stageCategory ?? '').toLowerCase();
    for (const output of line.outputs) {
      const name = output.name.toLowerCase();
      const material = output.material ?? '';
      const unit = normalizeUnit(output.unit);
      const qty = finite(output.quantity);
      // Steel purchase outputs carry a calculated weight; count that once as a
      // separate bar-bending measurement, not as a second material charge.
      if (material === 'steel' && finite(output.weightKg ?? 0) > 0) {
        push(line.section, 'bar-bending', output.weightKg ?? 0, 'kg');
        continue;
      }
      if (
        unit === 'sft' &&
        (/shuttering|centering|formwork/.test(name) ||
          material === 'shuttering')
      ) {
        push(line.section, category === 'sajjas' ? 'sajjas' :
          category === 'shelves' ? 'shelves' : 'shuttering', qty, unit);
        continue;
      }
      if (
        unit === 'm³' &&
        (/concrete volume|concrete \(/.test(name) ||
          material === 'concrete_m20')
      ) {
        push(line.section, 'concreting', qty, unit);
        continue;
      }
      if (material === 'labour_civil' || material === 'labour_rcc') continue;
      if (
        kind === 'quote-compound-wall' &&
        unit === 'sft' &&
        /wall/.test(name)
      ) {
        push(line.section, 'compound', qty, unit);
        continue;
      }
      if (kind === 'quote-parapet' && unit === 'sft' && /wall/.test(name)) {
        push(line.section, 'parapet', qty, unit);
        continue;
      }
      if (
        unit === 'sft' &&
        (/plaster/.test(name) || material === 'plaster_labour')
      ) {
        push(line.section, 'plastering', qty, unit);
        continue;
      }
      if (
        unit === 'sft' &&
        ((kind === 'quote-masonry' && /wall|brickwork/.test(name)) ||
          material === 'labour_brickwork_9' ||
          material === 'labour_brickwork_4')
      ) {
        push(line.section, 'brickwork', qty, unit);
        continue;
      }
      if (
        (material === 'excavation' || /excavation \(measured\)/.test(name)) &&
        unit === 'm³'
      )
        push(line.section, 'excavation', qty, unit);
      if (
        (kind === 'quote-pcc' || category === 'pcc') &&
        /volume/.test(name) &&
        unit === 'm³'
      )
        push(line.section, 'pcc', qty, unit);
      if (category === 'sajjas' && /shuttering/.test(name) && unit === 'sft')
        push(line.section, 'sajjas', qty, unit);
      if (category === 'shelves' && /shuttering/.test(name) && unit === 'sft')
        push(line.section, 'shelves', qty, unit);
      if (
        /elevation/.test(line.name.toLowerCase() + ' ' + name) &&
        unit === 'sft'
      )
        push(line.section, 'elevation', qty, unit);
      if (material === 'labour_tiling') push(line.section, 'tiling', qty, unit);
      if (material === 'labour_painting')
        push(line.section, 'painting', qty, unit);
      if (material === 'labour_electrical')
        push(line.section, 'electrical', qty, unit);
      if (material === 'labour_plumbing')
        push(line.section, 'plumbing', qty, unit);
    }
  }
  return [...rows.values()];
}

/** Choose a BOQ quantity only for the exact work, floor and requested unit. */
export function measuredLabourQuantity(
  measurements: readonly LabourMeasure[],
  work: LabourWorkId,
  stage: string,
  unit: string,
): number {
  return cap(
    measurements
      .filter(
        (row) =>
          row.stage === stage &&
          row.work === work &&
          normalizeUnit(row.unit) === normalizeUnit(unit),
      )
      .reduce((sum, row) => sum + row.quantity, 0),
  );
}
export function extraCoveredWorks(extra: LabourExtra): LabourWorkId[] {
  return [...new Set([extra.work, ...(extra.includedWorks ?? [])])];
}
export function isExtraAllowed(
  config: LabourConfig,
  extra: LabourExtra,
): boolean {
  const covered = extraCoveredWorks(extra);
  if (config.method === 'composite')
    return (
      extra.outsideScope ||
      !covered.some((work) => config.coveredWorks.includes(work))
    );
  // Item-wise default already prices measured work: a second rate on it is
  // only valid for an explicitly additional quantity outside the base scope.
  if (config.method === 'itemwise' && !extra.outsideScope)
    return extra.quantitySource !== 'boq' && extra.work === 'other';
  return true;
}
export function labourExtraQuantity(
  extra: LabourExtra,
  measured: readonly LabourMeasure[],
) {
  return extra.method === 'itemwise' &&
    extra.quantitySource === 'boq' &&
    !extra.outsideScope
    ? measuredLabourQuantity(measured, extra.work, extra.stage, extra.unit)
    : finite(extra.quantity);
}

export function evaluateLabour(
  config: LabourConfig | null,
  floors: readonly { name: string; areaSqft: number }[],
  measurements: readonly LabourMeasure[],
) {
  const byStage: Record<string, number> = {};
  if (!config)
    return {
      base: 0,
      extras: 0,
      total: 0,
      byStage,
      invalidExtras: [] as string[],
    };
  const builtUpArea = floors.reduce(
    (sum, floor) => sum + finite(floor.areaSqft),
    0,
  );
  const area =
    config.areaOverrideSqft === null
      ? builtUpArea
      : finite(config.areaOverrideSqft);
  let base = 0;
  if (config.method === 'composite') {
    base = area * finite(config.rate);
    // Allocation for display only: this is NOT another charge per stage.
    const weight = builtUpArea > 0 ? area / builtUpArea : 0;
    for (const floor of floors)
      byStage[floor.name] =
        (byStage[floor.name] ?? 0) +
        finite(floor.areaSqft) * weight * finite(config.rate);
    if (builtUpArea === 0 && base > 0) byStage.General = base;
  } else if (config.method === 'itemwise') {
    for (const measured of measurements) {
      const amount =
        finite(measured.quantity) *
        finite(config.itemRates[measured.work] ?? 0);
      base += amount;
      byStage[measured.stage] = (byStage[measured.stage] ?? 0) + amount;
    }
  } else {
    base = config.dailyRates.reduce(
      (sum, row) =>
        sum + finite(row.workers) * finite(row.days) * finite(row.rate),
      0,
    );
    byStage.General = base;
  }
  const invalidExtras: string[] = [];
  let extras = 0;
  for (const item of config.extras) {
    if (!isExtraAllowed(config, item)) {
      invalidExtras.push(item.id);
      continue;
    }
    const amount =
      item.method === 'daily'
        ? finite(item.workers) * finite(item.days) * finite(item.rate)
        : labourExtraQuantity(item, measurements) * finite(item.rate);
    extras += amount;
    byStage[item.stage || 'General'] =
      (byStage[item.stage || 'General'] ?? 0) + amount;
  }
  return {
    base: cap(base),
    extras: cap(extras),
    total: cap(base + extras),
    byStage: Object.fromEntries(
      Object.entries(byStage).map(([key, value]) => [key, cap(value)]),
    ),
    invalidExtras,
  };
}
