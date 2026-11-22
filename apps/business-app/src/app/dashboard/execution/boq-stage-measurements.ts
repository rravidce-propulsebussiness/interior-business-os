import {
  M20_SITE_MIX_PER_M3,
  type StructuralSettings,
} from '@business-os/core/construction-boq';

/** Dimension takeoffs use ft internally; m³ is the procurement/rate-card unit. */
export type MeasuredKind = 'excavation' | 'soil' | 'pcc' | 'sajjas' | 'shelves';
export type MeasuredDimensions = {
  count: number;
  lengthFeet: number;
  widthFeet: number;
  depthFeet: number;
};
export type MeasuredOutput = {
  name: string;
  quantity: number;
  unit: string;
  material?: string;
  rate?: number;
  source?: string;
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
  >,
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
        volume.m3 * M20_SITE_MIX_PER_M3.sandCubicMetres *
          settings.sandTonPerCum,
        2,
      ),
      unit: 't',
    },
    {
      name: kind === 'sajjas' ? 'Aggregate (sajjas)' : 'Aggregate (shelves)',
      material: 'aggregate',
      quantity: round(
        volume.m3 * M20_SITE_MIX_PER_M3.aggregateCubicMetres *
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
  ];
}
