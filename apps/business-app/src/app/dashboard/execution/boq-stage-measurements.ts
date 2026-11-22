import {
  M20_SITE_MIX_PER_M3,
  cutPlan,
  type StructuralSettings,
} from '@business-os/core/construction-boq';

/** Dimension takeoffs use ft internally; m³ is the procurement/rate-card unit. */
export type MeasuredKind = 'excavation' | 'soil' | 'pcc' | 'sajjas' | 'shelves';
/** Explicit bar-bending takeoff for small RCC only, never a thumb-rule. */
export type MeasuredSteelSet = {
  dia: number;
  count: number;
  /** Actual single bar cut length; beyond the stock length requires BBS review. */
  cutLengthFeet: number;
};
export type MeasuredDimensions = {
  count: number;
  lengthFeet: number;
  widthFeet: number;
  depthFeet: number;
  /** Optional per-item reinforcement rows. No rows means zero assumed steel. */
  steelSets?: MeasuredSteelSet[];
};
export type MeasuredOutput = {
  name: string;
  quantity: number;
  unit: string;
  material?: string;
  rate?: number;
  source?: string;
  diameter?: number;
  rods?: number;
  weightKg?: number;
};
const round = (n: number, digits = 3) => Number(n.toFixed(digits));
export const CUBIC_METRES_PER_CFT = 0.028316846592;
export const FEET_PER_METRE = 1 / 0.3048;

export function measuredVolume(values: MeasuredDimensions) {
  const { count, lengthFeet, widthFeet, depthFeet } = values;
  const valid = [count, lengthFeet, widthFeet, depthFeet].every(
    (n) => Number.isFinite(n) && n > 0 && n < 100000,
  );
  const cft = valid
    ? Math.round(count) * lengthFeet * widthFeet * depthFeet
    : 0;
  return { cft: round(cft, 3), m3: round(cft * CUBIC_METRES_PER_CFT) };
}

/**
 * Procurement lines intentionally exclude a second price for an informational
 * volume where site-mixed cement/sand/aggregate are already priced.
 */
/**
 * Older BOQs stored sajja/shelf concrete as ready-mix. Recalculate only those
 * legacy outputs from their saved geometry; do not alter measured dimensions,
 * intentionally entered shuttering rates, PCC or structural RCC lines.
 */
export function correctSavedSmallConcrete(
  line: {
    kind: string;
    inputs: Record<string, string | number | boolean>;
    outputs: MeasuredOutput[];
  },
  settings: Parameters<typeof measuredOutputs>[2],
): MeasuredOutput[] | null {
  if (line.kind !== 'measured-geometry') return null;
  const category = line.inputs.stageCategory;
  if (category !== 'sajjas' && category !== 'shelves') return null;
  if (!line.outputs.some((row) => row.material === 'concrete_m20')) return null;
  const dims: MeasuredDimensions = {
    count: Number(line.inputs.count),
    lengthFeet: Number(line.inputs.lengthFeet),
    widthFeet: Number(line.inputs.widthFeet),
    depthFeet: Number(line.inputs.depthFeet),
  };
  const savedSteel = line.inputs.steelSetsJson;
  if (typeof savedSteel === 'string') {
    try {
      const values = JSON.parse(savedSteel) as unknown;
      if (Array.isArray(values)) {
        dims.steelSets = values.filter((row) => row && typeof row === 'object')
          .slice(0, 16) as MeasuredSteelSet[];
      }
    } catch { /* Older/corrupt steel notes are never assumed. */ }
  }
  const next = measuredOutputs(category, dims, settings);
  if (!next.length) return null;
  const savedShuttering = line.outputs.find(
    (row) => row.material === 'shuttering',
  );
  return next.map((output) =>
    output.material === 'shuttering' && savedShuttering?.rate !== undefined
      ? { ...output, rate: savedShuttering.rate }
      : output,
  );
}

export function measuredOutputs(
  kind: MeasuredKind,
  values: MeasuredDimensions,
  settings: Pick<
    StructuralSettings,
    | 'pccCementBagsPerM3'
    | 'pccSandM3PerM3'
    | 'pccAggregateM3PerM3'
    | 'sandTonPerCum'
    | 'aggregateTonPerCum'
  > & { stockBarFeet?: number },
): MeasuredOutput[] {
  const volume = measuredVolume(values);
  if (!(volume.m3 > 0)) return [];
  const source = `${values.count} × ${values.lengthFeet} × ${values.widthFeet} × ${values.depthFeet} ft = ${volume.cft} cft`;
  if (kind === 'excavation')
    return [
      {
        name: 'Excavation (measured)',
        material: 'excavation',
        quantity: volume.m3,
        unit: 'm³',
        source,
      },
    ];
  if (kind === 'soil')
    return [
      {
        name: 'Soil filling (measured)',
        material: 'soil_filling',
        quantity: volume.m3,
        unit: 'm³',
        source,
      },
    ];
  if (kind === 'pcc')
    return [
      {
        name: 'PCC concrete volume (reference only)',
        quantity: volume.m3,
        unit: 'm³',
        rate: 0,
        source,
      },
      {
        name: 'Cement (PCC)',
        material: 'cement',
        quantity: round(volume.m3 * settings.pccCementBagsPerM3, 1),
        unit: 'bag',
      },
      {
        name: 'Sand (PCC)',
        material: 'sand',
        quantity: round(
          volume.m3 * settings.pccSandM3PerM3 * settings.sandTonPerCum,
          2,
        ),
        unit: 't',
      },
      {
        name: 'Aggregate (PCC)',
        material: 'aggregate',
        quantity: round(
          volume.m3 *
            settings.pccAggregateM3PerM3 *
            settings.aggregateTonPerCum,
          2,
        ),
        unit: 't',
      },
    ];
  const shutteringSqft =
    Math.round(
      (values.lengthFeet * values.widthFeet +
        2 * (values.lengthFeet + values.widthFeet) * values.depthFeet) *
        values.count *
        100,
    ) / 100;
  return [
    {
      name:
        kind === 'sajjas'
          ? 'Sajja concrete volume (reference only)'
          : 'Shelf concrete volume (reference only)',
      quantity: volume.m3,
      unit: 'm³',
      rate: 0,
      source,
    },
    {
      name: kind === 'sajjas' ? 'Cement (sajjas)' : 'Cement (shelves)',
      material: 'cement',
      quantity: round(volume.m3 * M20_SITE_MIX_PER_M3.cementBags, 1),
      unit: 'bag',
    },
    {
      name: kind === 'sajjas' ? 'Sand (sajjas)' : 'Sand (shelves)',
      material: 'sand',
      quantity: round(
        volume.m3 *
          M20_SITE_MIX_PER_M3.sandCubicMetres *
          settings.sandTonPerCum,
        2,
      ),
      unit: 't',
    },
    {
      name: kind === 'sajjas' ? 'Aggregate (sajjas)' : 'Aggregate (shelves)',
      material: 'aggregate',
      quantity: round(
        volume.m3 *
          M20_SITE_MIX_PER_M3.aggregateCubicMetres *
          settings.aggregateTonPerCum,
        2,
      ),
      unit: 't',
    },
    {
      name:
        kind === 'sajjas'
          ? 'Sajja shuttering (estimated)'
          : 'Shelf shuttering (estimated)',
      material: 'shuttering',
      quantity: shutteringSqft,
      unit: 'sqft',
      source: 'One underside + four sides; confirm with formwork drawings',
    },
    ...((values.steelSets ?? []).flatMap((steel): MeasuredOutput[] => {
      const stock = settings.stockBarFeet ?? 40;
      if (!(steel.count > 0 && steel.dia >= 6 && steel.dia <= 40 &&
        steel.cutLengthFeet > 0 && steel.cutLengthFeet <= stock)) return [];
      const pieceCount = Math.round(values.count) * Math.round(steel.count);
      const plan = cutPlan(steel.cutLengthFeet, pieceCount, stock, 0);
      const kg = plan.bars * stock * 0.3048 * (steel.dia ** 2 / 162);
      return [{
        name: `${steel.dia} mm TMT (${kind === 'sajjas' ? 'sajjas' : 'shelves'})`,
        material: 'steel',
        quantity: plan.bars,
        unit: 'rod',
        diameter: steel.dia,
        rods: plan.bars,
        weightKg: round(kg, 2),
        source: `${pieceCount} pieces × ${steel.cutLengthFeet} ft; ${stock} ft stock bars`,
      }];
    })),
  ];
}
