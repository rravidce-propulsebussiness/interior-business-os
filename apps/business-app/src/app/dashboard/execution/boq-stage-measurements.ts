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
/** Safely recover saved per-item rod schedules; invalid rows never become steel. */
export function readMeasuredSteelSets(raw: unknown): MeasuredSteelSet[] {
  let decoded: unknown = raw;
  if (typeof raw === 'string') {
    try {
      decoded = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(decoded)) return [];
  return decoded
    .slice(0, 16)
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const value = item as Record<string, unknown>;
      const number = (field: string) => {
        const parsed = Number(value[field]);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
      };
      return {
        dia: number('dia'),
        count: Math.round(number('count')),
        cutLengthFeet: number('cutLengthFeet'),
      };
    });
}
export type MeasuredDimensions = {
  count: number;
  lengthFeet: number;
  widthFeet: number;
  depthFeet: number;
  /** Optional per-item reinforcement rows. No rows means zero assumed steel. */
  steelSets?: MeasuredSteelSet[];
  /** Built-in cabinet: front width = lengthFeet, height = widthFeet. */
  shelfStandard?: boolean;
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

/** Budgetary assumptions for in-wall RCC/cement shelving, as photographed.
 * Only the cabinet frontage is entered. Depth/spacing/thickness are standard
 * takeoff assumptions, not structural specifications or a bar-bending schedule.
 */
export const STANDARD_SHELF_ASSUMPTIONS = {
  depthFeet: 1.5,
  panelThicknessIn: 2,
  verticalBayWidthFeet: 3,
  horizontalSpacingFeet: 2,
  estimatedSteelKgPerM3: 45,
  rodDiaMm: 8,
  materialWastagePercent: 5,
} as const;

export function standardShelfTakeoff(
  widthFeet: number,
  heightFeet: number,
  count: number,
) {
  if (
    ![widthFeet, heightFeet, count].every(Number.isFinite) ||
    widthFeet <= 0 ||
    heightFeet <= 0 ||
    count <= 0 ||
    widthFeet > 50 ||
    heightFeet > 30 ||
    count > 100
  )
    return null;
  const copies = Math.round(count);
  if (!copies) return null;
  const rules = STANDARD_SHELF_ASSUMPTIONS;
  // The outside cheeks and central partitions are included; horizontal
  // panels include a base/top and intermediate shelves at standard spacing.
  const horizontalPanels = Math.max(
    2,
    Math.ceil(heightFeet / rules.horizontalSpacingFeet) + 1,
  );
  const verticalPanels = Math.max(
    2,
    Math.ceil(widthFeet / rules.verticalBayWidthFeet) + 1,
  );
  const thicknessFeet = rules.panelThicknessIn / 12;
  const grossCft =
    (horizontalPanels * widthFeet + verticalPanels * heightFeet) *
    rules.depthFeet *
    thicknessFeet;
  const intersectionsCft =
    horizontalPanels *
    verticalPanels *
    rules.depthFeet *
    thicknessFeet *
    thicknessFeet;
  const concreteCft = Math.max(0, grossCft - intersectionsCft) * copies;
  const withWastageM3 =
    concreteCft *
    CUBIC_METRES_PER_CFT *
    (1 + rules.materialWastagePercent / 100);
  const shutteringSqft =
    (horizontalPanels * widthFeet * rules.depthFeet +
      2 * verticalPanels * heightFeet * rules.depthFeet) *
    copies;
  return {
    horizontalPanels,
    verticalPanels,
    volumeCft: round(concreteCft),
    volumeM3: round(concreteCft * CUBIC_METRES_PER_CFT),
    concreteWithWastageM3: withWastageM3,
    shutteringSqft: round(shutteringSqft, 2),
    copies,
  };
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
    shelfStandard: line.inputs.shelfStandard === true,
  };
  dims.steelSets = readMeasuredSteelSets(line.inputs.steelSetsJson);
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
  if (kind === 'shelves' && values.shelfStandard) {
    const takeoff = standardShelfTakeoff(
      values.lengthFeet,
      values.widthFeet,
      values.count,
    );
    if (!takeoff) return [];
    const standard = STANDARD_SHELF_ASSUMPTIONS;
    const source =
      `${takeoff.copies} × ${values.lengthFeet} ft wide × ${values.widthFeet} ft high; ` +
      `${takeoff.horizontalPanels} horizontal + ${takeoff.verticalPanels} vertical panels; ` +
      `${standard.depthFeet} ft depth, ${standard.panelThicknessIn} in panels; ` +
      `${standard.materialWastagePercent}% material wastage; verify on site`;
    const purchasedM3 = takeoff.concreteWithWastageM3;
    const stock = settings.stockBarFeet ?? 40;
    const rodWeightKg = stock * 0.3048 * (standard.rodDiaMm ** 2 / 162);
    const estimatedKg = purchasedM3 * standard.estimatedSteelKgPerM3;
    const rods = Math.ceil(estimatedKg / rodWeightKg);
    return [
      {
        name: 'Shelf concrete volume (reference only)',
        quantity: takeoff.volumeM3,
        unit: 'm³',
        rate: 0,
        source,
      },
      {
        name: 'Cement (shelves)',
        material: 'cement',
        quantity: round(purchasedM3 * M20_SITE_MIX_PER_M3.cementBags, 1),
        unit: 'bag',
        source,
      },
      {
        name: 'Sand (shelves)',
        material: 'sand',
        quantity: round(
          purchasedM3 *
            M20_SITE_MIX_PER_M3.sandCubicMetres *
            settings.sandTonPerCum,
          2,
        ),
        unit: 't',
      },
      {
        name: 'Aggregate (shelves)',
        material: 'aggregate',
        quantity: round(
          purchasedM3 *
            M20_SITE_MIX_PER_M3.aggregateCubicMetres *
            settings.aggregateTonPerCum,
          2,
        ),
        unit: 't',
      },
      {
        name: 'Shelf shuttering (estimated)',
        material: 'shuttering',
        quantity: takeoff.shutteringSqft,
        unit: 'sqft',
        source:
          'Horizontal soffits and both vertical partition faces; provisional',
      },
      {
        name: `${standard.rodDiaMm} mm TMT (shelves, provisional)`,
        material: 'steel',
        quantity: rods,
        unit: 'rod',
        diameter: standard.rodDiaMm,
        rods,
        weightKg: round(rods * rodWeightKg, 2),
        source: `Provisional ${standard.estimatedSteelKgPerM3} kg/m³, ${stock} ft stock; replace with approved BBS`,
      },
    ];
  }
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
    ...(values.steelSets ?? []).flatMap((steel): MeasuredOutput[] => {
      const stock = settings.stockBarFeet ?? 40;
      if (!(
        steel.count > 0 &&
        steel.dia >= 6 &&
        steel.dia <= 40 &&
        steel.cutLengthFeet > 0 &&
        steel.cutLengthFeet <= stock
      ))
        return [];
      const pieceCount = Math.round(values.count) * Math.round(steel.count);
      const plan = cutPlan(steel.cutLengthFeet, pieceCount, stock, 0);
      const kg = plan.bars * stock * 0.3048 * (steel.dia ** 2 / 162);
      return [
        {
          name: `${steel.dia} mm TMT (${kind === 'sajjas' ? 'sajjas' : 'shelves'})`,
          material: 'steel',
          quantity: plan.bars,
          unit: 'rod',
          diameter: steel.dia,
          rods: plan.bars,
          weightKg: round(kg, 2),
          source: `${pieceCount} pieces × ${steel.cutLengthFeet} ft; ${stock} ft stock bars`,
        },
      ];
    }),
  ];
}

/** Bought moorum/gravel filling is a supplied material; backfill with the
 * excavated soil is placement labour only. Decided from the work's name. */
export function fillingOutput<T extends { material?: string | undefined }>(
  lineName: string,
  output: T,
): T {
  if (
    output.material !== 'soil_filling' &&
    output.material !== 'moorum_filling'
  )
    return output;
  const supplied = /moorum|murrum|morrum|gravel|red soil|supplied/i.test(
    lineName,
  );
  return { ...output, material: supplied ? 'moorum_filling' : 'soil_filling' };
}

/** Presentation only: keep procurement quantities/rates in their saved units.
 * Site-mix rates are effective costs, not an additional concrete charge. */
export function displayMeasuredVolume(
  volume: { cft: number; m3: number },
  amount: number,
  unit: 'ft' | 'm',
  baseRatePerM3?: number,
) {
  const quantity = unit === 'ft' ? volume.cft : volume.m3;
  const ratePerM3 = baseRatePerM3 ?? (volume.m3 > 0 ? amount / volume.m3 : 0);
  return {
    quantity,
    quantityUnit: unit === 'ft' ? 'CFT' : 'm³',
    rate: unit === 'ft' ? ratePerM3 * CUBIC_METRES_PER_CFT : ratePerM3,
    amount,
  };
}
