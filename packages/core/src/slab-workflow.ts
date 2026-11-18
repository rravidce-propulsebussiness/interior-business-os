import type { CompanyStageItem } from './company-construction-defaults';

/**
 * Reusable 20-step Slab stage, repeated per quoted floor.
 * Materials and site checks do not consume working days by default.
 * Column and staircase QC precede the pours; final slab/beam QC
 * is one scheduled working day. Daily curing uses the project's
 * existing curing log after casting and is not counted as a one-day task.
 * Exact reinforcement, concrete grades and formwork release must be
 * checked against approved structural drawings and site instructions.
 */
type SlabEntry = readonly [
  id: string,
  kind: CompanyStageItem['kind'],
  title: string,
  days: number,
  guideText?: string,
];

const slabSequence: readonly SlabEntry[] = [
  // Step 1 of 20
  ['slab-stage-payment', 'payment', 'Slab Stage Payment', 0],
  // Step 2 of 20
  [
    'slab-column-starter-marking',
    'work',
    'Column marking and starter preparation',
    1,
  ],
  ['slab-check-column-positions', 'check', 'Column positions', 0],
  ['slab-check-grid-alignment', 'check', 'Column grid alignment', 0],
  ['slab-check-starter-bars', 'check', 'Starter bars', 0],
  [
    'slab-check-starter-design',
    'check',
    'Starter reinforcement as per structural drawings',
    0,
  ],
  // Step 3 of 20
  ['slab-steel-column-rebar', 'material', 'Reinforcement steel (columns)', 0],
  ['slab-binding-wire-columns', 'material', 'Binding wire (columns)', 0],
  // Step 4 of 20
  [
    'slab-column-barbending-fixing',
    'work',
    'Column reinforcement bar bending and fixing',
    2,
  ],
  [
    'slab-check-column-bar-diameter',
    'check',
    'Column reinforcement bar diameters',
    0,
  ],
  ['slab-check-column-stirrup-spacing', 'check', 'Column stirrup spacing', 0],
  [
    'slab-check-column-lap-length',
    'check',
    'Column reinforcement lap lengths',
    0,
  ],
  ['slab-check-column-cover-blocks', 'check', 'Column cover blocks', 0],
  [
    'slab-check-column-rebar-alignment',
    'check',
    'Column reinforcement alignment',
    0,
  ],
  [
    'slab-qc-column-rebar',
    'qc',
    'Column reinforcement inspection as per structural drawings',
    0,
  ],
  // Step 5 of 20
  [
    'slab-column-shuttering-materials',
    'material',
    'Column shuttering materials',
    0,
  ],
  ['slab-column-cement', 'material', 'Cement (column concrete)', 0],
  ['slab-column-sand', 'material', 'Sand (column concrete)', 0],
  [
    'slab-column-aggregate',
    'material',
    'Specified aggregate (column concrete)',
    0,
  ],
  // Step 6 of 20
  [
    'slab-column-shuttering-concreting',
    'work',
    'Column shuttering and concreting',
    2,
  ],
  ['slab-check-column-dimensions', 'check', 'Column dimensions', 0],
  ['slab-check-column-plumb', 'check', 'Column verticality (plumb)', 0],
  [
    'slab-check-column-shutter-support',
    'check',
    'Column shuttering support',
    0,
  ],
  ['slab-check-column-levels', 'check', 'Column levels', 0],
  [
    'slab-check-column-mix-grade',
    'check',
    'Column concrete mix and grade',
    0,
  ],
  [
    'slab-check-column-concrete-quality',
    'check',
    'Column concrete quality',
    0,
  ],
  // Step 7 of 20
  [
    'slab-staircase-shuttering-materials',
    'material',
    'Staircase shuttering materials',
    0,
  ],
  ['slab-staircase-steel', 'material', 'Reinforcement steel (staircase)', 0],
  // Step 8 of 20
  ['slab-staircase-shuttering', 'work', 'Staircase shuttering', 1],
  ['slab-check-stair-dimensions', 'check', 'Staircase dimensions', 0],
  ['slab-check-stair-tread', 'check', 'Staircase tread dimensions', 0],
  ['slab-check-stair-riser', 'check', 'Staircase riser dimensions', 0],
  ['slab-check-stair-landing-level', 'check', 'Staircase landing levels', 0],
  [
    'slab-check-stair-shutter-support',
    'check',
    'Staircase shuttering support',
    0,
  ],
  // Step 9 of 20
  [
    'slab-staircase-rebar-fixing',
    'work',
    'Staircase reinforcement fixing',
    1,
  ],
  [
    'slab-check-stair-rebar-spacing',
    'check',
    'Staircase reinforcement spacing',
    0,
  ],
  [
    'slab-check-stair-rebar-cover',
    'check',
    'Staircase reinforcement cover',
    0,
  ],
  [
    'slab-check-stair-anchorage',
    'check',
    'Staircase reinforcement anchorage as per structural design',
    0,
  ],
  [
    'slab-qc-staircase-rebar-form',
    'qc',
    'Staircase reinforcement and formwork inspection',
    0,
  ],
  // Step 10 of 20
  ['slab-staircase-cement', 'material', 'Cement (staircase concrete)', 0],
  ['slab-staircase-sand', 'material', 'Sand (staircase concrete)', 0],
  [
    'slab-staircase-aggregate',
    'material',
    'Specified aggregate (staircase concrete)',
    0,
  ],
  // Step 11 of 20
  ['slab-staircase-concreting', 'work', 'Staircase concreting', 1],
  ['slab-check-stair-concrete-grade', 'check', 'Staircase concrete grade', 0],
  ['slab-check-stair-placement', 'check', 'Staircase concrete placement', 0],
  [
    'slab-check-stair-compaction',
    'check',
    'Staircase concrete compaction',
    0,
  ],
  ['slab-check-stair-finishing', 'check', 'Staircase concrete finishing', 0],
  // Step 12 of 20
  [
    'slab-staircase-column-rise',
    'work',
    'Staircase column rise / landing support columns, where specified',
    1,
  ],
  [
    'slab-check-stair-column-height',
    'check',
    'Staircase support column height',
    0,
  ],
  [
    'slab-check-stair-column-alignment',
    'check',
    'Staircase support column alignment',
    0,
  ],
  [
    'slab-check-stair-column-plumb',
    'check',
    'Staircase support column plumb',
    0,
  ],
  [
    'slab-check-stair-column-structural',
    'check',
    'Staircase support column structural details',
    0,
  ],
  // Step 13 of 20
  [
    'slab-beam-shuttering-plywood',
    'material',
    'Slab and beam shuttering plywood',
    0,
  ],
  [
    'slab-beam-shuttering-props',
    'material',
    'Slab and beam shuttering props',
    0,
  ],
  [
    'slab-beam-shuttering-supports',
    'material',
    'Slab and beam shuttering supports',
    0,
  ],
  [
    'slab-beam-shuttering-accessories',
    'material',
    'Slab and beam shuttering accessories',
    0,
  ],
  // Step 14 of 20
  ['slab-beam-shuttering', 'work', 'Slab and beam shuttering', 3],
  ['slab-check-slab-level', 'check', 'Slab level', 0],
  ['slab-check-beam-sizes', 'check', 'Beam dimensions and sizes', 0],
  ['slab-check-slab-thickness', 'check', 'Slab thickness', 0],
  [
    'slab-check-slab-shutter-support',
    'check',
    'Slab and beam shuttering support',
    0,
  ],
  [
    'slab-check-slab-shutter-alignment',
    'check',
    'Slab and beam shuttering alignment',
    0,
  ],
  // Step 15 of 20
  ['slab-beam-steel', 'material', 'Slab and beam reinforcement steel', 0],
  ['slab-beam-binding-wire', 'material', 'Slab and beam binding wire', 0],
  ['slab-beam-cover-blocks', 'material', 'Slab and beam cover blocks', 0],
  [
    'slab-beam-embedded-conduits',
    'material',
    'Embedded electrical conduits (slab and beam)',
    0,
  ],
  // Step 16 of 20
  [
    'slab-beam-rebar-fixing',
    'work',
    'Slab and beam reinforcement bar bending and fixing',
    2,
  ],
  ['slab-check-main-bars', 'check', 'Slab main reinforcement bars', 0],
  ['slab-check-distribution-bars', 'check', 'Slab distribution bars', 0],
  ['slab-check-beam-reinforcement', 'check', 'Beam reinforcement details', 0],
  [
    'slab-check-rebar-spacing',
    'check',
    'Slab and beam reinforcement spacing',
    0,
  ],
  ['slab-check-rebar-laps', 'check', 'Slab and beam reinforcement laps', 0],
  [
    'slab-check-development-length',
    'check',
    'Slab and beam reinforcement development length',
    0,
  ],
  ['slab-check-rebar-cover', 'check', 'Slab and beam reinforcement cover', 0],
  // Step 17 of 20
  [
    'slab-qc-final-prepour',
    'qc',
    'Final slab and beam reinforcement, shuttering and embedded-services inspection',
    1,
  ],
  // Step 18 of 20
  ['slab-beam-cement', 'material', 'Cement (slab and beam concrete)', 0],
  ['slab-beam-sand', 'material', 'Sand (slab and beam concrete)', 0],
  [
    'slab-beam-aggregate',
    'material',
    'Specified aggregate (slab and beam concrete)',
    0,
  ],
  [
    'slab-beam-concrete-supply',
    'material',
    'Concrete supply (slab and beam)',
    0,
  ],
  // Step 19 of 20
  ['slab-beam-concreting', 'work', 'Slab and beam concreting', 1],
  ['slab-check-pour-grade', 'check', 'Slab and beam concrete grade', 0],
  [
    'slab-check-workability',
    'check',
    'Slab and beam concrete workability',
    0,
  ],
  [
    'slab-check-concrete-compaction',
    'check',
    'Slab and beam concrete compaction',
    0,
  ],
  ['slab-check-concrete-levels', 'check', 'Slab and beam concrete levels', 0],
  [
    'slab-check-concrete-samples',
    'check',
    'Slab and beam concrete test samples',
    0,
  ],
  [
    'slab-check-concrete-finishing',
    'check',
    'Slab and beam concrete finishing',
    0,
  ],
  // Step 20 of 20
  [
    'slab-curing-daily-log',
    'work',
    'Slab curing and daily curing records',
    0,
    'Work Log — daily after casting. Record curing rounds, condition and supporting photos or videos in the project\'s existing Daily Curing section. Curing and formwork removal periods must follow the approved engineering plan and are not included in the 16 scheduled working days.',
  ],
];

export const defaultSlabWorkItems: CompanyStageItem[] = slabSequence.map(
  ([id, kind, title, days, guideText]) => ({
    id,
    kind,
    title,
    days,
    ...(guideText ? { guideText } : {}),
  }),
);

export const defaultSlabDays = defaultSlabWorkItems.reduce(
  (total, item) => total + (item.kind === 'payment' ? 0 : item.days),
  0,
);
