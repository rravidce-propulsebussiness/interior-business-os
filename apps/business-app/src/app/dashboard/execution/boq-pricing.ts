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
  /** Package rate from the quotation (e.g. windows ₹450 / sq ft). */
  quotedRate?: number | undefined;
  diameter?: number | undefined;
};

type GroupDef = {
  key: string;
  label: string;
  unit: string;
  category: RateCategory;
  section: string;
  starters: readonly string[];
  /** Default rate for new rate cards, per starter (or one for all). */
  defaultRate?: number;
  starterRates?: Readonly<Record<string, number>>;
  note?: string;
};
const STEEL_DIAMETERS = [8, 10, 12, 16, 20, 25] as const;
/** Brand price per kg (Hyderabad dealer listings, Nov 2026). */
const STEEL_PER_KG: Readonly<Record<string, number>> = {
  'Vizag (RINL)': 68,
  JSW: 72,
  'Local ISI': 60,
};
/** Weight of one 12 m (40 ft) bar: d² / 162 kg per metre. */
const kgPerRod = (diameter: number) => ((diameter * diameter) / 162) * 12;
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
 * Rate-card groups in purchase units: steel per rod (by diameter), cement per
 * bag, bricks per number, sand and aggregate per tonne.
 *
 * Defaults (editable): brand prices from Hyderabad dealer listings
 * (Nov 2026); allowances from the company's standard quotation (doors
 * ₹7,000, windows ₹450/sq ft, fittings ₹25,000 per bathroom, tiles, granite,
 * sink, shutter, gate); labour from Hyderabad rate guides. Items marked
 * "estimate" have no reliable public price; confirm with suppliers.
 */
export const MATERIAL_GROUPS: readonly GroupDef[] = [
  ...STEEL_DIAMETERS.map((diameter) =>
    group(
      `steel_${diameter}`,
      `${diameter} mm TMT`,
      'rod',
      'Steel (per rod)',
      Object.keys(STEEL_PER_KG),
      {
        starterRates: Object.fromEntries(
          Object.entries(STEEL_PER_KG).map(([brand, perKg]) => [
            brand,
            Math.round(kgPerRod(diameter) * perKg),
          ]),
        ),
        note: `12 m rod ≈ ${kgPerRod(diameter).toFixed(1)} kg; Vizag ₹68/kg, JSW ₹72/kg.`,
      },
    ),
  ),
  group(
    'cement',
    'Cement (RCC: slabs, columns)',
    'bag',
    'Structure materials',
    ['UltraTech 53', 'Maha 53', 'Birla 53'],
    {
      starterRates: { 'UltraTech 53': 390, 'Maha 53': 350, 'Birla 53': 360 },
      note: 'Hyderabad ₹340–420 per 50 kg bag.',
    },
  ),
  group(
    'cement_masonry',
    'Cement (brickwork & plaster)',
    'bag',
    'Structure materials',
    ['Birla 43', 'UltraTech 43', 'Maha 43'],
    {
      starterRates: { 'Birla 43': 330, 'UltraTech 43': 360, 'Maha 43': 320 },
      note: 'Hyderabad Birla 43 ₹295–350 per bag.',
    },
  ),
  group(
    'bricks',
    'Bricks',
    'nos',
    'Structure materials',
    ['Karimnagar', 'Local'],
    {
      starterRates: { Karimnagar: 9.5, Local: 8.5 },
      note: 'Karimnagar red brick ₹9.10–11 each.',
    },
  ),
  group(
    'sand',
    'Sand',
    't',
    'Structure materials',
    ['River sand', 'Robo / M-sand'],
    {
      starterRates: { 'River sand': 1750, 'Robo / M-sand': 1300 },
      note: 'River sand ~₹1,750/t (Nov 2026).',
    },
  ),
  group(
    'aggregate',
    'Aggregate (20 / 40 mm)',
    't',
    'Structure materials',
    ['Govt approved quarry'],
    {
      defaultRate: 750,
      note: 'Hyderabad 20 mm ₹700–750/t.',
    },
  ),
  group(
    'concrete_m20',
    'M20 concrete (ready-mix)',
    'm³',
    'Structure materials',
    ['Ready-mix M20'],
    {
      defaultRate: 5000,
      note: 'Per m³ delivered, for footings, columns, beams, slabs and stairs.',
    },
  ),
  group(
    'binding_wire',
    'Binding wire',
    'kg',
    'Structure materials',
    ['Standard'],
    {
      defaultRate: 80,
      note: 'Estimate.',
    },
  ),
  group(
    'waterproofing',
    'Terrace waterproofing',
    'sqft',
    'Structure materials',
    ['Standard'],
    {
      defaultRate: 45,
      note: 'Estimate, supply + apply.',
    },
  ),
  group('door_main', 'Main door', 'door', 'Doors & windows', ['Teak'], {
    defaultRate: 25000,
    note: 'Estimate.',
  }),
  group(
    'door_internal',
    'Bedroom / internal door',
    'door',
    'Doors & windows',
    ['Flush door, teak frame'],
    {
      defaultRate: 7000,
    },
  ),
  group(
    'door_bathroom',
    'Bathroom door',
    'door',
    'Doors & windows',
    ['WPC frame, waterproof flush'],
    {
      defaultRate: 7000,
    },
  ),
  group('door_pooja', 'Pooja door', 'door', 'Doors & windows', ['Teak'], {
    defaultRate: 12000,
    note: 'Estimate.',
  }),
  group('window', 'Windows', 'sqft', 'Doors & windows', ['UPVC 3-track'], {
    defaultRate: 450,
  }),
  group('ventilator', 'Ventilators', 'each', 'Doors & windows', ['Standard'], {
    defaultRate: 1500,
    note: 'Estimate.',
  }),
  group(
    'rolling_shutter',
    'Rolling shutter',
    'each',
    'Doors & windows',
    ['MS with gear'],
    {
      defaultRate: 35000,
    },
  ),
  group('gate', 'Entrance gate', 'each', 'Doors & windows', ['MS fabricated'], {
    defaultRate: 20000,
  }),
  group('floor_tiles', 'Floor tiles', 'sqft', 'Finishes', ['Vitrified 2×2'], {
    defaultRate: 60,
  }),
  group('wall_tiles', 'Bathroom wall tiles', 'sqft', 'Finishes', ['Ceramic'], {
    defaultRate: 50,
  }),
  group(
    'kitchen_wall_tiles',
    'Kitchen wall tiles',
    'sqft',
    'Finishes',
    ['Ceramic'],
    { defaultRate: 45 },
  ),
  group(
    'staircase_granite',
    'Staircase granite',
    'sqft',
    'Finishes',
    ['Granite'],
    { defaultRate: 70 },
  ),
  group(
    'kitchen_platform',
    'Kitchen platform granite',
    'sqft',
    'Finishes',
    ['Granite'],
    { defaultRate: 150 },
  ),
  group(
    'kitchen_sink',
    'Kitchen sink',
    'each',
    'Finishes',
    ['SS single bowl'],
    { defaultRate: 2000 },
  ),
  group(
    'parking_flooring',
    'Parking flooring',
    'sqft',
    'Finishes',
    ['Parking tiles'],
    {
      defaultRate: 45,
      note: 'Estimate.',
    },
  ),
  group(
    'paint_interior',
    'Interior paint material',
    'sqft',
    'Finishes',
    ['Asian putty + Tractor emulsion'],
    {
      defaultRate: 12,
      note: 'Estimate: 2 putty, 1 primer, 2 emulsion.',
    },
  ),
  group(
    'paint_exterior',
    'Exterior paint material',
    'sqft',
    'Finishes',
    ['Asian primer + Ace emulsion'],
    {
      defaultRate: 15,
      note: 'Estimate.',
    },
  ),
  group(
    'electrical_point',
    'Electrical material per point',
    'point',
    'Services',
    ['Finolex + Maru'],
    {
      defaultRate: 800,
      note: 'Estimate: wire, conduit, switch, box.',
    },
  ),
  group(
    'sanitary_cp',
    'Sanitary ware & CP fittings',
    'bathroom',
    'Services',
    ['Cera'],
    { defaultRate: 25000 },
  ),
  group(
    'plumbing_water',
    'Water supply pipes & fittings',
    'set',
    'Services',
    ['Prince CPVC'],
    {
      defaultRate: 9000,
      note: 'Per bathroom / kitchen: CPVC pipes, elbows, tees, valves, joints. Estimate.',
    },
  ),
  group(
    'plumbing_drainage',
    'Drainage & waste pipes',
    'set',
    'Services',
    ['Prince PVC / SWR'],
    {
      defaultRate: 7000,
      note: 'Per bathroom / kitchen: SWR / PVC pipes, traps, joints. Estimate.',
    },
  ),
  group(
    'plumbing_risers',
    'Risers, down-take & rainwater pipes',
    'floor',
    'Services',
    ['Prince'],
    {
      defaultRate: 12000,
      note: 'Per floor: vertical supply / drainage lines and rainwater pipes. Estimate.',
    },
  ),
  group(
    'bathroom_waterproofing',
    'Bathroom waterproofing',
    'sqft',
    'Services',
    ['Dr. Fixit'],
    {
      defaultRate: 45,
      note: 'Estimate, supply + apply.',
    },
  ),
  group(
    'plumbing_bathroom',
    'Plumbing pipes & fittings (older BOQs)',
    'bathroom',
    'Services',
    ['Prince CPVC / PVC'],
    {
      defaultRate: 18000,
    },
  ),
  group('sump', 'Underground sump', 'litre', 'Services', ['Brick / RCC'], {
    defaultRate: 18,
    note: '₹8–22 per litre built.',
  }),
  group(
    'overhead_tank',
    'Overhead tank',
    'each',
    'Services',
    ['Triple layer 4000 L'],
    {
      defaultRate: 29000,
    },
  ),
  group(
    'labour_rcc',
    'RCC labour (steel fixing, concreting)',
    'sqft',
    'Labour',
    ['Contract'],
    {
      defaultRate: 120,
      note: 'Per sq ft built-up. Estimate within ₹250–350 total civil labour.',
    },
  ),
  group(
    'labour_brickwork_9',
    'Brickwork labour, 9 in',
    'sqft',
    'Labour',
    ['Contract'],
    {
      defaultRate: 30,
      note: 'Hyderabad ₹28–35 per sq ft of wall.',
    },
  ),
  group(
    'labour_brickwork_4',
    'Brickwork labour, 4.5 in',
    'sqft',
    'Labour',
    ['Contract'],
    {
      defaultRate: 19,
      note: 'Hyderabad ₹18–20 per sq ft of wall.',
    },
  ),
  group('plaster_labour', 'Plastering labour', 'sqft', 'Labour', ['Contract'], {
    defaultRate: 22,
    note: 'Hyderabad ₹18–25 per sq ft.',
  }),
  group(
    'shuttering',
    'Centering & shuttering',
    'sqft',
    'Labour',
    ['Contract'],
    {
      defaultRate: 35,
      note: 'Hyderabad ₹30–35 per sq ft.',
    },
  ),
  group(
    'labour_civil',
    'Structural labour (shuttering, concreting, brickwork, plastering)',
    'sqft',
    'Labour',
    ['Contract'],
    {
      defaultRate: 400,
      note: 'One contract rate per sq ft built-up.',
    },
  ),
  group(
    'labour_tiling',
    'Tile & granite laying labour',
    'sqft',
    'Labour',
    ['Contract'],
    { defaultRate: 70 },
  ),
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
      note: 'Labour only ₹150–350 per point.',
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
      note: 'Estimate.',
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
  group('excavation', 'Excavation', 'm³', 'Labour', ['JCB'], {
    defaultRate: 150,
    note: 'Estimate.',
  }),
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

/** Default rate of a starter variant. */
export function starterRate(group: GroupDef, variant: string) {
  return group.starterRates?.[variant] ?? group.defaultRate ?? 0;
}

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
 * Unit rate for a BOQ output: a rate typed on the BOQ wins; then the
 * package rate from the quotation (windows ₹450 / sq ft, tiles ₹60, doors
 * ₹7,000 …); then the BOQ's brand / source for its material group; then a
 * plain rate line with the same name and unit.
 */
export function rateForOutput(
  output: PricedOutput,
  rates: readonly Rate[],
  selections: Readonly<Record<string, string>> = {},
): number {
  if (output.rate !== undefined && Number.isFinite(output.rate))
    return output.rate;
  if (output.quotedRate !== undefined && Number.isFinite(output.quotedRate))
    return output.quotedRate;
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

type QuoteSection = {
  title?: string | undefined;
  brand?: string | undefined;
  grade?: string | undefined;
  description?: string | undefined;
};
/** Which rate groups a quote specification line can name a brand for. */
const QUOTE_BRAND_TARGETS: readonly {
  test: RegExp;
  groups: readonly string[];
}[] = [
  { test: /steel|tmt/, groups: ['steel'] },
  { test: /cement/, groups: ['cement', 'cement_masonry'] },
  { test: /brick|block/, groups: ['bricks'] },
  { test: /sand/, groups: ['sand'] },
];
const BRAND_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'vizag (rinl)': ['vizag', 'visakha', 'rinl'],
  'robo / m-sand': ['robo', 'm-sand', 'm sand', 'msand', 'manufactured sand'],
  'river sand': ['river'],
  'local isi': ['local'],
};
/** Names a quote may use for a variant; aliases count as the full name. */
function variantNames(variant: string) {
  const name = variant.toLowerCase();
  const first = name.split(/[\s(]/)[0] ?? name;
  return [
    ...[name, ...(BRAND_ALIASES[name] ?? [])].map((text) => ({
      text,
      full: true,
    })),
    ...(first.length > 2 ? [{ text: first, full: false }] : []),
  ];
}

/**
 * Brand / source choices named in the quotation's specifications, e.g.
 * "Steel / TMT · Vizag or JSW" → Vizag (the first one named), "Cement ·
 * UltraTech 53, Birla 43" → UltraTech for RCC and Birla for masonry.
 */
export function brandSelectionsFromQuote(
  sections: readonly QuoteSection[] | undefined,
  rates: readonly Rate[],
): Record<string, string> {
  const picks: Record<string, string> = {};
  for (const section of sections ?? []) {
    const title = (section.title ?? '').toLowerCase();
    const text = [
      section.brand,
      section.grade,
      section.description,
      section.title,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    for (const target of QUOTE_BRAND_TARGETS) {
      if (!target.test.test(title)) continue;
      for (const groupKey of target.groups) {
        if (picks[groupKey]) continue;
        const variants = [
          ...new Set(
            rates
              .filter((rate) =>
                groupKey === 'steel'
                  ? rate.material?.startsWith('steel_')
                  : rate.material === groupKey,
              )
              .map((rate) => rate.variant)
              .filter((variant): variant is string => Boolean(variant)),
          ),
        ];
        // A full variant name ("Birla 43") beats a brand word ("Birla");
        // otherwise the brand named first wins.
        let best: { variant: string; score: number } | undefined;
        for (const variant of variants) {
          for (const name of variantNames(variant)) {
            const at = text.search(
              new RegExp(
                `(^|[^a-z])${name.text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`,
              ),
            );
            const score = (name.full ? 0 : 10_000) + at;
            if (at >= 0 && (!best || score < best.score))
              best = { variant, score };
          }
        }
        if (best) picks[groupKey] = best.variant;
      }
    }
  }
  return picks;
}

/**
 * Brand / source variants for every material group: the saved ones, and the
 * default starters for groups not saved yet (so an unsaved rate card still
 * prices the BOQ at the researched defaults).
 */
export function startingVariants(saved: Rate[]): Rate[] {
  const savedVariants = saved.filter((rate) => rate.material && rate.variant);
  return MATERIAL_GROUPS.flatMap((group) => {
    const existing = savedVariants.filter(
      (rate) => rate.material === group.key,
    );
    if (existing.length) return existing;
    return group.starters.map((variant, index) => ({
      key: variantKey(group.key, variant),
      label: variant,
      unit: group.unit,
      rate: starterRate(group, variant),
      category: group.category,
      material: group.key,
      variant,
      isDefault: index === 0,
    }));
  });
}

/** Saved plain rates plus every group's variants. */
export function effectiveRates(saved: readonly Rate[]): Rate[] {
  return [
    ...saved.filter((rate) => !rate.material),
    ...startingVariants([...saved]),
  ];
}

/** Simple cost heads for the floor-wise estimate. */
export const COST_HEADS = [
  'Concrete (M20)',
  'Cement',
  'Sand',
  'Aggregate',
  'Steel',
  'Bricks',
  'Structural labour',
  'Doors & windows',
  'Flooring, tiles & kitchen',
  'Painting',
  'Electrical',
  'Plumbing & sanitary',
  'Waterproofing',
  'Water storage',
  'Design & approvals',
  'Handover',
  'Other',
] as const;
export type CostHead = (typeof COST_HEADS)[number];
/** Heads shown as quantity × rate (bought by bag, tonne, kg, number). */
export const QUANTITY_HEADS: Partial<Record<CostHead, string>> = {
  'Concrete (M20)': 'm³',
  Cement: 'bag',
  Sand: 't',
  Aggregate: 't',
  Steel: 'kg',
  Bricks: 'nos',
};
export function costHead(group: string | undefined): CostHead {
  if (!group) return 'Other';
  if (group.startsWith('steel_') || group === 'binding_wire') return 'Steel';
  if (group === 'concrete_m20') return 'Concrete (M20)';
  if (group.startsWith('cement')) return 'Cement';
  if (group === 'sand') return 'Sand';
  if (group === 'aggregate') return 'Aggregate';
  if (group === 'bricks') return 'Bricks';
  if (
    group.startsWith('door_') ||
    [
      'window',
      'ventilator',
      'rolling_shutter',
      'gate',
      'labour_door_fixing',
    ].includes(group)
  )
    return 'Doors & windows';
  if (
    [
      'floor_tiles',
      'wall_tiles',
      'kitchen_wall_tiles',
      'staircase_granite',
      'kitchen_platform',
      'kitchen_sink',
      'parking_flooring',
      'labour_tiling',
    ].includes(group)
  )
    return 'Flooring, tiles & kitchen';
  if (group.startsWith('paint_') || group === 'labour_painting')
    return 'Painting';
  if (group === 'electrical_point' || group === 'labour_electrical')
    return 'Electrical';
  if (
    group.startsWith('plumbing_') ||
    ['sanitary_cp', 'labour_plumbing', 'bathroom_waterproofing'].includes(group)
  )
    return 'Plumbing & sanitary';
  if (group === 'waterproofing') return 'Waterproofing';
  if (
    [
      'labour_civil',
      'labour_rcc',
      'labour_brickwork_9',
      'labour_brickwork_4',
      'plaster_labour',
      'shuttering',
      'excavation',
    ].includes(group)
  )
    return 'Structural labour';
  if (group === 'sump' || group === 'overhead_tank') return 'Water storage';
  if (['design_fees', 'soil_test', 'building_permission'].includes(group))
    return 'Design & approvals';
  if (group.startsWith('handover_')) return 'Handover';
  return 'Other';
}
