import type { CompanyStageItem } from './company-construction-defaults';

/**
 * Reusable ordered Foundation workflow. Material, Check, QC and Payment
 * markers have zero planned days until explicitly scheduled. The one
 * unspecified work duration (column shuttering and concreting) starts at
 * one editable working day.
 *
 * Concrete grade, aggregate size, reinforcement and termite treatment
 * must be verified against approved drawings and specifications on site.
 */
type FoundationEntry = readonly [
  id: string,
  kind: CompanyStageItem['kind'],
  title: string,
  days: number,
];

const foundationSequence: readonly FoundationEntry[] = [
  // Payment first
  ['foundation-payment', 'payment', 'Foundation payment', 0],
  // Step 1 of 18
  ['fd-site-marking-excavation', 'work', 'Site marking and excavation', 2],
  [
    'fd-check-excavation-depth',
    'check',
    'Excavation depth and footing dimensions',
    0,
  ],
  ['fd-check-footing-column-layout', 'check', 'Footing and column alignment', 0],
  // Step 2 of 18
  ['fd-sand-excavation-pcc', 'material', 'Sand (excavation PCC)', 0],
  ['fd-cement-excavation-pcc', 'material', 'Cement (excavation PCC)', 0],
  ['fd-40mm-excavation-pcc', 'material', '40 mm aggregate (excavation PCC)', 0],
  // Step 3 of 18
  [
    'fd-excavation-dressing-pcc',
    'work',
    'Excavation bed dressing and PCC laying',
    2,
  ],
  ['fd-check-pcc-column-alignment', 'check', 'Column alignment before PCC', 0],
  [
    'fd-check-excavation-pcc-mix',
    'check',
    'PCC mix ratio as per approved specification',
    0,
  ],
  // Step 4 of 18
  [
    'fd-steel-footing-columns',
    'material',
    'Reinforcement steel (footings and columns)',
    0,
  ],
  // Step 5 of 18
  [
    'fd-footing-column-rebar',
    'work',
    'Column marking and reinforcement bar bending for footings and columns',
    3,
  ],
  [
    'fd-check-footing-rebar-spacing',
    'check',
    'Footing and column reinforcement spacing',
    0,
  ],
  [
    'fd-check-footing-column-position',
    'check',
    'Footing and column positions and alignment as per structural drawings',
    0,
  ],
  [
    'fd-qc-footing-reinforcement',
    'qc',
    'Footing and column reinforcement QC as per structural drawings',
    0,
  ],
  // Step 6 of 18
  ['fd-sand-footing-concrete', 'material', 'Sand (footing concrete)', 0],
  ['fd-cement-footing-concrete', 'material', 'Cement (footing concrete)', 0],
  [
    'fd-20mm-footing-concrete',
    'material',
    '20 mm aggregate (footing concrete)',
    0,
  ],
  // Step 7 of 18
  ['fd-footing-concreting', 'work', 'Footing concreting', 1],
  [
    'fd-check-footing-water-ratio',
    'check',
    'Footing concrete water quantity and water-cement ratio',
    0,
  ],
  [
    'fd-check-footing-mix',
    'check',
    'Footing concrete mix and grade as per approved design',
    0,
  ],
  // Step 8 of 18
  ['fd-sand-column-concrete', 'material', 'Sand (column concrete)', 0],
  ['fd-cement-column-concrete', 'material', 'Cement (column concrete)', 0],
  ['fd-20mm-column-concrete', 'material', '20 mm aggregate (column concrete)', 0],
  // Step 9 of 18
  [
    'fd-column-shuttering-concreting',
    'work',
    'Column shuttering and concreting',
    1,
  ],
  [
    'fd-check-column-plinth-level',
    'check',
    'Column level and planned plinth height',
    0,
  ],
  [
    'fd-check-column-concrete-mix',
    'check',
    'Column concrete mix and grade as per approved design',
    0,
  ],
  [
    'fd-check-column-plumb',
    'check',
    'Column verticality (plumb), straightness and alignment',
    0,
  ],
  // Step 10 of 18
  ['fd-backfilling-leveling', 'work', 'Backfilling and leveling', 1],
  // Step 11 of 18
  [
    'fd-40mm-granite-base',
    'material',
    '40 mm aggregate (granite masonry base)',
    0,
  ],
  ['fd-granite-stone-base', 'material', 'Granite stones (plinth-beam base)', 0],
  ['fd-cement-granite-base', 'material', 'Cement (granite masonry base)', 0],
  ['fd-sand-granite-base', 'material', 'Sand (granite masonry base)', 0],
  // Step 12 of 18
  [
    'fd-granite-plinth-base',
    'work',
    'Granite masonry base for plinth beam, where specified',
    4,
  ],
  ['fd-check-plinth-line-marking', 'check', 'Plinth beam line marking', 0],
  ['fd-check-plinth-base-alignment', 'check', 'Plinth beam base alignment', 0],
  ['fd-check-plinth-base-level', 'check', 'Plinth beam base level', 0],
  // Step 13 of 18
  ['fd-steel-plinth-beam', 'material', 'Reinforcement steel (plinth beam)', 0],
  // Step 14 of 18
  ['fd-plinth-rebar-bending', 'work', 'Plinth beam reinforcement bar bending', 2],
  [
    'fd-check-plinth-rebar-spacing',
    'check',
    'Plinth beam reinforcement spacing',
    0,
  ],
  [
    'fd-check-plinth-rebar-design',
    'check',
    'Plinth beam reinforcement as per structural drawings',
    0,
  ],
  [
    'fd-qc-plinth-rebar',
    'qc',
    'Plinth beam reinforcement QC as per structural drawings',
    0,
  ],
  // Step 15 of 18
  [
    'fd-plinth-shuttering-concreting',
    'work',
    'Plinth beam shuttering and concreting',
    2,
  ],
  [
    'fd-check-plinth-beam-size',
    'check',
    'Plinth beam cross-section dimensions',
    0,
  ],
  ['fd-check-plinth-beam-alignment', 'check', 'Plinth beam alignment', 0],
  ['fd-check-plinth-beam-level', 'check', 'Plinth beam level', 0],
  [
    'fd-check-plinth-beam-mix',
    'check',
    'Plinth beam concrete mix and grade as per approved design',
    0,
  ],
  // Step 16 of 18
  ['fd-soil-level-compaction', 'work', 'Soil leveling and compaction', 3],
  // Step 17 of 18
  ['fd-sand-final-pcc', 'material', 'Sand (final PCC bed)', 0],
  ['fd-cement-final-pcc', 'material', 'Cement (final PCC bed)', 0],
  ['fd-40mm-final-pcc', 'material', '40 mm aggregate (final PCC bed)', 0],
  // Step 18 of 18
  ['fd-termite-pcc-bed', 'work', 'Anti-termite treatment followed by PCC bed', 1],
];

export const defaultFoundationWorkItems: CompanyStageItem[] =
  foundationSequence.map(([id, kind, title, days]) => ({
    id,
    kind,
    title,
    days,
  }));

export const defaultFoundationDays = defaultFoundationWorkItems.reduce(
  (total, item) => total + (item.kind === 'payment' ? 0 : item.days),
  0,
);
