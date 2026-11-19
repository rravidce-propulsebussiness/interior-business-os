import type { CompanyStageItem } from './company-construction-defaults';

type WorkflowEntry = readonly [
  id: string,
  kind: CompanyStageItem['kind'],
  title: string,
  days: number,
  guideText?: string,
];

const externalPlasteringSequence: readonly WorkflowEntry[] = [
  [
    'payment-external-plastering',
    'payment',
    'External Plastering & Elevation Payment',
    0,
  ],
  [
    'external-material-cement-sand',
    'material',
    'Cement and clean plastering sand (approved mix)',
    0,
  ],
  [
    'external-material-bonding-waterproofing',
    'material',
    'Bonding agent and waterproofing admixture (if specified)',
    0,
  ],
  [
    'external-material-mesh-beads',
    'material',
    'Junction mesh, corner beads and drip-edge profiles (as detailed)',
    0,
  ],
  [
    'external-material-access-safety',
    'material',
    'Scaffolding, safety net, PPE and access equipment',
    0,
  ],
  [
    'external-work-surface-preparation',
    'work',
    'Inspect, clean and prepare exterior surfaces; fix junction mesh',
    2,
  ],
  [
    'external-check-scaffold-layout',
    'check',
    'Scaffold safety, elevation set-out and opening protection',
    0,
  ],
  [
    'external-work-base-coat',
    'work',
    'Apply external plaster base coat to approved thickness',
    4,
  ],
  [
    'external-check-base-coat',
    'check',
    'Base-coat thickness, line, level, plumb and surface bond',
    0,
  ],
  [
    'external-work-curing-log',
    'work',
    'Record external plaster curing and daily façade inspections',
    0,
    'Log curing rounds, weather conditions, photos and any cracking. Follow the approved specification and engineer direction; do not shorten the required curing period to fit the scheduled work days.',
  ],
  [
    'external-work-finish-coat',
    'work',
    'Apply finish coat and approved façade texture',
    3,
  ],
  [
    'external-work-elevation-details',
    'work',
    'Form elevation bands, grooves, corners, sills and drip edges',
    2,
  ],
  [
    'external-check-elevation-details',
    'check',
    'Elevation symmetry, corner straightness, groove depth and drip direction',
    0,
  ],
  [
    'external-work-waterproof-detailing',
    'work',
    'Seal façade joints and apply specified weatherproof detailing',
    1,
  ],
  [
    'external-check-waterproof-detailing',
    'check',
    'Window edges, parapets, service penetrations and rainwater paths',
    0,
  ],
  [
    'external-qc-façade',
    'qc',
    'Final external plaster and elevation quality inspection',
    0,
  ],
];

const tileSequence: readonly WorkflowEntry[] = [
  ['payment-tiles', 'payment', 'Tiles payment', 0],
  [
    'tiles-material-approved',
    'material',
    'Approved floor and wall tiles with matching batches',
    0,
  ],
  [
    'tiles-material-adhesive',
    'material',
    'Tile adhesive or approved cement-sand bedding mix',
    0,
  ],
  [
    'tiles-material-grout-spacers',
    'material',
    'Grout, spacers, levelling clips, trims and skirting tiles',
    0,
  ],
  [
    'tiles-material-waterproofing',
    'material',
    'Wet-area waterproofing products and protection sheets',
    0,
  ],
  [
    'tiles-work-substrate-prep',
    'work',
    'Prepare substrates, mark levels and set tile layout lines',
    1,
  ],
  [
    'tiles-check-substrate',
    'check',
    'Substrate strength, curing, flatness, level and cleanliness',
    0,
  ],
  [
    'tiles-work-waterproofing',
    'work',
    'Waterproof bathrooms, balconies and other specified wet areas',
    2,
  ],
  [
    'tiles-test-waterproofing',
    'test',
    'Wet-area ponding test and drain outlet verification',
    0,
  ],
  [
    'tiles-qc-waterproofing',
    'qc',
    'Waterproofing hold-point inspection before tile covering',
    0,
  ],
  [
    'tiles-work-wall-laying',
    'work',
    'Set out and lay bathroom, kitchen and utility wall tiles',
    2,
  ],
  [
    'tiles-check-wall-laying',
    'check',
    'Wall tile alignment, joint width, edge cuts and lippage',
    0,
  ],
  [
    'tiles-work-wet-floor-laying',
    'work',
    'Lay bathroom and balcony floor tiles to the approved falls',
    1,
  ],
  [
    'tiles-check-wet-floor-fall',
    'check',
    'Floor slope to drain, water flow and no ponding at corners',
    0,
  ],
  [
    'tiles-work-room-floor-laying',
    'work',
    'Lay room and common-area floor tiles to approved setting out',
    2,
  ],
  [
    'tiles-check-floor-laying',
    'check',
    'Floor levels, tile alignment, lippage and hollow spots',
    0,
  ],
  [
    'tiles-work-skirting-thresholds',
    'work',
    'Install skirting, thresholds and movement-joint trims',
    1,
  ],
  [
    'tiles-check-skirting-thresholds',
    'check',
    'Skirting height, threshold levels and doorway clearances',
    0,
  ],
  [
    'tiles-work-grouting-cleaning',
    'work',
    'Grout joints, clean tile faces and protect completed floors',
    1,
  ],
  [
    'tiles-check-grout-finish',
    'check',
    'Consistent grout fill, clean edges, unchipped tiles and protection',
    0,
  ],
  ['tiles-qc-final', 'qc', 'Final floor and wall tile quality inspection', 0],
];

const paintingSequence: readonly WorkflowEntry[] = [
  ['payment-painting', 'payment', 'Painting payment', 0],
  [
    'painting-material-putty-primer',
    'material',
    'Approved wall putty, interior primer and exterior primer',
    0,
  ],
  [
    'painting-material-coats',
    'material',
    'Approved interior paint, weather-resistant exterior paint and tint',
    0,
  ],
  [
    'painting-material-protection',
    'material',
    'Sandpaper, fillers, masking tape, floor covers and application tools',
    0,
  ],
  [
    'painting-work-surface-prep',
    'work',
    'Protect finished work; fill cracks, scrape loose material and sand',
    2,
  ],
  [
    'painting-check-surface-prep',
    'check',
    'Plaster dryness, moisture, cracks, smoothness and clean edges',
    0,
  ],
  [
    'painting-work-putty',
    'work',
    'Apply approved putty coats and sand between coats',
    2,
  ],
  [
    'painting-check-putty',
    'check',
    'Wall flatness, corner lines, patched areas and sanding marks',
    0,
  ],
  [
    'painting-work-primer',
    'work',
    'Apply interior and exterior primer to prepared surfaces',
    1,
  ],
  [
    'painting-check-primer',
    'check',
    'Primer coverage, adhesion and substrate readiness for top coats',
    0,
  ],
  [
    'painting-work-interior-coats',
    'work',
    'Apply approved interior colour coats to walls and ceilings',
    2,
  ],
  [
    'painting-check-interior-coats',
    'check',
    'Colour approval, uniform coverage, cut-ins and visible patching',
    0,
  ],
  [
    'painting-work-exterior-coats',
    'work',
    'Apply weatherproof exterior finish coats to this floor elevation',
    2,
  ],
  [
    'painting-check-exterior-coats',
    'check',
    'Exterior coverage, rain edges, drips, uniform colour and finish',
    0,
  ],
  [
    'painting-work-touchups',
    'work',
    'Complete touch-ups and remove masking after adjoining work is clear',
    1,
  ],
  [
    'painting-check-final-finish',
    'check',
    'Final finish in daylight; protect switches, fittings and finished floors',
    0,
  ],
  [
    'painting-qc-final',
    'qc',
    'Final interior and exterior painting inspection',
    0,
  ],
];

const toItems = (sequence: readonly WorkflowEntry[]): CompanyStageItem[] =>
  sequence.map(([id, kind, title, days, guideText]) => ({
    id,
    kind,
    title,
    days,
    ...(guideText ? { guideText } : {}),
  }));

export const defaultExternalPlasteringItems = toItems(
  externalPlasteringSequence,
);
export const defaultTilesItems = toItems(tileSequence);
export const defaultPaintingItems = toItems(paintingSequence);

export const defaultExternalPlasteringDays = defaultExternalPlasteringItems
  .filter((item) => item.kind !== 'payment')
  .reduce((total, item) => total + item.days, 0);
export const defaultTilesDays = defaultTilesItems
  .filter((item) => item.kind !== 'payment')
  .reduce((total, item) => total + item.days, 0);
export const defaultPaintingDays = defaultPaintingItems
  .filter((item) => item.kind !== 'payment')
  .reduce((total, item) => total + item.days, 0);
