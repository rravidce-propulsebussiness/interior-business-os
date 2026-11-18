import type { CompanyStageItem } from './company-construction-defaults';

/**
 * Approved 20-step Brickwork workflow, repeated for every quoted floor.
 * The user's original sixteen-day schedule is expanded to thirty working
 * days by distributing fourteen additional days across the same work items.
 * The DPC/sill-band and window-sill treatment are conditional on the
 * approved architectural/structural details, avoiding duplicate treatments.
 * Curing is recorded daily in the existing project flow and is not counted
 * as a one-day work task.
 */
type BrickworkEntry = readonly [
  id: string,
  kind: CompanyStageItem['kind'],
  title: string,
  days: number,
  guideText?: string,
];

const brickworkSequence: readonly BrickworkEntry[] = [
  // Step 1 of 20
  ['brickwork-stage-payment', 'payment', 'Brickwork Stage Payment', 0],
  // Step 2 of 20
  ['bw-bricks-or-blocks', 'material', 'Bricks or approved blocks', 0],
  ['bw-cement-masonry', 'material', 'Cement (brickwork mortar)', 0],
  ['bw-sand-masonry', 'material', 'Sand (brickwork mortar)', 0],
  ['bw-water-masonry', 'material', 'Water (brickwork mortar and curing)', 0],
  // Step 3 of 20
  [
    'bw-room-wall-marking',
    'work',
    'Room marking and internal/external wall layout',
    2,
  ],
  ['bw-check-room-wall-size', 'check', 'Room dimensions and wall thickness', 0],
  [
    'bw-check-room-diagonal-alignment',
    'check',
    'Room diagonals and wall alignment',
    0,
  ],
  [
    'bw-check-room-openings-plan',
    'check',
    'Door/window openings as per approved floor plan',
    0,
  ],
  // Step 4 of 20
  ['bw-masonry-three-foot', 'work', 'Brickwork up to 3-foot height', 6],
  ['bw-check-brick-quality', 'check', 'Brick/block quality', 0],
  ['bw-check-masonry-mortar-ratio', 'check', 'Mortar mix ratio', 0],
  [
    'bw-check-masonry-bond-joints',
    'check',
    'Masonry bonding and joint thickness',
    0,
  ],
  [
    'bw-check-masonry-line-level-plumb',
    'check',
    'Brickwork line, level and plumb',
    0,
  ],
  ['bw-check-masonry-wall-thickness', 'check', 'Brickwork wall thickness', 0],
  // Step 5 of 20
  ['bw-door-frames', 'material', 'Door frames', 0],
  ['bw-door-holdfasts', 'material', 'Door holdfasts', 0],
  [
    'bw-door-anchor-fasteners',
    'material',
    'Door frame anchor fasteners and fixing materials',
    0,
  ],
  // Step 6 of 20
  ['bw-door-frame-fixing', 'work', 'Door frame positioning and fixing', 2],
  [
    'bw-check-door-positions-openings',
    'check',
    'Door location and opening dimensions',
    0,
  ],
  ['bw-check-door-level-plumb', 'check', 'Door frame level and plumb', 0],
  ['bw-check-door-diagonals', 'check', 'Door frame diagonals', 0],
  ['bw-check-door-anchorage', 'check', 'Door frame holdfasts and anchorage', 0],
  // Step 7 of 20
  ['bw-cement-dpc', 'material', 'Cement (DPC / sill-level band)', 0],
  ['bw-sand-dpc', 'material', 'Sand (DPC / sill-level band)', 0],
  [
    'bw-waterproofing-compound-dpc',
    'material',
    'Waterproofing compound (DPC / sill-level band)',
    0,
  ],
  [
    'bw-reinforcement-dpc',
    'material',
    'DPC / sill-band reinforcement where specified',
    0,
  ],
  // Step 8 of 20
  [
    'bw-dpc-bed-band',
    'work',
    'DPC bed / sill-level band, where specified',
    2,
    'Follow the approved plans and specification. Do not duplicate window-sill DPC or waterproofing treatment when the approved design provides only one treatment.',
  ],
  [
    'bw-check-dpc-level-thickness',
    'check',
    'DPC / sill-band level and thickness',
    0,
  ],
  ['bw-check-dpc-alignment', 'check', 'DPC / sill-band alignment', 0],
  ['bw-check-dpc-waterproofing', 'check', 'DPC waterproofing treatment', 0],
  [
    'bw-check-dpc-design',
    'check',
    'DPC / sill-band compliance with approved details',
    0,
  ],
  // Step 9 of 20
  ['bw-window-openings-marking', 'work', 'Window opening marking', 1],
  [
    'bw-check-window-width-height',
    'check',
    'Window opening width and height',
    0,
  ],
  ['bw-check-window-sill-level', 'check', 'Window sill level', 0],
  [
    'bw-check-window-alignment-position',
    'check',
    'Window opening alignment and position as per approved plan',
    0,
  ],
  // Step 10 of 20
  [
    'bw-masonry-to-lintel',
    'work',
    'Continue brickwork up to door/lintel level',
    5,
  ],
  [
    'bw-check-openings-lintel',
    'check',
    'Door/window opening dimensions at lintel level',
    0,
  ],
  ['bw-check-wall-plumb-lintel', 'check', 'Wall plumb up to lintel level', 0],
  ['bw-check-bonding-lintel', 'check', 'Masonry bonding up to lintel level', 0],
  ['bw-check-mortar-lintel', 'check', 'Mortar ratio up to lintel level', 0],
  ['bw-check-lintel-level', 'check', 'Door/window lintel level', 0],
  // Step 11 of 20
  [
    'bw-window-sill-treatment',
    'work',
    'Window sill waterproofing / DPC treatment, where specified',
    1,
    'Carry out only the waterproofing/DPC treatment specified by the approved design. If the sill treatment was completed under the earlier DPC band, record verification rather than repeat construction.',
  ],
  [
    'bw-check-window-sill-slope-level',
    'check',
    'Window sill slope and level',
    0,
  ],
  [
    'bw-check-window-sill-waterproof-continuity',
    'check',
    'Window sill waterproofing continuity',
    0,
  ],
  [
    'bw-check-window-sill-openings',
    'check',
    'Window opening dimensions after sill treatment',
    0,
  ],
  // Step 12 of 20
  [
    'bw-lintel-sajja-steel',
    'material',
    'Reinforcement steel (lintels and sajjas)',
    0,
  ],
  [
    'bw-lintel-sajja-shuttering',
    'material',
    'Shuttering plywood (lintels and sajjas)',
    0,
  ],
  [
    'bw-lintel-sajja-supports',
    'material',
    'Shuttering supports (lintels and sajjas)',
    0,
  ],
  ['bw-lintel-sajja-cement', 'material', 'Cement (lintel/sajja concrete)', 0],
  ['bw-lintel-sajja-sand', 'material', 'Sand (lintel/sajja concrete)', 0],
  [
    'bw-lintel-sajja-aggregate',
    'material',
    'Specified aggregates (lintel/sajja concrete)',
    0,
  ],
  // Step 13 of 20
  [
    'bw-sajja-shuttering-rebar',
    'work',
    'Sajja (sunshade/chajja) shuttering and reinforcement',
    2,
  ],
  ['bw-check-sajja-projection-slope', 'check', 'Sajja projection and slope', 0],
  [
    'bw-check-sajja-rebar-anchor',
    'check',
    'Sajja reinforcement and anchorage',
    0,
  ],
  ['bw-check-sajja-cover', 'check', 'Sajja reinforcement cover', 0],
  ['bw-check-sajja-shutter-support', 'check', 'Sajja shuttering support', 0],
  // Step 14 of 20
  [
    'bw-lintel-shuttering-rebar',
    'work',
    'Door/window lintel shuttering and reinforcement fixing',
    2,
  ],
  [
    'bw-check-lintel-sizes-bearing',
    'check',
    'Lintel dimensions and bearing',
    0,
  ],
  ['bw-check-lintel-rebar-spacing', 'check', 'Lintel reinforcement spacing', 0],
  ['bw-check-lintel-cover', 'check', 'Lintel reinforcement cover', 0],
  [
    'bw-check-lintel-form-level-support',
    'check',
    'Lintel formwork level and support',
    0,
  ],
  // Step 15 of 20
  [
    'bw-qc-lintel-sajja-rebar-form',
    'qc',
    'Lintel and sajja reinforcement and shuttering inspection',
    0,
  ],
  // Step 16 of 20
  ['bw-lintel-sajja-concreting', 'work', 'Lintel and sajja concreting', 2],
  ['bw-check-lintel-concrete-grade', 'check', 'Lintel/sajja concrete grade', 0],
  ['bw-check-lintel-concrete-mix', 'check', 'Lintel/sajja concrete mix', 0],
  ['bw-check-lintel-placement', 'check', 'Lintel/sajja concrete placement', 0],
  [
    'bw-check-lintel-compaction',
    'check',
    'Lintel/sajja concrete compaction',
    0,
  ],
  [
    'bw-check-lintel-level-finishing',
    'check',
    'Lintel/sajja concrete levels and finishing',
    0,
  ],
  // Step 17 of 20
  [
    'bw-masonry-to-slab-soffit',
    'work',
    'Brickwork from lintel level up to slab soffit',
    5,
  ],
  [
    'bw-check-final-wall-line-plumb',
    'check',
    'Final wall alignment and plumb',
    0,
  ],
  ['bw-check-final-bonding', 'check', 'Final masonry bonding', 0],
  ['bw-check-final-mortar-joints', 'check', 'Final masonry mortar joints', 0],
  ['bw-check-final-top-junction', 'check', 'Wall-to-slab top junction', 0],
  ['bw-check-final-wall-height', 'check', 'Final wall height', 0],
  // Step 18 of 20
  [
    'bw-check-slab-wall-junction',
    'check',
    'Slab-to-wall junction treatment',
    0,
  ],
  [
    'bw-check-final-gaps-openings',
    'check',
    'Remaining wall gaps and door/window openings',
    0,
  ],
  [
    'bw-check-service-sleeves',
    'check',
    'Provision for electrical/plumbing service sleeves',
    0,
  ],
  // Step 19 of 20
  [
    'bw-qc-final-brickwork',
    'qc',
    'Final brickwork inspection before electrical and plumbing work',
    0,
  ],
  // Step 20 of 20
  [
    'bw-daily-curing-inspection-log',
    'work',
    'Brickwork curing and daily site inspection records',
    0,
    "Work Log — record brickwork curing rounds, daily condition checks, photos and notes in the project's existing Daily Curing/inspection workflow. The required curing period follows the approved site specifications and is not reduced to the 30 scheduled working days.",
  ],
];

export const defaultBrickworkItems: CompanyStageItem[] = brickworkSequence.map(
  ([id, kind, title, days, guideText]) => ({
    id,
    kind,
    title,
    days,
    ...(guideText ? { guideText } : {}),
  }),
);

export const defaultBrickworkDays = defaultBrickworkItems.reduce(
  (total, item) => total + (item.kind === 'payment' ? 0 : item.days),
  0,
);
