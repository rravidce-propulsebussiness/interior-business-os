/**
 * BOQ rate resolution. Pure and client-safe.
 *
 * A company rate card has plain rate lines (label + unit) and material groups
 * with several brand / source variants, e.g. Bricks: Local, Karimnagar;
 * Steel: JSW, Vizag; Cement: UltraTech, Maha. Each BOQ chooses one variant per
 * material group; the group's default variant is used otherwise.
 */
export type RateCategory = 'material' | 'labour' | 'other';
export type Rate = {
  key: string;
  label: string;
  unit: string;
  rate: number;
  category: RateCategory;
  material?: string | undefined;
  variant?: string | undefined;
  isDefault?: boolean | undefined;
};
export type PricedOutput = {
  name: string;
  unit: string;
  material?: string | undefined;
  rate?: number | undefined;
  diameter?: number | undefined;
};

type GroupDef = {
  key: string;
  label: string;
  unit: string;
  category: RateCategory;
  section: string;
  starters: readonly string[];
  /** Default rate for new rate cards (labour and fees); materials start at 0. */
  defaultRate?: number;
  note?: string;
};
const STEEL_DIAMETERS = [8, 10, 12, 16, 20, 25] as const;
const steelBrands = ['JSW', 'Vizag (RINL)', 'Local ISI'] as const;
const group = (
  key: string,
  label: string,
  unit: string,
  section: string,
  starters: readonly string[] = ['Standard'],
  extra: Partial<GroupDef> = {},
): GroupDef => ({
  key,
  label,
  unit,
  category: section === 'Labour' ? 'labour' : 'material',
  section,
  starters,
  ...extra,
});

/**
 * Rate-card groups, in purchase units: steel per rod (by diameter), cement
 * per bag, bricks per number, sand and aggregate per tonne. Labour and fees
 * start with typical Hyderabad rates (Nov 2026); everything is editable.
 */
export const MATERIAL_GROUPS: readonly GroupDef[] = [
  ...STEEL_DIAMETERS.map((diameter) =>
    group(
      `steel_${diameter}`,
      `${diameter} mm TMT`,
      'rod',
      'Steel (per rod)',
      steelBrands,
    ),
  ),
  group('cement', 'Cement', 'bag', 'Structure materials', [
    'UltraTech',
    'Maha',
    'Ramco',
  ]),
  group('bricks', 'Bricks', 'nos', 'Structure materials', [
    'Local',
    'Karimnagar',
  ]),
  group('sand', 'Sand', 't', 'Structure materials', ['River sand', 'M-sand']),
  group('aggregate', 'Aggregate (20 / 40 mm)', 't', 'Structure materials'),
  group('binding_wire', 'Binding wire', 'kg', 'Structure materials'),
  group(
    'waterproofing',
    'Terrace waterproofing',
    'sqft',
    'Structure materials',
    ['Standard'],
    {
      defaultRate: 45,
      note: 'Typical supply + apply; check your applicator.',
    },
  ),
  group('door_main', 'Main door', 'door', 'Doors & windows', [
    'Teak',
    'Sal wood',
  ]),
  group('door_internal', 'Bedroom / internal door', 'door', 'Doors & windows', [
    'Flush door',
    'WPC',
  ]),
  group('door_bathroom', 'Bathroom door', 'door', 'Doors & windows', [
    'WPC',
    'PVC',
  ]),
  group('door_pooja', 'Pooja door', 'door', 'Doors & windows', [
    'Teak',
    'Carved',
  ]),
  group('window', 'Windows', 'sqft', 'Doors & windows', ['UPVC', 'Aluminium']),
  group('ventilator', 'Ventilators', 'each', 'Doors & windows'),
  group('gate', 'Entrance gate', 'each', 'Doors & windows', ['MS fabricated']),
  group('floor_tiles', 'Floor tiles', 'sqft', 'Finishes', [
    'Vitrified 2×2',
    'Granite',
  ]),
  group('wall_tiles', 'Bathroom wall tiles', 'sqft', 'Finishes', ['Ceramic']),
  group('paint_interior', 'Interior paint material', 'sqft', 'Finishes', [
    'Asian Paints',
    'Berger',
  ]),
  group('paint_exterior', 'Exterior paint material', 'sqft', 'Finishes', [
    'Asian Paints',
    'Berger',
  ]),
  group(
    'electrical_point',
    'Electrical material per point',
    'point',
    'Services',
    ['Finolex + Anchor', 'Polycab + Legrand'],
  ),
  group('sanitary_cp', 'Sanitary ware & CP fittings', 'bathroom', 'Services', [
    'Hindware',
    'Jaquar',
  ]),
  group(
    'plumbing_bathroom',
    'Plumbing pipes & fittings',
    'bathroom',
    'Services',
    ['Ashirvad', 'Supreme'],
  ),
  group(
    'labour_civil',
    'Civil labour (concrete, brickwork, plaster)',
    'sqft',
    'Labour',
    ['Contract'],
    {
      defaultRate: 350,
      note: 'Per sq ft of built-up area.',
    },
  ),
  group(
    'shuttering',
    'Centering & shuttering',
    'sqft',
    'Labour',
    ['Contract'],
    {
      defaultRate: 35,
      note: 'Per sq ft of shuttered area (Hyderabad ₹30–35).',
    },
  ),
  group('labour_tiling', 'Tile laying labour', 'sqft', 'Labour', ['Contract'], {
    defaultRate: 70,
  }),
  group('labour_painting', 'Painting labour', 'sqft', 'Labour', ['Contract'], {
    defaultRate: 15,
    note: 'Hyderabad ₹8–20 per sq ft.',
  }),
  group(
    'labour_electrical',
    'Electrical labour',
    'point',
    'Labour',
    ['Contract'],
    {
      defaultRate: 300,
      note: 'Labour only, ₹150–350 per point.',
    },
  ),
  group(
    'labour_plumbing',
    'Plumbing labour',
    'bathroom',
    'Labour',
    ['Contract'],
    {
      defaultRate: 15000,
      note: 'Estimate; confirm with your plumber.',
    },
  ),
  group(
    'labour_door_fixing',
    'Door fixing labour',
    'door',
    'Labour',
    ['Carpenter'],
    { defaultRate: 1500 },
  ),
  group(
    'plaster_labour',
    'Plastering labour',
    'sqft',
    'Labour',
    ['Included in civil'],
    {
      note: 'Leave 0 when civil labour includes plastering.',
    },
  ),
  group('excavation', 'Excavation', 'm³', 'Labour', ['JCB', 'Manual']),
  group(
    'design_fees',
    'Architectural & structural design',
    'sqft',
    'Design & handover',
    ['Standard'],
    {
      defaultRate: 20,
    },
  ),
  group('soil_test', 'Soil test', 'LS', 'Design & handover', ['Standard'], {
    defaultRate: 15000,
  }),
  group(
    'building_permission',
    'Building permission & approvals',
    'LS',
    'Design & handover',
  ),
  group(
    'handover_cleaning',
    'Final cleaning',
    'sqft',
    'Design & handover',
    ['Standard'],
    {
      defaultRate: 5,
    },
  ),
  group(
    'handover_snags',
    'Testing & snag rectification',
    'LS',
    'Design & handover',
  ),
];

export const GROUP_SECTIONS = [
  'Steel (per rod)',
  'Structure materials',
  'Doors & windows',
  'Finishes',
  'Services',
  'Labour',
  'Design & handover',
] as const;

/** Rate-card group for an output (steel is priced per rod by diameter). */
export function rateGroupKey(material: string, diameter?: number) {
  return material === 'steel' && diameter ? `steel_${diameter}` : material;
}

export const variantKey = (material: string, variant: string) =>
  `${material}::${variant.trim().toLowerCase()}`;
const plainKey = (name: string, unit: string) =>
  `${name.trim().toLowerCase()}::${unit.trim().toLowerCase()}`;

/** Material group for outputs of the manual takeoff templates. */
export function materialForOutput(output: PricedOutput): string | undefined {
  if (output.material) return output.material;
  const name = output.name.toLowerCase();
  const unit = output.unit.toLowerCase();
  if (unit === 'bag' && name.startsWith('cement')) return 'cement';
  if (unit === 't' && name.includes('sand')) return 'sand';
  if (unit === 't' && name.includes('aggregate')) return 'aggregate';
  if ((unit === 'nos' || unit === 'each') && name === 'bricks') return 'bricks';
  if (unit === 'rod' && diameterOf(output)) return 'steel';
  return undefined;
}

/** Bar diameter of a reinforcement output ("16 mm main bars" → 16). */
export function diameterOf(output: PricedOutput): number | undefined {
  if (output.diameter) return output.diameter;
  const match = /^(\d+) mm\b/.exec(output.name.trim());
  return match ? Number(match[1]) : undefined;
}

/** Variants of one material group, default first. */
export function variantsFor(rates: readonly Rate[], material: string) {
  return rates
    .filter((rate) => rate.material === material && rate.variant)
    .sort(
      (a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)),
    );
}

export function selectedVariant(
  rates: readonly Rate[],
  material: string,
  selections: Readonly<Record<string, string>>,
): Rate | undefined {
  const variants = variantsFor(rates, material);
  const chosen = selections[material];
  return (
    (chosen && variants.find((rate) => rate.variant === chosen)) || variants[0]
  );
}

/**
 * Unit rate for a BOQ output: a fixed rate on the output (quoted allowance)
 * wins; then the BOQ's brand / source for its material group; then a plain
 * rate line with the same name and unit.
 */
export function rateForOutput(
  output: PricedOutput,
  rates: readonly Rate[],
  selections: Readonly<Record<string, string>> = {},
): number {
  if (output.rate !== undefined && Number.isFinite(output.rate))
    return output.rate;
  const material = materialForOutput(output);
  if (material) {
    // Steel: one brand choice per BOQ, priced per rod for each diameter.
    const group = rateGroupKey(material, diameterOf(output));
    const variant = selectedVariant(rates, group, {
      ...selections,
      [group]: selections[material] ?? selections[group] ?? '',
    });
    if (variant) return variant.rate;
  }
  const key = plainKey(output.name, output.unit);
  const exact = rates.find((rate) => !rate.material && rate.key === key);
  if (exact) return exact.rate;
  const name = output.name.trim().toLowerCase();
  return (
    rates.find(
      (rate) =>
        !rate.material &&
        rate.label.trim() &&
        name.startsWith(rate.label.trim().toLowerCase()) &&
        rate.unit.toLowerCase() === output.unit.toLowerCase(),
    )?.rate ?? 0
  );
}
