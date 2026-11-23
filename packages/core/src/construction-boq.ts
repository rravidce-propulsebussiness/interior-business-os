/**
 * Quotation-driven construction BOQ.
 *
 * Builds a pre-design bill of quantities from the floors, dimensions, floor
 * heights and package specification allowances already saved on a floor-wise
 * (SFT) quotation. Structural quantities are thumb-rule estimates driven by
 * editable company settings; they are not a substitute for the structural
 * engineer's bar bending schedule.
 *
 * Steel weights are for whole stock bars bought; offcuts are wastage.
 * Steel is planned the way it is cut on site: stock bars (40 ft / 12 m by
 * default) are cut into column "lifts". The foundation lift (footing up through
 * the ground floor, plus lap) is normally one half bar, and each upper floor
 * lift (floor height + lap) is normally one third bar. When a floor height plus
 * its lap no longer fits the company's usual cut, fewer pieces are taken from
 * each bar and a warning is shown.
 *
 * Pure module: no database, browser or React dependencies.
 */
import { parseSftEstimate, type SftEstimateDetails } from './sft-quotation';
import type { DesignFootingType } from './footing-takeoff';
import {
  FOOTING_TYPES,
  newFootingType,
  footingConcreteCft,
  pedestalConcreteCft,
  footingMeshPieces,
  barsAcross,
  padCount,
} from './footing-takeoff';
export type { DesignFootingType, FootingRebarSet } from './footing-takeoff';
export { FOOTING_TYPES, newFootingType } from './footing-takeoff';

export type BoqOrigin =
  'quotation-structure' | 'quotation-allowance' | 'quotation-additional';

export type GeneratedOutput = {
  name: string;
  quantity: number;
  unit: string;
  /** Rate-card material group, priced from the brand/source chosen on the BOQ. */
  material?: string;
  /** Fixed unit cost entered on the BOQ (overrides the rate card). */
  rate?: number;
  /**
   * What the quotation charges the customer per unit (package allowance).
   * Reference only: the BOQ is the cost of the work, priced from the rate
   * card.
   */
  quotedRate?: number;
  source?: string;
  /** Stock bars to buy (reinforcement is quantified in rods). */
  rods?: number;
  diameter?: number;
  /** Weight of those rods, for reinforcement outputs. */
  weightKg?: number;
  /** What to order, e.g. "312 tiles of 2×2 ft · 78 boxes of 4". */
  order?: string;
};

export type GeneratedLine = {
  id: string;
  name: string;
  section: string;
  kind: string;
  unit: string;
  inputs: Record<string, string | number | boolean>;
  outputs: GeneratedOutput[];
  quotedPrice?: number;
  notes: string;
  origin: BoqOrigin;
};

export type BoqFloor = {
  name: string;
  areaSqft: number;
  lengthFeet: number;
  widthFeet: number;
  /** Floor-to-floor (slab-to-slab) height in feet. */
  heightFeet: number;
  /** True when the height was not entered on the quotation. */
  heightAssumed?: boolean;
  /** Part of the area quoted as parking / stilt (few walls, parking floor). */
  parkingSqft?: number;
  /** Penthouse area from the quotation, if separately identified. */
  penthouseSqft?: number;
};

/** One drawn wall segment; the measurement is repeated by count. */
export type WallMeasure = {
  id: string;
  name: string;
  location: 'external' | 'internal';
  count: number;
  lengthFeet: number;
  heightFeet: number;
  thicknessIn: number;
};

/** Doors, windows and bathrooms on one floor (editable per floor). */
export type FloorCounts = {
  mainDoors: number;
  internalDoors: number;
  bathroomDoors: number;
  poojaDoors: number;
  windows: number;
  ventilators: number;
  bathrooms: number;
  kitchens: number;
  rollingShutters: number;
  /** Electrical points. */
  lightPoints: number;
  fanPoints: number;
  /** 6 A sockets (phone, TV, small appliances). */
  socketPoints: number;
  /** 16 A power points (geyser, AC, kitchen appliances). */
  powerPoints: number;
};
export const FLOOR_COUNT_GROUPS = [
  'Doors & windows',
  'Bathrooms & kitchens',
  'Electrical points',
] as const;
export const FLOOR_COUNT_FIELDS = [
  ['mainDoors', 'Main doors', 'Doors & windows'],
  ['internalDoors', 'Bedroom / internal doors', 'Doors & windows'],
  ['bathroomDoors', 'Bathroom doors', 'Doors & windows'],
  ['poojaDoors', 'Pooja doors', 'Doors & windows'],
  ['windows', 'Windows', 'Doors & windows'],
  ['ventilators', 'Ventilators', 'Doors & windows'],
  ['rollingShutters', 'Rolling shutters', 'Doors & windows'],
  ['bathrooms', 'Bathrooms', 'Bathrooms & kitchens'],
  ['kitchens', 'Kitchens', 'Bathrooms & kitchens'],
  ['lightPoints', 'Light points', 'Electrical points'],
  ['fanPoints', 'Fan points', 'Electrical points'],
  ['socketPoints', '6 A sockets', 'Electrical points'],
  ['powerPoints', '16 A power points (geyser, AC)', 'Electrical points'],
] as const satisfies readonly (readonly [
  keyof FloorCounts,
  string,
  (typeof FLOOR_COUNT_GROUPS)[number],
])[];

/** A room measured for flooring (feet). */
export type BoqRoom = { name: string; lengthFeet: number; widthFeet: number };
/** Independent kitchens in one floor. Deleting one only removes its own quantities. */
export type KitchenMeasure = {
  id: string;
  name: string;
  platformFeet: number;
  platformDepthFeet: number;
  wallTileFeet: number;
  wallTileHeightFeet: number;
};
/** Sizes entered per floor for tiles and the kitchen platform. */
export type FloorFinishes = {
  rooms: BoqRoom[];
  /** Typical bathroom on this floor (0 = company default). */
  bathroomLengthFeet: number;
  bathroomWidthFeet: number;
  /**
   * Each bathroom's size as drawn, e.g. "7'0x6'9, 4'6x6'0" (L × W ft). When
   * given, tiles and waterproofing are measured bathroom by bathroom.
   */
  bathroomSizes?: string;
  /** Kitchen platform running length per kitchen (0 = default). */
  kitchenPlatformFeet: number;
  /** Present means exact kitchen units; an empty list means this floor has none. */
  kitchenMeasurements?: KitchenMeasure[];
  /** Use no floor tiles instead of the previous built-up area estimate. */
  excludeRoomFlooring?: boolean;
  /** Optional exact granite quantity, 0 means no staircase granite on this floor. */
  staircaseGraniteSqft?: number;
  /** Staircase / balcony handrail length entered from the drawing (running ft). */
  railingFeet?: number;
  /** One or two coats, measured against the same net wall-face area. */
  internalPlasterCoats?: 1 | 2;
  externalPlasterCoats?: 1 | 2;
  /** Floor-specific cutting/breakage allowance for tiles and granite. */
  tileWastagePercent?: number;
};

export type BoqCounts = {
  /** Keyed by floor name, e.g. "Ground Floor". */
  floors: Record<string, FloorCounts>;
  entranceGates: number;
  /** Compound wall running length in feet (0 = none). */
  compoundWallFeet: number;
  /**
   * Window sizes per floor as written on the plan, e.g. "2×4×4, 2×4×6"
   * (nos × width × height in ft). When given, the window area is measured
   * from them instead of the typical window size.
   */
  windowSizes?: Record<string, string>;
  /** Door and ventilator openings: "2×3×7" = two at 3 ft × 7 ft. */
  doorSizes?: Record<
    string,
    Partial<
      Record<
        | 'mainDoors'
        | 'internalDoors'
        | 'bathroomDoors'
        | 'poojaDoors'
        | 'ventilators'
        | 'rollingShutters',
        string
      >
    >
  >;
  /** Measured wall segments per floor; absence preserves quotation estimates. */
  walls?: Record<string, WallMeasure[]>;
  /** Rooms, bathroom size and kitchen platform per floor, when entered. */
  finishes?: Record<string, FloorFinishes>;
};

/**
 * A length as written on a drawing, in feet: `11.25`, `11`, `11'3"`, `11'3`,
 * `11' 3"`, `11'-3"`, `11-3`, `11ft 3in`, `3"` (inches only). Returns null
 * when the text is not a length, so a mistyped size is never read as 113 ft.
 */
export function parseFeet(text: unknown): number | null {
  const raw = String(text ?? '')
    .trim()
    .replace(/[′’‘`]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const match =
    /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/.exec(
      raw,
    ) ??
    /^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/.exec(raw) ??
    /^()(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/.exec(raw);
  if (!match) return null;
  const feet = match[1] ? Number(match[1]) : 0;
  const inches = match[2] ? Number(match[2]) : 0;
  if (inches >= 12 && match[1]) return null;
  return Math.round((feet + inches / 12) * 10000) / 10000;
}

/** Splits "2×4'6"×4" (or x / * / X) into its parts, keeping feet-inches. */
const sizeParts = (part: string) =>
  part
    .replace(/(\d)\s*(?:nos?\.?)\s*/gi, '$1 ')
    .split(/\s*[×xX*]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * "7'0x6'9, 4'6x6'0, 2×6x5" → one L × W (ft) per item; a leading count
 * repeats the size (2×6x5 = two 6 × 5 ft). Items that are not sizes are
 * skipped.
 */
export function parseSizes(
  text: string | undefined,
): { lengthFeet: number; widthFeet: number }[] {
  const sizes: { lengthFeet: number; widthFeet: number }[] = [];
  for (const part of String(text ?? '').split(/[,;+\n]/)) {
    const items = sizeParts(part);
    if (items.length < 2 || items.length > 3) continue;
    const count = items.length === 3 ? Number(items[0]) : 1;
    const lengthFeet = parseFeet(items[items.length - 2]);
    const widthFeet = parseFeet(items[items.length - 1]);
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 50 ||
      !lengthFeet ||
      !widthFeet ||
      lengthFeet > 100 ||
      widthFeet > 100
    )
      continue;
    for (let i = 0; i < count && sizes.length < 50; i++)
      sizes.push({ lengthFeet, widthFeet });
  }
  return sizes;
}

/** "2×4×4, 2×4'6"×6" / "2*4*6" → openings (nos, width ft, height ft). */
export function parseOpenings(
  text: string | undefined,
): { count: number; widthFeet: number; heightFeet: number }[] {
  return String(text ?? '')
    .split(/[,;+\n]/)
    .map(sizeParts)
    .filter((items) => items.length === 3 && /^\d+$/.test(items[0]!))
    .map((items) => ({
      count: Number(items[0]),
      widthFeet: parseFeet(items[1]) ?? 0,
      heightFeet: parseFeet(items[2]) ?? 0,
    }))
    .filter(
      (opening) =>
        opening.count > 0 &&
        opening.count <= 200 &&
        opening.widthFeet > 0 &&
        opening.widthFeet <= 40 &&
        opening.heightFeet > 0 &&
        opening.heightFeet <= 40,
    );
}

type FieldDef = {
  key: string;
  label: string;
  group: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  help?: string;
};

/** Every structural assumption is a visible, editable company setting. */
export const STRUCTURAL_FIELDS = [
  // Steel cutting
  {
    key: 'stockBarFeet',
    label: 'Stock bar length (ft)',
    group: 'Steel cutting',
    value: 40,
    min: 20,
    max: 60,
    help: '12 m TMT bars are about 40 ft.',
  },
  {
    key: 'foundationCuts',
    label: 'Foundation lift: pieces per bar',
    group: 'Steel cutting',
    value: 2,
    min: 1,
    max: 6,
    step: 1,
    help: 'Usual practice: one 40 ft bar cut into 2 for the foundation lift.',
  },
  {
    key: 'floorCuts',
    label: 'Upper floor lift: pieces per bar',
    group: 'Steel cutting',
    value: 3,
    min: 1,
    max: 6,
    step: 1,
    help: 'Usual practice: one 40 ft bar cut into 3 per floor above ground.',
  },
  {
    key: 'lapDiameters',
    label: 'Lap length (× bar diameter)',
    group: 'Steel cutting',
    value: 50,
    min: 20,
    max: 80,
    step: 1,
    help: 'Column laps at every floor. 50d is a common site value.',
  },
  {
    key: 'topStarters',
    label: 'Leave starters above top floor (1 = yes)',
    group: 'Steel cutting',
    value: 1,
    min: 0,
    max: 1,
    step: 1,
  },
  {
    key: 'coverMm',
    label: 'Concrete cover (mm)',
    group: 'Steel cutting',
    value: 40,
    min: 15,
    max: 75,
    step: 1,
  },
  {
    key: 'coverFootingMm',
    label: 'Footing cover (mm)',
    group: 'Steel cutting',
    value: 0,
    min: 0,
    max: 75,
    step: 1,
    help: '0 = same as the concrete cover.',
  },
  {
    key: 'coverColumnMm',
    label: 'Column cover (mm)',
    group: 'Steel cutting',
    value: 0,
    min: 0,
    max: 75,
    step: 1,
    help: '0 = same as the concrete cover.',
  },
  {
    key: 'coverBeamMm',
    label: 'Beam cover (mm)',
    group: 'Steel cutting',
    value: 0,
    min: 0,
    max: 75,
    step: 1,
    help: '0 = same as the concrete cover.',
  },
  {
    key: 'coverSlabMm',
    label: 'Slab cover (mm)',
    group: 'Steel cutting',
    value: 0,
    min: 0,
    max: 75,
    step: 1,
    help: '0 = same as the concrete cover.',
  },
  // Foundation
  {
    key: 'foundationDepthFeet',
    label: 'Foundation depth below ground (ft)',
    group: 'Foundation',
    value: 5,
    min: 2,
    max: 15,
  },
  {
    key: 'plinthHeightFeet',
    label: 'Plinth height above ground (ft)',
    group: 'Foundation',
    value: 2,
    min: 0,
    max: 6,
  },
  {
    key: 'footingLengthFeet',
    label: 'Footing length (ft)',
    group: 'Foundation',
    value: 4,
    min: 2,
    max: 12,
  },
  {
    key: 'footingWidthFeet',
    label: 'Footing width (ft)',
    group: 'Foundation',
    value: 4,
    min: 2,
    max: 12,
  },
  {
    key: 'footingThicknessIn',
    label: 'Footing thickness (in)',
    group: 'Foundation',
    value: 12,
    min: 6,
    max: 36,
    step: 1,
  },
  {
    key: 'footingBarDia',
    label: 'Footing mesh bar (mm)',
    group: 'Foundation',
    value: 12,
    min: 8,
    max: 25,
    step: 1,
  },
  {
    key: 'footingBarSpacingIn',
    label: 'Footing mesh spacing (in)',
    group: 'Foundation',
    value: 6,
    min: 3,
    max: 12,
  },
  {
    key: 'pccThicknessIn',
    label: 'PCC bed under footing (in)',
    group: 'Foundation',
    value: 3,
    min: 0,
    max: 8,
  },
  {
    key: 'pccCementBagsPerM3',
    label: 'PCC: cement bags per m³',
    group: 'Foundation',
    value: 3.4,
    min: 0,
    max: 20,
    step: 0.1,
    help: 'Site-mixed PCC estimate. Adjust to the specified PCC mix, not ready-mix pricing.',
  },
  {
    key: 'pccSandM3PerM3',
    label: 'PCC: sand m³ per m³',
    group: 'Foundation',
    value: 0.47,
    min: 0,
    max: 3,
    step: 0.01,
  },
  {
    key: 'pccAggregateM3PerM3',
    label: 'PCC: aggregate m³ per m³',
    group: 'Foundation',
    value: 0.94,
    min: 0,
    max: 3,
    step: 0.01,
  },
  {
    key: 'plinthBeam',
    label: 'Plinth beams (1 = yes)',
    group: 'Foundation',
    value: 1,
    min: 0,
    max: 1,
    step: 1,
  },
  {
    key: 'plinthBeamWidthIn',
    label: 'Plinth beam width (in)',
    group: 'Foundation',
    value: 9,
    min: 6,
    max: 24,
  },
  {
    key: 'plinthBeamDepthIn',
    label: 'Plinth beam depth (in)',
    group: 'Foundation',
    value: 12,
    min: 9,
    max: 36,
  },
  {
    key: 'plinthBeamBarDia',
    label: 'Plinth beam bar (mm)',
    group: 'Foundation',
    value: 12,
    min: 8,
    max: 25,
    step: 1,
  },
  {
    key: 'plinthBeamBarCount',
    label: 'Plinth beam bars',
    group: 'Foundation',
    value: 6,
    min: 2,
    max: 12,
    step: 1,
  },
  {
    key: 'plinthBeamStirrupDia',
    label: 'Plinth beam stirrup (mm)',
    group: 'Foundation',
    value: 0,
    min: 0,
    max: 12,
    step: 1,
    help: '0 = same as the beam stirrups.',
  },
  {
    key: 'plinthBeamStirrupSpacingIn',
    label: 'Plinth beam stirrup spacing (in)',
    group: 'Foundation',
    value: 0,
    min: 0,
    max: 12,
    help: '0 = same as the beam stirrups.',
  },
  {
    key: 'pedestalHeightFeet',
    label: 'Pedestal height (ft, 0 = none)',
    group: 'Foundation',
    value: 0,
    min: 0,
    max: 8,
    help: 'A wider column block between footing and column, when the design has one.',
  },
  {
    key: 'pedestalWidthIn',
    label: 'Pedestal width (in)',
    group: 'Foundation',
    value: 15,
    min: 9,
    max: 48,
  },
  {
    key: 'pedestalDepthIn',
    label: 'Pedestal depth (in)',
    group: 'Foundation',
    value: 15,
    min: 9,
    max: 48,
  },
  // Columns
  {
    key: 'columnSpacingFeet',
    label: 'Column grid spacing (ft)',
    group: 'Columns',
    value: 12,
    min: 6,
    max: 25,
    help: 'Column count is estimated from each floor footprint on this grid.',
  },
  {
    key: 'columnRows',
    label: 'Column rows along the length (0 = from grid)',
    group: 'Columns',
    value: 0,
    min: 0,
    max: 30,
    step: 1,
    help: 'From the structural drawing, e.g. 6 rows of 2 = 12 columns.',
  },
  {
    key: 'columnsPerRow',
    label: 'Columns per row across the width (0 = from grid)',
    group: 'Columns',
    value: 0,
    min: 0,
    max: 10,
    step: 1,
  },
  {
    key: 'extraColumns',
    label: 'Extra columns (lift / stair)',
    group: 'Columns',
    value: 0,
    min: 0,
    max: 20,
    step: 1,
  },
  {
    key: 'columnWidthIn',
    label: 'Column width (in)',
    group: 'Columns',
    value: 9,
    min: 6,
    max: 30,
  },
  {
    key: 'columnDepthIn',
    label: 'Column depth (in)',
    group: 'Columns',
    value: 12,
    min: 6,
    max: 36,
  },
  {
    key: 'columnBar1Dia',
    label: 'Column main bar A (mm)',
    group: 'Columns',
    value: 16,
    min: 0,
    max: 32,
    step: 1,
  },
  {
    key: 'columnBar1Count',
    label: 'Bar A per column',
    group: 'Columns',
    value: 4,
    min: 0,
    max: 16,
    step: 1,
  },
  {
    key: 'columnBar2Dia',
    label: 'Column main bar B (mm)',
    group: 'Columns',
    value: 12,
    min: 0,
    max: 32,
    step: 1,
  },
  {
    key: 'columnBar2Count',
    label: 'Bar B per column',
    group: 'Columns',
    value: 2,
    min: 0,
    max: 16,
    step: 1,
  },
  {
    key: 'columnTieDia',
    label: 'Column ring (mm)',
    group: 'Columns',
    value: 8,
    min: 6,
    max: 12,
    step: 1,
  },
  {
    key: 'columnTieSpacingIn',
    label: 'Ring spacing (in)',
    group: 'Columns',
    value: 6,
    min: 3,
    max: 12,
  },
  // Beams
  {
    key: 'beamWidthIn',
    label: 'Beam width (in)',
    group: 'Beams',
    value: 9,
    min: 6,
    max: 24,
  },
  {
    key: 'beamDepthIn',
    label: 'Beam depth incl. slab (in)',
    group: 'Beams',
    value: 15,
    min: 9,
    max: 36,
  },
  {
    key: 'beamTopDia',
    label: 'Beam top bar (mm)',
    group: 'Beams',
    value: 12,
    min: 0,
    max: 32,
    step: 1,
  },
  {
    key: 'beamTopCount',
    label: 'Top bars per beam',
    group: 'Beams',
    value: 2,
    min: 0,
    max: 8,
    step: 1,
  },
  {
    key: 'beamBottomDia',
    label: 'Beam bottom bar (mm)',
    group: 'Beams',
    value: 12,
    min: 0,
    max: 32,
    step: 1,
  },
  {
    key: 'beamBottomCount',
    label: 'Bottom bars per beam',
    group: 'Beams',
    value: 3,
    min: 0,
    max: 8,
    step: 1,
  },
  {
    key: 'beamExtraDia',
    label: 'Beam extra / side bar (mm)',
    group: 'Beams',
    value: 12,
    min: 0,
    max: 32,
    step: 1,
  },
  {
    key: 'beamExtraCount',
    label: 'Extra / side bars per beam',
    group: 'Beams',
    value: 2,
    min: 0,
    max: 8,
    step: 1,
  },
  {
    key: 'extraBeamFeet',
    label: 'Extra beam run per floor (ft, lift / stair)',
    group: 'Beams',
    value: 0,
    min: 0,
    max: 500,
    step: 1,
  },
  {
    key: 'beamStirrupDia',
    label: 'Stirrup (mm)',
    group: 'Beams',
    value: 8,
    min: 6,
    max: 12,
    step: 1,
  },
  {
    key: 'beamStirrupSpacingIn',
    label: 'Stirrup spacing (in)',
    group: 'Beams',
    value: 6,
    min: 3,
    max: 12,
  },
  // Slab
  {
    key: 'slabThicknessIn',
    label: 'Slab thickness (in)',
    group: 'Slab',
    value: 5,
    min: 3,
    max: 10,
  },
  {
    key: 'slabMainDia',
    label: 'Slab main bar (mm)',
    group: 'Slab',
    value: 10,
    min: 6,
    max: 16,
    step: 1,
  },
  {
    key: 'slabMainSpacingIn',
    label: 'Main bar spacing (in)',
    group: 'Slab',
    value: 6,
    min: 3,
    max: 12,
  },
  {
    key: 'slabDistDia',
    label: 'Slab distribution bar (mm)',
    group: 'Slab',
    value: 8,
    min: 6,
    max: 16,
    step: 1,
  },
  {
    key: 'slabDistSpacingIn',
    label: 'Distribution spacing (in)',
    group: 'Slab',
    value: 8,
    min: 3,
    max: 12,
  },
  {
    key: 'slabExtraTopPercent',
    label: 'Extra top bars at supports (%)',
    group: 'Slab',
    value: 15,
    min: 0,
    max: 60,
    step: 1,
  },
  {
    key: 'stairsPerFloor',
    label: 'Staircases per floor (0 = none)',
    group: 'Staircase',
    value: 1,
    min: 0,
    max: 4,
    step: 1,
  },
  {
    key: 'stairWidthFeet',
    label: 'Stair width (ft)',
    group: 'Staircase',
    value: 3.5,
    min: 2.5,
    max: 8,
  },
  {
    key: 'stairLandingFeet',
    label: 'Landing length (ft)',
    group: 'Staircase',
    value: 7,
    min: 3,
    max: 15,
  },
  {
    key: 'stairRiserIn',
    label: 'Riser (in)',
    group: 'Staircase',
    value: 6,
    min: 4,
    max: 8,
  },
  {
    key: 'stairTreadIn',
    label: 'Tread (in)',
    group: 'Staircase',
    value: 10,
    min: 8,
    max: 14,
  },
  {
    key: 'stairWaistIn',
    label: 'Waist slab (in)',
    group: 'Staircase',
    value: 6,
    min: 4,
    max: 9,
  },
  {
    key: 'stairMainDia',
    label: 'Stair main bar (mm)',
    group: 'Staircase',
    value: 10,
    min: 8,
    max: 16,
    step: 1,
  },
  {
    key: 'stairDistDia',
    label: 'Stair distribution bar (mm)',
    group: 'Staircase',
    value: 8,
    min: 6,
    max: 12,
    step: 1,
  },
  {
    key: 'stairBarSpacingIn',
    label: 'Stair bar spacing (in)',
    group: 'Staircase',
    value: 6,
    min: 3,
    max: 12,
  },
  // Masonry & plaster
  {
    key: 'externalWallIn',
    label: 'External wall (in)',
    group: 'Masonry & plaster',
    value: 9,
    min: 4,
    max: 14,
  },
  {
    key: 'internalWallIn',
    label: 'Internal wall (in)',
    group: 'Masonry & plaster',
    value: 4.5,
    min: 3,
    max: 9,
  },
  {
    key: 'internalWallRatio',
    label: 'Internal wall length ÷ external',
    group: 'Masonry & plaster',
    value: 1,
    min: 0,
    max: 3,
    step: 0.05,
  },
  {
    key: 'openingsPercent',
    label: 'Door/window openings (%)',
    group: 'Masonry & plaster',
    value: 15,
    min: 0,
    max: 50,
    step: 1,
  },
  {
    key: 'bricksPerCubicMetre',
    label: 'Bricks per m³ of wall',
    group: 'Masonry & plaster',
    value: 500,
    min: 100,
    max: 700,
    step: 1,
    help: 'About 500 for standard red bricks incl. mortar joints.',
  },
  {
    key: 'materialWastagePercent',
    label: 'Cement, sand & brick wastage (%)',
    group: 'Masonry & plaster',
    value: 3,
    min: 0,
    max: 15,
    step: 0.5,
  },
  {
    key: 'masonryBricksPer100Sqft4',
    label: '4.5 in brick wall: bricks per 100 net sq ft',
    group: 'Masonry & plaster',
    value: 500,
    min: 0,
    max: 4000,
    step: 1,
    help: 'Editable thumb-rule estimate; replace with your actual brick size and mortar-joint count.',
  },
  {
    key: 'masonryBricksPer100Sqft9',
    label: '9 in brick wall: bricks per 100 net sq ft',
    group: 'Masonry & plaster',
    value: 1000,
    min: 0,
    max: 6000,
    step: 1,
  },
  {
    key: 'masonryCementBagsPer100Sqft4',
    label: '4.5 in brick wall: cement bags per 100 net sq ft',
    group: 'Masonry & plaster',
    value: 3,
    min: 0,
    max: 60,
    step: 0.5,
  },
  {
    key: 'masonryCementBagsPer100Sqft9',
    label: '9 in brick wall: cement bags per 100 net sq ft',
    group: 'Masonry & plaster',
    value: 6,
    min: 0,
    max: 100,
    step: 0.5,
    help: '6 bags per 100 sq ft is an editable illustration, not a structural or mix-design standard.',
  },
  {
    key: 'masonrySandM3Per100Sqft4',
    label: '4.5 in brick wall: sand m³ per 100 net sq ft',
    group: 'Masonry & plaster',
    value: 0.1,
    min: 0,
    max: 4,
    step: 0.01,
  },
  {
    key: 'masonrySandM3Per100Sqft9',
    label: '9 in brick wall: sand m³ per 100 net sq ft',
    group: 'Masonry & plaster',
    value: 0.2,
    min: 0,
    max: 8,
    step: 0.01,
  },
  {
    key: 'parkingWallPercent',
    label: 'Parking floor walls (% of a normal floor)',
    group: 'Masonry & plaster',
    value: 30,
    min: 0,
    max: 100,
    step: 1,
    help: 'Parking / stilt floors have few walls.',
  },
  // Quantities for allowances
  {
    key: 'tileCoveragePercent',
    label: 'Floor tiles: % of built-up area',
    group: 'Allowances',
    value: 85,
    min: 0,
    max: 120,
    step: 1,
  },
  {
    key: 'sqftPerInternalDoor',
    label: 'Built-up sq ft per bedroom / internal door',
    group: 'Allowances',
    value: 200,
    min: 50,
    max: 600,
    step: 1,
    help: 'Default count only; edit the counts per floor on the BOQ.',
  },
  {
    key: 'sqftPerBathroom',
    label: 'Built-up sq ft per bathroom',
    group: 'Allowances',
    value: 500,
    min: 100,
    max: 2000,
    step: 1,
    help: 'Default count only; edit the counts per floor on the BOQ.',
  },
  {
    key: 'sqftPerWindow',
    label: 'Built-up sq ft per window',
    group: 'Allowances',
    value: 120,
    min: 30,
    max: 600,
    step: 1,
    help: 'Default count only; edit the counts per floor on the BOQ.',
  },
  {
    key: 'windowSqft',
    label: 'Average window size (sq ft)',
    group: 'Finishes & services',
    value: 16,
    min: 4,
    max: 60,
  },
  {
    key: 'floorTileLengthIn',
    label: 'Room floor tile length (in)',
    group: 'Tiles',
    value: 24,
    min: 4,
    max: 96,
    step: 1,
  },
  {
    key: 'floorTileWidthIn',
    label: 'Room floor tile width (in)',
    group: 'Tiles',
    value: 24,
    min: 4,
    max: 96,
    step: 1,
  },
  {
    key: 'floorTilesPerBox',
    label: 'Room floor tiles per box',
    group: 'Tiles',
    value: 4,
    min: 1,
    max: 50,
    step: 1,
  },
  {
    key: 'skirtingHeightIn',
    label: 'Skirting height (in)',
    group: 'Tiles',
    value: 4,
    min: 0,
    max: 12,
    step: 1,
    help: 'Room perimeter × this height, cut from the floor tiles.',
  },
  {
    key: 'bathFloorTileIn',
    label: 'Bathroom floor tile size (in, square)',
    group: 'Tiles',
    value: 12,
    min: 4,
    max: 48,
    step: 1,
  },
  {
    key: 'bathFloorTilesPerBox',
    label: 'Bathroom floor tiles per box',
    group: 'Tiles',
    value: 10,
    min: 1,
    max: 50,
    step: 1,
  },
  {
    key: 'wallTileLengthIn',
    label: 'Wall tile length (in)',
    group: 'Tiles',
    value: 18,
    min: 4,
    max: 48,
    step: 1,
  },
  {
    key: 'wallTileWidthIn',
    label: 'Wall tile width (in)',
    group: 'Tiles',
    value: 12,
    min: 4,
    max: 48,
    step: 1,
  },
  {
    key: 'wallTilesPerBox',
    label: 'Wall tiles per box',
    group: 'Tiles',
    value: 6,
    min: 1,
    max: 50,
    step: 1,
  },
  {
    key: 'wallTileHeightFeet',
    label: 'Bathroom wall tiles up to (ft)',
    group: 'Tiles',
    value: 7,
    min: 0,
    max: 12,
    step: 0.5,
    help: 'Door level is about 7 ft.',
  },
  {
    key: 'bathroomLengthFeet',
    label: 'Typical bathroom length (ft)',
    group: 'Tiles',
    value: 7,
    min: 3,
    max: 20,
    step: 0.5,
    help: 'Used when a floor has no bathroom size entered.',
  },
  {
    key: 'bathroomWidthFeet',
    label: 'Typical bathroom width (ft)',
    group: 'Tiles',
    value: 5,
    min: 3,
    max: 20,
    step: 0.5,
  },
  {
    key: 'kitchenPlatformFeet',
    label: 'Kitchen platform length per kitchen (ft)',
    group: 'Tiles',
    value: 10,
    min: 0,
    max: 40,
    step: 0.5,
  },
  {
    key: 'kitchenPlatformDepthFeet',
    label: 'Kitchen platform depth (ft)',
    group: 'Tiles',
    value: 2,
    min: 1,
    max: 4,
    step: 0.25,
  },
  {
    key: 'kitchenWallTileHeightFeet',
    label: 'Kitchen wall tiles above platform (ft)',
    group: 'Tiles',
    value: 2,
    min: 0,
    max: 8,
    step: 0.5,
  },
  {
    key: 'parkingTileIn',
    label: 'Parking tile size (in, square)',
    group: 'Tiles',
    value: 12,
    min: 4,
    max: 48,
    step: 1,
  },
  {
    key: 'parkingTilesPerBox',
    label: 'Parking tiles per box',
    group: 'Tiles',
    value: 10,
    min: 1,
    max: 50,
    step: 1,
  },
  {
    key: 'tileWastagePercent',
    label: 'Tile wastage %',
    group: 'Tiles',
    value: 5,
    min: 0,
    max: 20,
    step: 1,
  },
  {
    key: 'wireMetresPerPoint',
    label: 'Wire per light / fan / socket point (m)',
    group: 'Electrical',
    value: 15,
    min: 5,
    max: 60,
    step: 1,
    help: 'Route length × phase, neutral and earth.',
  },
  {
    key: 'powerWireMetresPerPoint',
    label: 'Wire per 16 A power point (m)',
    group: 'Electrical',
    value: 20,
    min: 5,
    max: 80,
    step: 1,
  },
  {
    key: 'conduitMetresPerPoint',
    label: 'Conduit per point (m)',
    group: 'Electrical',
    value: 5,
    min: 1,
    max: 20,
    step: 1,
  },
  {
    key: 'pointsPerSwitchBoard',
    label: 'Points per switch board',
    group: 'Electrical',
    value: 3,
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: 'pointsPerCircuit',
    label: 'Light / fan points per MCB circuit',
    group: 'Electrical',
    value: 8,
    min: 2,
    max: 16,
    step: 1,
  },
  {
    key: 'waterPointsPerBathroom',
    label: 'Water points per bathroom',
    group: 'Plumbing',
    value: 6,
    min: 1,
    max: 15,
    step: 1,
    help: 'Basin, shower, mixer, WC, health faucet, geyser.',
  },
  {
    key: 'waterPointsPerKitchen',
    label: 'Water points per kitchen',
    group: 'Plumbing',
    value: 2,
    min: 0,
    max: 10,
    step: 1,
  },
  {
    key: 'cpvcMetresPerPoint',
    label: 'CPVC ½ in pipe per water point (m)',
    group: 'Plumbing',
    value: 3,
    min: 1,
    max: 10,
    step: 1,
  },
  {
    key: 'bathroomsPerStack',
    label: 'Bathrooms per soil stack',
    group: 'Plumbing',
    value: 2,
    min: 1,
    max: 6,
    step: 1,
  },
  {
    key: 'labourItemized',
    label: 'Labour: one contract rate (0) or itemized (1)',
    group: 'Finishes & services',
    value: 0,
    min: 0,
    max: 1,
    step: 1,
    help: 'Contract: one structural labour rate per sq ft built-up (shuttering, concreting, brickwork, plastering). Itemized: each trade priced separately.',
  },
  {
    key: 'readyMixConcrete',
    label: 'RCC concrete: ready-mix M20 (1) or site mix (0)',
    group: 'Finishes & services',
    value: 1,
    min: 0,
    max: 1,
    step: 1,
    help: 'Ready-mix: footings, columns, beams, slabs and stairs priced per m³ of M20. Site mix: cement, sand and aggregate.',
  },
  {
    key: 'bathroomWaterproofSqft',
    label: 'Bathroom waterproofing per bathroom (sq ft)',
    group: 'Finishes & services',
    value: 60,
    min: 0,
    max: 300,
    step: 1,
    help: 'Floor plus about 1 ft up the walls.',
  },
  {
    key: 'parapetHeightFeet',
    label: 'Parapet wall height (ft, 0 = none)',
    group: 'External works',
    value: 3,
    min: 0,
    max: 6,
  },
  {
    key: 'parapetWallIn',
    label: 'Parapet wall thickness (in)',
    group: 'External works',
    value: 4.5,
    min: 3,
    max: 9,
  },
  {
    key: 'compoundWallHeightFeet',
    label: 'Compound wall height (ft)',
    group: 'External works',
    value: 5,
    min: 2,
    max: 10,
  },
  {
    key: 'compoundWallIn',
    label: 'Compound wall thickness (in)',
    group: 'External works',
    value: 9,
    min: 4,
    max: 14,
  },
  {
    key: 'sumpLitres',
    label: 'Underground sump (litres, 0 = none)',
    group: 'External works',
    value: 6500,
    min: 0,
    max: 100000,
    step: 100,
  },
  {
    key: 'overheadTankLitres',
    label: 'Overhead tank (litres, 0 = none)',
    group: 'External works',
    value: 4000,
    min: 0,
    max: 20000,
    step: 100,
  },
  {
    key: 'sandTonPerCum',
    label: 'Sand: tonnes per m³',
    group: 'Purchase units',
    value: 1.6,
    min: 1,
    max: 2.2,
    step: 0.05,
    help: 'Loose sand is about 1.5–1.6 t/m³; check your supplier.',
  },
  {
    key: 'aggregateTonPerCum',
    label: 'Aggregate: tonnes per m³',
    group: 'Purchase units',
    value: 1.5,
    min: 1,
    max: 2.2,
    step: 0.05,
    help: 'Loose 20/40 mm aggregate is about 1.4–1.6 t/m³.',
  },
  {
    key: 'defaultFloorHeightFeet',
    label: 'Floor height when quote has none (ft)',
    group: 'Allowances',
    value: 10,
    min: 7,
    max: 20,
  },
] as const satisfies readonly FieldDef[];

export type StructuralKey = (typeof STRUCTURAL_FIELDS)[number]['key'];
export type StructuralSettings = Record<StructuralKey, number>;

export const DEFAULT_STRUCTURAL_SETTINGS: StructuralSettings =
  Object.fromEntries(
    STRUCTURAL_FIELDS.map((field) => [field.key, field.value]),
  ) as StructuralSettings;

/** Fill missing or invalid settings with defaults and clamp to safe ranges. */
export function normalizeStructuralSettings(raw: unknown): StructuralSettings {
  const source =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const result = { ...DEFAULT_STRUCTURAL_SETTINGS };
  for (const field of STRUCTURAL_FIELDS) {
    const value = Number(source[field.key]);
    if (source[field.key] === '' || !Number.isFinite(value)) continue;
    const clamped = Math.min(field.max, Math.max(field.min, value));
    result[field.key] =
      'step' in field && field.step === 1 ? Math.round(clamped) : clamped;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Units and helpers

const M_PER_FT = 0.3048;
const FT_PER_MM = 1 / 304.8;
const CUM_PER_CFT = 0.0283168;
export const steelKgPerMetre = (diameterMm: number) =>
  (diameterMm * diameterMm) / 162;
const round = (value: number, places = 2) =>
  Number(Math.max(0, value).toFixed(places));
const ceil = (value: number) => Math.ceil(Math.max(0, value) - 1e-9);
const ft = (value: number) => `${round(value, 2)} ft`;

/** Lap length in feet for a bar diameter. */
export const lapFeet = (diameterMm: number, lapDiameters: number) =>
  diameterMm * lapDiameters * FT_PER_MM;

export type CutPlan = {
  /** Length of each cut piece actually taken from the bar, in feet. */
  pieceFeet: number;
  /** Length the work needs (height + lap etc.), in feet. */
  requiredFeet: number;
  piecesPerBar: number;
  bars: number;
  offcutFeetPerBar: number;
  /** True when the company's usual cut was too short and was reduced. */
  adjusted: boolean;
};

/**
 * Cut `pieces` pieces of `requiredFeet` from stock bars.
 *
 * `preferredCuts` is the company practice (e.g. 2 for foundation, 3 per
 * floor). It is used whenever the resulting piece is long enough; otherwise
 * the piece count per bar is reduced so every piece still has its full lap.
 * Pieces longer than one stock bar are spliced with laps.
 */
export function cutPlan(
  requiredFeet: number,
  pieces: number,
  stockFeet: number,
  lapFt: number,
  preferredCuts = 0,
): CutPlan {
  const count = Math.max(0, Math.round(pieces));
  const required = Math.max(0.01, requiredFeet);
  if (required > stockFeet) {
    // Spliced run: every extra bar overlaps the previous one by one lap.
    const usable = Math.max(stockFeet - lapFt, stockFeet / 2);
    const extraBars = ceil((required - stockFeet) / usable);
    const runFeet = required + extraBars * lapFt;
    const bars = ceil((count * runFeet) / stockFeet);
    return {
      pieceFeet: required,
      requiredFeet: required,
      piecesPerBar: 0,
      bars,
      offcutFeetPerBar: bars
        ? Math.max(0, (bars * stockFeet - count * runFeet) / bars)
        : 0,
      adjusted: false,
    };
  }
  const fit = Math.max(1, Math.floor(stockFeet / required + 1e-9));
  const useCompanyCut = preferredCuts >= 1 && preferredCuts <= fit;
  const piecesPerBar = useCompanyCut ? preferredCuts : fit;
  const pieceFeet = useCompanyCut ? stockFeet / preferredCuts : required;
  return {
    pieceFeet,
    requiredFeet: required,
    piecesPerBar,
    bars: ceil(count / piecesPerBar),
    offcutFeetPerBar: Math.max(0, stockFeet - piecesPerBar * pieceFeet),
    adjusted: preferredCuts >= 1 && !useCompanyCut,
  };
}

// ---------------------------------------------------------------------------
// Reading the quotation

const LEVEL_PREFIX = /^(.*?)(?:\s+—\s+(?:Parking|Penthouse))?$/;

/**
 * Floors from a saved floor-wise quotation. Parking / penthouse portions of
 * the same level are combined. A level split into portions uses an
 * equivalent square footprint.
 */
export function floorsFromQuote(
  details: SftEstimateDetails,
  defaultHeightFeet = DEFAULT_STRUCTURAL_SETTINGS.defaultFloorHeightFeet,
): BoqFloor[] {
  const levels = new Map<
    string,
    {
      area: number;
      parking: number;
      penthouse: number;
      rows: SftEstimateDetails['rows'];
      height: number;
    }
  >();
  for (const row of details.rows) {
    if ((row.kind ?? 'floor') !== 'floor') continue;
    const level = LEVEL_PREFIX.exec(row.name)?.[1]?.trim() || row.name;
    const entry = levels.get(level) ?? {
      area: 0,
      parking: 0,
      penthouse: 0,
      rows: [],
      height: 0,
    };
    entry.area += Number(row.areaSqft) || 0;
    if (/ — Parking$/.test(row.name))
      entry.parking += Number(row.areaSqft) || 0;
    if (/(?:\bPenthouse\b|— Penthouse$)/i.test(row.name))
      entry.penthouse += Number(row.areaSqft) || 0;
    entry.rows.push(row);
    const height = Number(row.heightFeet);
    if (Number.isFinite(height) && height > entry.height) entry.height = height;
    levels.set(level, entry);
  }
  return [...levels.entries()].map(([name, entry]) => {
    // One row: its own size. Several rows (e.g. parking + shop) along the
    // same frontage: the common width and the combined depth.
    const sizes = entry.rows.map((row) => ({
      length: Number(row.lengthFeet),
      width: Number(row.widthFeet),
    }));
    const realRectangle =
      sizes.length > 0 &&
      sizes.every((size) => size.length > 1 && size.width > 1);
    const width = realRectangle
      ? sizes.length === 1
        ? sizes[0]!.width
        : (sizes
            .flatMap((size) => [size.width, size.length])
            .find((side) =>
              sizes.every(
                (size) => size.width === side || size.length === side,
              ),
            ) ??
          Math.max(...sizes.map((size) => Math.min(size.length, size.width))))
      : 0;
    const length = realRectangle
      ? sizes.length === 1
        ? sizes[0]!.length
        : round(entry.area / Math.max(1, width))
      : 0;
    const side = Math.sqrt(Math.max(entry.area, 1));
    const heightAssumed = !(entry.height > 0);
    return {
      name,
      areaSqft: round(entry.area),
      lengthFeet: realRectangle ? length : round(side),
      widthFeet: realRectangle ? width : round(side),
      heightFeet: heightAssumed ? defaultHeightFeet : entry.height,
      ...(heightAssumed ? { heightAssumed: true } : {}),
      ...(entry.parking > 0 ? { parkingSqft: round(entry.parking) } : {}),
      ...(entry.penthouse > 0 ? { penthouseSqft: round(entry.penthouse) } : {}),
    };
  });
}

/** Area of a floor that is not parking / stilt. */
export const livingSqft = (floor: BoqFloor) =>
  Math.max(0, floor.areaSqft - (floor.parkingSqft ?? 0));

/** Default counts per floor from the quoted areas; every count is editable. */
export function estimateCounts(
  floors: readonly BoqFloor[],
  settings: StructuralSettings = DEFAULT_STRUCTURAL_SETTINGS,
  details?: SftEstimateDetails,
): BoqCounts {
  const perFloor: Record<string, FloorCounts> = {};
  floors.forEach((floor, index) => {
    const living = livingSqft(floor);
    const bathrooms =
      living > 0
        ? Math.max(1, Math.round(living / settings.sqftPerBathroom))
        : 0;
    const internalDoors =
      living > 0
        ? Math.max(1, Math.round(living / settings.sqftPerInternalDoor))
        : 0;
    const kitchens = living >= 400 ? Math.max(1, Math.round(living / 1200)) : 0;
    perFloor[floor.name] = {
      mainDoors: index === 0 || floor.parkingSqft ? (living > 0 ? 1 : 0) : 0,
      internalDoors,
      bathroomDoors: bathrooms,
      poojaDoors: index === 0 && living > 0 ? 1 : 0,
      windows:
        living > 0
          ? Math.max(2, Math.round(living / settings.sqftPerWindow))
          : 0,
      ventilators: bathrooms,
      bathrooms,
      kitchens,
      rollingShutters: 0,
      lightPoints:
        (living > 0 ? Math.ceil(living / 80) + bathrooms + kitchens : 0) +
        Math.ceil((floor.parkingSqft ?? 0) / 150),
      fanPoints: living > 0 ? internalDoors + kitchens + 1 : 0,
      socketPoints: living > 0 ? Math.ceil(living / 120) + internalDoors : 0,
      powerPoints: living > 0 ? bathrooms + kitchens * 2 + internalDoors : 0,
    };
  });
  // A quoted compound wall sets its length.
  const compound = quotedCompoundWall(details);
  return {
    floors: perFloor,
    entranceGates: floors.length ? 1 : 0,
    compoundWallFeet: compound ? Math.round(compound.lengthFeet) : 0,
  };
}

/** The quotation's compound / boundary wall row, if it has one. */
function compoundWallRow(details: SftEstimateDetails | undefined) {
  return details?.rows.find(
    (row) => row.kind === 'additional' && /compound|boundary/i.test(row.name),
  );
}

/**
 * Length and height of a quoted compound wall. Quoted in running ft, the
 * quantity is the length; quoted as wall area (length × height) or any
 * other unit, the length typed on the quote is used.
 */
export function quotedCompoundWall(
  details: SftEstimateDetails | undefined,
): { lengthFeet: number; heightFeet: number } | null {
  const row = compoundWallRow(details);
  if (!row) return null;
  const length = Number(row.lengthFeet) || 0;
  const height = Number(row.heightFeet) || 0;
  const quantity = Number(row.areaSqft) || 0;
  const unit = row.unit ?? 'sqft';
  const lengthFeet =
    unit === 'running_ft'
      ? quantity || length
      : length > 0
        ? length
        : unit === 'wall_sqft' && height > 0
          ? quantity / height
          : 0;
  return lengthFeet > 0 ? { lengthFeet, heightFeet: height } : null;
}

/** Merge edited counts over the estimates; anything missing or invalid falls back. */
export function normalizeCounts(raw: unknown, estimated: BoqCounts): BoqCounts {
  const source =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const floorsRaw =
    source.floors && typeof source.floors === 'object'
      ? (source.floors as Record<string, unknown>)
      : {};
  const floors: Record<string, FloorCounts> = {};
  for (const [name, defaults] of Object.entries(estimated.floors)) {
    const edited =
      floorsRaw[name] && typeof floorsRaw[name] === 'object'
        ? (floorsRaw[name] as Record<string, unknown>)
        : {};
    const row = Object.fromEntries(
      FLOOR_COUNT_FIELDS.map(([key]) => [
        key,
        validCount(edited[key], defaults[key]),
      ]),
    ) as FloorCounts;
    // Points not entered follow the rooms that were: one fan per bedroom,
    // kitchen and hall; sockets and AC points per bedroom; geyser per
    // bathroom; two power points per kitchen.
    const entered = (key: keyof FloorCounts) =>
      edited[key] !== undefined && edited[key] !== '';
    const doors = row.internalDoors - defaults.internalDoors;
    const wet =
      row.bathrooms - defaults.bathrooms + row.kitchens - defaults.kitchens;
    if (!entered('fanPoints') && defaults.fanPoints > 0)
      row.fanPoints = Math.max(0, row.internalDoors + row.kitchens + 1);
    if (!entered('lightPoints'))
      row.lightPoints = Math.max(0, defaults.lightPoints + wet);
    if (!entered('socketPoints'))
      row.socketPoints = Math.max(0, defaults.socketPoints + doors);
    if (!entered('powerPoints') && defaults.powerPoints > 0)
      row.powerPoints = Math.max(
        0,
        row.bathrooms + row.kitchens * 2 + row.internalDoors,
      );
    floors[name] = row;
  }
  const sizesRaw =
    source.windowSizes && typeof source.windowSizes === 'object'
      ? (source.windowSizes as Record<string, unknown>)
      : {};
  const windowSizes = Object.fromEntries(
    Object.keys(floors)
      .map((name) => [name, String(sizesRaw[name] ?? '').slice(0, 200)])
      .filter(([, text]) => Boolean(text?.trim())),
  );
  const finishesRaw =
    source.finishes && typeof source.finishes === 'object'
      ? (source.finishes as Record<string, unknown>)
      : {};
  const finishes: Record<string, FloorFinishes> = {};
  const feet = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 500
      ? Math.round(parsed * 100) / 100
      : 0;
  };
  for (const name of Object.keys(floors)) {
    const raw = finishesRaw[name];
    if (!raw || typeof raw !== 'object') continue;
    const value = raw as Record<string, unknown>;
    const rooms = (Array.isArray(value.rooms) ? value.rooms : [])
      .slice(0, 40)
      .map((room: Record<string, unknown>) => ({
        name: String(room?.name ?? '').slice(0, 60),
        lengthFeet: feet(room?.lengthFeet),
        widthFeet: feet(room?.widthFeet),
      }));
    const kitchenRows = Array.isArray(value.kitchenMeasurements)
      ? (value.kitchenMeasurements as Record<string, unknown>[])
          .slice(0, 30)
          .map((row, index): KitchenMeasure => ({
            id: String(row.id ?? 'kitchen-' + index).slice(0, 80),
            name: String(row.name ?? 'Kitchen ' + (index + 1)).slice(0, 80),
            platformFeet: feet(row.platformFeet),
            platformDepthFeet: feet(row.platformDepthFeet),
            wallTileFeet: feet(row.wallTileFeet),
            wallTileHeightFeet: feet(row.wallTileHeightFeet),
          }))
      : undefined;
    finishes[name] = {
      rooms,
      ...(kitchenRows ? { kitchenMeasurements: kitchenRows } : {}),
      ...(value.excludeRoomFlooring === true
        ? { excludeRoomFlooring: true }
        : {}),
      ...(value.staircaseGraniteSqft !== undefined
        ? {
            staircaseGraniteSqft: Math.max(
              0,
              num(value.staircaseGraniteSqft, 0, 0, 100000),
            ),
          }
        : {}),
      bathroomLengthFeet: feet(value.bathroomLengthFeet),
      bathroomWidthFeet: feet(value.bathroomWidthFeet),
      ...(String(value.bathroomSizes ?? '').trim()
        ? { bathroomSizes: String(value.bathroomSizes).slice(0, 300) }
        : {}),
      kitchenPlatformFeet: feet(value.kitchenPlatformFeet),
      railingFeet: feet(value.railingFeet),
      ...(value.internalPlasterCoats !== undefined
        ? {
            internalPlasterCoats:
              Number(value.internalPlasterCoats) === 2
                ? (2 as const)
                : (1 as const),
          }
        : {}),
      ...(value.externalPlasterCoats !== undefined
        ? {
            externalPlasterCoats:
              Number(value.externalPlasterCoats) === 2
                ? (2 as const)
                : (1 as const),
          }
        : {}),
      ...(value.tileWastagePercent !== undefined
        ? { tileWastagePercent: num(value.tileWastagePercent, 0, 0, 30) }
        : {}),
    };
  }
  const doorSizesRaw =
    source.doorSizes && typeof source.doorSizes === 'object'
      ? (source.doorSizes as Record<string, unknown>)
      : {};
  const doorSizeKeys = [
    'mainDoors',
    'internalDoors',
    'bathroomDoors',
    'poojaDoors',
    'ventilators',
    'rollingShutters',
  ] as const;
  const doorSizes: NonNullable<BoqCounts['doorSizes']> = {};
  for (const floor of Object.keys(floors)) {
    const values = doorSizesRaw[floor];
    if (!values || typeof values !== 'object') continue;
    const sizes = values as Record<string, unknown>;
    const entered = Object.fromEntries(
      doorSizeKeys
        .map((key) => [key, String(sizes[key] ?? '').slice(0, 200)] as const)
        .filter(([, value]) => Boolean(value.trim())),
    );
    if (Object.keys(entered).length) doorSizes[floor] = entered;
  }
  const wallRaw =
    source.walls && typeof source.walls === 'object'
      ? (source.walls as Record<string, unknown>)
      : {};
  const walls: NonNullable<BoqCounts['walls']> = {};
  for (const floor of Object.keys(floors)) {
    const rawWalls = Array.isArray(wallRaw[floor])
      ? (wallRaw[floor] as unknown[])
      : [];
    const parsed = rawWalls
      .slice(0, 50)
      .flatMap((input, index): WallMeasure[] => {
        if (!input || typeof input !== 'object') return [];
        const entry = input as Record<string, unknown>;
        const count = validCount(entry.count, 0, 200);
        const lengthFeet = feet(entry.lengthFeet);
        const heightFeet = feet(entry.heightFeet);
        const thicknessIn = num(entry.thicknessIn, 9, 3, 14);
        if (!(count > 0 && lengthFeet > 0 && heightFeet > 0)) return [];
        return [
          {
            id: String(entry.id ?? index).slice(0, 80),
            name: String(entry.name ?? 'Wall ' + (index + 1)).slice(0, 80),
            location: entry.location === 'internal' ? 'internal' : 'external',
            count,
            lengthFeet,
            heightFeet,
            thicknessIn,
          },
        ];
      });
    if (parsed.length) walls[floor] = parsed;
  }
  return {
    floors,
    ...(Object.keys(windowSizes).length ? { windowSizes } : {}),
    ...(Object.keys(doorSizes).length ? { doorSizes } : {}),
    ...(Object.keys(walls).length ? { walls } : {}),
    ...(Object.keys(finishes).length ? { finishes } : {}),
    entranceGates: validCount(source.entranceGates, estimated.entranceGates),
    compoundWallFeet: validCount(
      source.compoundWallFeet,
      estimated.compoundWallFeet,
      100000,
    ),
  };
}

// ---------------------------------------------------------------------------
// Structural design schedule (from the engineer's drawing)

/** Bars written as on the drawing: "6-16", "4-16+2-12", "4 × 20 + 2 × 16". */
export function parseBars(text: string): { dia: number; count: number }[] {
  return String(text ?? '')
    .split(/[+,]/)
    .map((part) => /(\d+)\s*(?:no\.?s?)?\s*[-×x*#]\s*(\d+)/i.exec(part.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({ count: Number(match[1]), dia: Number(match[2]) }))
    .filter(
      (bar) =>
        bar.count > 0 && bar.count <= 40 && bar.dia >= 6 && bar.dia <= 40,
    );
}

/** A column belongs to its own schedule. Legacy footing fields remain
 * readable to migrate older saved BOQs without changing their estimates. */

export type DesignColumnType = {
  label: string;
  count: number;
  /** Floors it rises through from the ground floor (0 = every floor). */
  floors: number;
  widthIn: number;
  depthIn: number;
  bars: string;
  tieDia: number;
  tieSpacingIn: number;
  footingLengthFeet: number;
  footingWidthFeet: number;
  footingThicknessIn: number;
  footingBarDia: number;
  footingBarSpacingIn: number;
};
/** One beam type of the drawing; running feet under each floor's roof. */
export type DesignBeamType = {
  label: string;
  widthIn: number;
  depthIn: number;
  /** Main bars, e.g. "4-20+2-16" (top + bottom + extra). */
  bars: string;
  stirrupDia: number;
  stirrupSpacingIn: number;
  /** Running feet per floor roof, in floor order. */
  runFeet: number[];
  /** Number of equal-length members on each floor; total runFeet remains authoritative. */
  countsByFloor?: number[];
};
/** Plinth beam type from the engineer's schedule (PB1, PB2, etc.). */
export type DesignPlinthBeamType = {
  label: string;
  /** Number of identical beam segments. */
  count: number;
  /** Length of each identical segment in running feet. */
  lengthFeet: number;
  widthIn: number;
  depthIn: number;
  /** Mixed main reinforcement e.g. "4-16+2-12+2-10". */
  bars: string;
  stirrupDia: number;
  stirrupSpacingIn: number;
};

/** An independent slab panel; selected floor's panel schedule replaces its grid slab. */
export type DesignSlabPanel = {
  label: string;
  floor: string;
  count: number;
  lengthFeet: number;
  widthFeet: number;
  thicknessIn: number;
  reinforcement: {
    layer: 'bottom' | 'top';
    direction: 'length' | 'width';
    dia: number;
    spacingIn: number;
  }[];
};

/** Separate staircase geometry/reinforcement for a particular floor. */
export type DesignStairType = {
  label: string;
  floor: string;
  count: number;
  widthFeet: number;
  riserIn: number;
  treadIn: number;
  waistIn: number;
  landingFeet: number;
  reinforcement: {
    role: 'main' | 'distribution';
    dia: number;
    spacingIn: number;
  }[];
};

export type StructuralDesign = {
  footings: DesignFootingType[];
  /** Older saved schedules carried footing geometry on C1/C2 rows. */
  legacyFootings?: boolean;
  columns: DesignColumnType[];
  beams: DesignBeamType[];
  /** Measured PB1/PB2 schedules, replacing the single legacy plinth run. */
  plinthBeams?: DesignPlinthBeamType[];
  /** Optional floor-wise slab panel schedules. Never added to the legacy grid slab. */
  slabPanels?: DesignSlabPanel[];
  /** Optional floor-wise staircase types. Never added to the legacy staircase. */
  staircases?: DesignStairType[];
  /** Legacy single plinth running feet; only used without plinthBeams. */
  plinthRunFeet: number;
  /** This drawing's slab, plinth beam, staircase and cover values. */
  settings?: Partial<Record<DesignSettingKey, number>>;
};

/** Structural rules a drawing can set for its own project. */
export const DESIGN_SETTING_KEYS = [
  'slabThicknessIn',
  'slabMainDia',
  'slabMainSpacingIn',
  'slabDistDia',
  'slabDistSpacingIn',
  'plinthBeamWidthIn',
  'plinthBeamDepthIn',
  'plinthBeamBarDia',
  'plinthBeamBarCount',
  'plinthBeamStirrupDia',
  'plinthBeamStirrupSpacingIn',
  'stairWaistIn',
  'stairWidthFeet',
  'stairRiserIn',
  'stairTreadIn',
  'stairLandingFeet',
  'stairMainDia',
  'stairDistDia',
  'stairBarSpacingIn',
  'coverMm',
  'coverFootingMm',
  'coverColumnMm',
  'coverBeamMm',
  'coverSlabMm',
  'plinthHeightFeet',
  'foundationDepthFeet',
] as const;
export type DesignSettingKey = (typeof DESIGN_SETTING_KEYS)[number];

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback;
};

/** Validated design schedule, or null when none is entered. */
export function normalizeDesign(raw: unknown): StructuralDesign | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const columns = (Array.isArray(value.columns) ? value.columns : [])
    .slice(0, 20)
    .map((item: Record<string, unknown>, index): DesignColumnType => ({
      label: String(item?.label ?? `C${index + 1}`).slice(0, 40),
      count: Math.round(num(item?.count, 0, 0, 200)),
      floors: Math.round(num(item?.floors, 0, 0, 20)),
      widthIn: num(item?.widthIn, 9, 6, 48),
      depthIn: num(item?.depthIn, 12, 6, 60),
      bars: String(item?.bars ?? '').slice(0, 60),
      tieDia: num(item?.tieDia, 8, 6, 16),
      tieSpacingIn: num(item?.tieSpacingIn, 6, 3, 12),
      footingLengthFeet: num(item?.footingLengthFeet, 5, 0, 20),
      footingWidthFeet: num(item?.footingWidthFeet, 5, 0, 20),
      footingThicknessIn: num(item?.footingThicknessIn, 12, 6, 48),
      footingBarDia: num(item?.footingBarDia, 12, 8, 25),
      footingBarSpacingIn: num(item?.footingBarSpacingIn, 6, 3, 12),
    })); // Preserve incomplete drawing rows for the next autosave.
  const hasFootingSchedule = Array.isArray(value.footings);
  const legacyFootings =
    value.legacyFootings === true ||
    (!hasFootingSchedule && columns.length > 0);
  const footingRows: Record<string, unknown>[] = hasFootingSchedule
    ? (value.footings as Record<string, unknown>[])
    : columns.map((column): Record<string, unknown> => ({
        label: 'F-' + column.label,
        type: 'isolated',
        count: column.count,
        columnRefs: column.label,
        lengthFeet: column.footingLengthFeet,
        widthFeet: column.footingWidthFeet,
        thicknessIn: column.footingThicknessIn,
        bottomBarDia: column.footingBarDia,
        bottomSpacingIn: column.footingBarSpacingIn,
      }));
  const footings = footingRows
    .slice(0, 40)
    .map((entry, index): DesignFootingType => {
      const defaults = newFootingType(index);
      const type = String(entry.type ?? defaults.type);
      const geometry = String(entry.geometry ?? defaults.geometry);
      const mesh = String(entry.mesh ?? defaults.mesh);
      return {
        ...defaults,
        label: String(entry.label ?? defaults.label).slice(0, 40),
        type: FOOTING_TYPES.includes(type as DesignFootingType['type'])
          ? (type as DesignFootingType['type'])
          : 'isolated',
        count: Math.round(num(entry.count, 0, 0, 200)),
        columnRefs: String(entry.columnRefs ?? '').slice(0, 160),
        lengthFeet: num(entry.lengthFeet, 0, 0, 250),
        widthFeet: num(entry.widthFeet, 0, 0, 250),
        thicknessIn: num(entry.thicknessIn, 12, 0, 120),
        padsPerGroup: Math.round(
          num(entry.padsPerGroup, type === 'strap' ? 2 : 1, 1, 30),
        ),
        geometry: ['flat', 'stepped', 'sloped'].includes(geometry)
          ? (geometry as DesignFootingType['geometry'])
          : 'flat',
        topLengthFeet: num(entry.topLengthFeet, 0, 0, 250),
        topWidthFeet: num(entry.topWidthFeet, 0, 0, 250),
        stepThicknessIn: num(entry.stepThicknessIn, 0, 0, 120),
        edgeThicknessIn: num(entry.edgeThicknessIn, 0, 0, 120),
        mesh: mesh === 'double' ? 'double' : 'single',
        bottomBarDia: num(entry.bottomBarDia, 12, 6, 40),
        bottomSpacingIn: num(entry.bottomSpacingIn, 6, 2, 24),
        topBarDia: num(entry.topBarDia, 12, 6, 40),
        topSpacingIn: num(entry.topSpacingIn, 6, 2, 24),
        ...(Array.isArray(entry.reinforcement)
          ? {
              reinforcement: (entry.reinforcement as Record<string, unknown>[])
                .slice(0, 16)
                .map((set) => ({
                  layer:
                    set.layer === 'top'
                      ? ('top' as const)
                      : ('bottom' as const),
                  direction:
                    set.direction === 'width'
                      ? ('width' as const)
                      : ('length' as const),
                  dia: num(set.dia, 12, 6, 40),
                  spacingIn: num(set.spacingIn, 6, 2, 24),
                })),
            }
          : {}),
        strapLengthFeet: num(entry.strapLengthFeet, 0, 0, 250),
        strapWidthIn: num(entry.strapWidthIn, 0, 0, 96),
        strapDepthIn: num(entry.strapDepthIn, 0, 0, 96),
        pedestal: entry.pedestal === true,
        pedestalsPerGroup: Math.round(num(entry.pedestalsPerGroup, 1, 0, 30)),
        pedestalWidthIn: num(entry.pedestalWidthIn, 0, 0, 96),
        pedestalDepthIn: num(entry.pedestalDepthIn, 0, 0, 96),
        pedestalHeightFeet: num(entry.pedestalHeightFeet, 0, 0, 40),
        pedestalTieDia: num(entry.pedestalTieDia, 8, 6, 16),
        pedestalTieSpacingIn: num(entry.pedestalTieSpacingIn, 6, 2, 24),
      };
    }); // Incomplete F1/F2 rows must not disappear during autosave.
  const beams = (Array.isArray(value.beams) ? value.beams : [])
    .slice(0, 20)
    .map((item: Record<string, unknown>, index): DesignBeamType => ({
      label: String(item?.label ?? `B${index + 1}`).slice(0, 40),
      widthIn: num(item?.widthIn, 9, 6, 36),
      depthIn: num(item?.depthIn, 15, 6, 48),
      bars: String(item?.bars ?? '').slice(0, 60),
      stirrupDia: num(item?.stirrupDia, 8, 6, 16),
      stirrupSpacingIn: num(item?.stirrupSpacingIn, 6, 3, 12),
      runFeet: (Array.isArray(item?.runFeet) ? item.runFeet : [])
        .slice(0, 20)
        .map((run: unknown) => num(run, 0, 0, 5000)),
      ...(Array.isArray(item?.countsByFloor)
        ? {
            countsByFloor: item.countsByFloor
              .slice(0, 20)
              .map((count: unknown) => Math.round(num(count, 0, 0, 300))),
          }
        : {}),
    })); // Keep B1/B2 rows until steel sizes and dimensions are completed.
  const plinthBeams = (
    Array.isArray(value.plinthBeams) ? value.plinthBeams : []
  )
    .slice(0, 40)
    .map((item: Record<string, unknown>, index): DesignPlinthBeamType => ({
      label: String(item?.label ?? `PB${index + 1}`).slice(0, 40),
      count: Math.round(num(item?.count, 1, 0, 200)),
      lengthFeet: num(item?.lengthFeet, 0, 0, 5000),
      widthIn: num(item?.widthIn, 9, 6, 36),
      depthIn: num(item?.depthIn, 12, 6, 48),
      bars: String(item?.bars ?? '').slice(0, 180),
      stirrupDia: num(item?.stirrupDia, 8, 6, 16),
      stirrupSpacingIn: num(item?.stirrupSpacingIn, 6, 2, 24),
    }));
  const normalizePanelRebar = (raw: unknown) =>
    (Array.isArray(raw) ? raw : [])
      .slice(0, 16)
      .map((entry: Record<string, unknown>) => ({
        layer: entry.layer === 'top' ? ('top' as const) : ('bottom' as const),
        direction:
          entry.direction === 'width'
            ? ('width' as const)
            : ('length' as const),
        dia: num(entry.dia, 0, 0, 40),
        spacingIn: num(entry.spacingIn, 0, 0, 24),
      }));
  const slabPanels: DesignSlabPanel[] = (
    Array.isArray(value.slabPanels) ? value.slabPanels : []
  )
    .slice(0, 100)
    .map((panel: Record<string, unknown>, index) => ({
      label: String(panel.label ?? `S${index + 1}`).slice(0, 40),
      floor: String(panel.floor ?? '').slice(0, 80),
      count: Math.round(num(panel.count, 1, 0, 200)),
      lengthFeet: num(panel.lengthFeet, 0, 0, 500),
      widthFeet: num(panel.widthFeet, 0, 0, 500),
      thicknessIn: num(panel.thicknessIn, 5, 1, 24),
      reinforcement: normalizePanelRebar(panel.reinforcement),
    }));
  const staircases: DesignStairType[] = (
    Array.isArray(value.staircases) ? value.staircases : []
  )
    .slice(0, 60)
    .map((stair: Record<string, unknown>, index) => ({
      label: String(stair.label ?? `ST${index + 1}`).slice(0, 40),
      floor: String(stair.floor ?? '').slice(0, 80),
      count: Math.round(num(stair.count, 1, 0, 50)),
      widthFeet: num(stair.widthFeet, 3.5, 0, 40),
      riserIn: num(stair.riserIn, 6, 2, 12),
      treadIn: num(stair.treadIn, 10, 4, 24),
      waistIn: num(stair.waistIn, 6, 2, 18),
      landingFeet: num(stair.landingFeet, 4, 0, 30),
      reinforcement: (Array.isArray(stair.reinforcement)
        ? stair.reinforcement
        : []
      )
        .slice(0, 16)
        .map((bar: Record<string, unknown>) => ({
          role:
            bar.role === 'distribution'
              ? ('distribution' as const)
              : ('main' as const),
          dia: num(bar.dia, 0, 0, 40),
          spacingIn: num(bar.spacingIn, 0, 0, 24),
        })),
    }));
  const rawSettings =
    value.settings && typeof value.settings === 'object'
      ? (value.settings as Record<string, unknown>)
      : {};
  const settings: Partial<Record<DesignSettingKey, number>> = {};
  for (const key of DESIGN_SETTING_KEYS) {
    const parsed = Number(rawSettings[key]);
    if (
      rawSettings[key] !== undefined &&
      rawSettings[key] !== '' &&
      Number.isFinite(parsed)
    )
      settings[key] = parsed;
  }
  if (
    !columns.length &&
    !footings.length &&
    !beams.length &&
    !plinthBeams.length &&
    !slabPanels.length &&
    !staircases.length &&
    !Object.keys(settings).length &&
    !Number(value.plinthRunFeet)
  )
    return null;
  return {
    footings,
    ...(legacyFootings ? { legacyFootings: true } : {}),
    columns,
    beams,
    ...(plinthBeams.length ? { plinthBeams } : {}),
    ...(slabPanels.length ? { slabPanels } : {}),
    ...(staircases.length ? { staircases } : {}),
    plinthRunFeet: num(value.plinthRunFeet, 0, 0, 5000),
    ...(Object.keys(settings).length ? { settings } : {}),
  };
}

// ---------------------------------------------------------------------------
// Structure

/**
 * Column positions and beam runs for a floor. From the structural drawing
 * when rows / columns per row are set (upper floors scale with their
 * length), otherwise from a square grid at the column spacing.
 */
const columnGrid = (
  floor: BoqFloor,
  s: StructuralSettings,
  ground: BoqFloor = floor,
) => {
  const fromDrawing = s.columnRows > 0 && s.columnsPerRow > 0;
  const nx = fromDrawing
    ? Math.max(
        2,
        Math.round(
          (s.columnRows * floor.lengthFeet) / Math.max(1, ground.lengthFeet),
        ),
      )
    : ceil(floor.lengthFeet / s.columnSpacingFeet) + 1;
  const ny = fromDrawing
    ? s.columnsPerRow
    : ceil(floor.widthFeet / s.columnSpacingFeet) + 1;
  return {
    nx,
    ny,
    columns: nx * ny + s.extraColumns,
    // Every column line carries a continuous beam, plus lift / stair beams.
    beamRunFeet: ny * floor.lengthFeet + nx * floor.widthFeet + s.extraBeamFeet,
    longestRunFeet: Math.max(floor.lengthFeet, floor.widthFeet),
  };
};

type SteelTally = Map<
  number,
  { metres: number; bars: number; details: string[] }
>;
const addSteel = (
  tally: SteelTally,
  diameter: number,
  metres: number,
  bars: number,
  detail: string,
) => {
  if (!(diameter > 0) || !(metres > 0)) return;
  const entry = tally.get(diameter) ?? { metres: 0, bars: 0, details: [] };
  entry.metres += metres;
  entry.bars += bars;
  entry.details.push(detail);
  tally.set(diameter, entry);
};

/** Sand bought by the tonne; the m³ is kept in the source note. */
const sandOutput = (
  cubicMetres: number,
  s: StructuralSettings,
  name = 'Sand',
): GeneratedOutput => ({
  name,
  material: 'sand',
  quantity: round(cubicMetres * s.sandTonPerCum, 2),
  unit: 't',
  source: `${round(cubicMetres, 3)} m³ × ${s.sandTonPerCum} t/m³`,
});
const aggregateOutput = (
  cubicMetres: number,
  s: StructuralSettings,
  name: string,
): GeneratedOutput => ({
  name,
  material: 'aggregate',
  quantity: round(cubicMetres * s.aggregateTonPerCum, 2),
  unit: 't',
  source: `${round(cubicMetres, 3)} m³ × ${s.aggregateTonPerCum} t/m³`,
});

/** Existing M20 nominal site-mix takeoff recipe per m³ of structural concrete. */
export const M20_SITE_MIX_PER_M3 = {
  cementBags: 8.06,
  sandCubicMetres: 0.42,
  aggregateCubicMetres: 0.84,
} as const;

/** Window sunshades are derived from the actual window width schedule.
 * Dimensions and reinforcement below are preliminary BOQ allowances only;
 * site-specific chajja geometry and bar bending require structural approval.
 */
export const WINDOW_SUNSHADE_ASSUMPTIONS = {
  projectionFeet: 2,
  overhangEachSideFeet: 0.5,
  slabThicknessIn: 4,
  estimatedSteelKgPerM3: 80,
  steelDiameterMm: 8,
} as const;

export function windowSunshadeTakeoff(
  openings: readonly { count: number; widthFeet: number; heightFeet: number }[],
  s: StructuralSettings,
): { windowCount: number; outputs: GeneratedOutput[] } {
  const rules = WINDOW_SUNSHADE_ASSUMPTIONS;
  let volumeCft = 0;
  let shutteringSqft = 0;
  let windowCount = 0;
  for (const opening of openings) {
    if (
      !Number.isFinite(opening.count) ||
      !Number.isFinite(opening.widthFeet) ||
      !(opening.count > 0 && opening.widthFeet > 0)
    )
      continue;
    const spanFeet = opening.widthFeet + 2 * rules.overhangEachSideFeet;
    const thickFeet = rules.slabThicknessIn / 12;
    windowCount += opening.count;
    volumeCft += opening.count * spanFeet * rules.projectionFeet * thickFeet;
    shutteringSqft +=
      opening.count *
      (spanFeet * rules.projectionFeet +
        (spanFeet + 2 * rules.projectionFeet) * thickFeet);
  }
  if (!windowCount || !volumeCft) return { windowCount: 0, outputs: [] };
  const volumeM3 = volumeCft * CUM_PER_CFT;
  const supplyVolume = volumeM3 * (1 + s.materialWastagePercent / 100);
  const stock = s.stockBarFeet;
  const weightPerRodKg = stock * M_PER_FT * (rules.steelDiameterMm ** 2 / 162);
  const rods = ceil(
    (supplyVolume * rules.estimatedSteelKgPerM3) / weightPerRodKg,
  );
  const source =
    `${windowCount} measured windows; each span = window width + ${2 * rules.overhangEachSideFeet} ft; ` +
    `${rules.projectionFeet} ft projection, ${rules.slabThicknessIn} in slab; ` +
    `${s.materialWastagePercent}% wastage; confirm structural drawings`;
  return {
    windowCount,
    outputs: [
      {
        name: 'Window sunshade concrete volume (reference only)',
        quantity: round(volumeM3, 3),
        unit: 'm³',
        rate: 0,
        source,
      },
      {
        name: 'Cement (window sunshades)',
        material: 'cement',
        quantity: round(supplyVolume * M20_SITE_MIX_PER_M3.cementBags, 1),
        unit: 'bag',
        source,
      },
      sandOutput(
        supplyVolume * M20_SITE_MIX_PER_M3.sandCubicMetres,
        s,
        'Sand (window sunshades)',
      ),
      aggregateOutput(
        supplyVolume * M20_SITE_MIX_PER_M3.aggregateCubicMetres,
        s,
        'Aggregate (window sunshades)',
      ),
      {
        name: 'Sunshade shuttering (estimated)',
        material: 'shuttering',
        quantity: round(shutteringSqft, 2),
        unit: 'sqft',
        source: 'Underside and exposed edges; confirm at site',
      },
      {
        name: `${rules.steelDiameterMm} mm TMT (window sunshades, provisional)`,
        material: 'steel',
        quantity: rods,
        unit: 'rod',
        diameter: rules.steelDiameterMm,
        rods,
        weightKg: round(rods * weightPerRodKg, 2),
        source: `${rules.estimatedSteelKgPerM3} kg/m³ provisional; ${stock} ft stock rods; replace with approved BBS`,
      },
    ],
  };
}

const concreteOutputs = (
  volume: number,
  label: string,
  s: StructuralSettings,
): GeneratedOutput[] =>
  s.readyMixConcrete
    ? [
        {
          name: `${label} concrete (M20 ready-mix)`,
          material: 'concrete_m20',
          quantity: round(volume * (1 + s.materialWastagePercent / 100), 2),
          unit: 'm³',
          source: `${round(volume, 2)} m³ + ${s.materialWastagePercent}% wastage`,
        },
      ]
    : [
        {
          name: `${label} concrete (M20) · volume only`,
          quantity: round(volume, 3),
          unit: 'm³',
          rate: 0,
          source:
            'Reference volume only; site-mixed materials priced separately',
        },
        {
          name: 'Cement',
          material: 'cement',
          quantity: round(volume * M20_SITE_MIX_PER_M3.cementBags, 1),
          unit: 'bag',
          source: 'M20 nominal mix 1:1.5:3 · 8.06 bags/m³',
        },
        sandOutput(volume * M20_SITE_MIX_PER_M3.sandCubicMetres, s),
        aggregateOutput(
          volume * M20_SITE_MIX_PER_M3.aggregateCubicMetres,
          s,
          '20 mm aggregate',
        ),
      ];

/**
 * Cement and sand takeoff from net plaster faces, not from the building
 * footprint. The second coat is a separate 6 mm finishing pass: internal
 * first coat 12 mm (1:6), external first coat 20 mm (1:4). Rates are project
 * assumptions until site-approved mix designs are provided.
 */
export function plasterMaterialTakeoff(
  internalAreaSqft: number,
  externalAreaSqft: number,
  internalCoats: 1 | 2 = 1,
  externalCoats: 1 | 2 = 1,
  wastePercent = 0,
) {
  const internal = Math.max(0, internalAreaSqft);
  const external = Math.max(0, externalAreaSqft);
  // The 6 mm second coat is 50% of the internal 12 mm coat or
  // 30% of the external 20 mm coat, not a second full-thickness pass.
  const insideFactor = internalCoats === 2 ? 1.5 : 1;
  const outsideFactor = externalCoats === 2 ? 1.3 : 1;
  const waste = 1 + Math.max(0, wastePercent) / 100;
  return {
    cementBags:
      (internal * 0.0058 * insideFactor + external * 0.0136 * outsideFactor) *
      waste,
    sandM3:
      (internal * 0.0012 * insideFactor + external * 0.0019 * outsideFactor) *
      waste,
  };
}

/**
 * Bricks, mortar and plaster materials for a wall volume (m³) and plastered
 * faces (sq ft). Internal plaster 12 mm 1:6, external 20 mm 1:4.
 */
const brickworkOutputs = (
  volume: number,
  internalPlaster: number,
  externalPlaster: number,
  s: StructuralSettings,
  internalCoats: 1 | 2 = 1,
  externalCoats: 1 | 2 = 1,
): GeneratedOutput[] => {
  const waste = 1 + s.materialWastagePercent / 100;
  const plaster = plasterMaterialTakeoff(
    internalPlaster,
    externalPlaster,
    internalCoats,
    externalCoats,
    s.materialWastagePercent,
  );
  return [
    {
      name: 'Bricks',
      material: 'bricks',
      quantity: ceil(volume * s.bricksPerCubicMetre * waste),
      unit: 'nos',
      source: `${round(volume, 2)} m³ wall × ${s.bricksPerCubicMetre}/m³`,
    },
    {
      name: 'Cement (brickwork & plaster)',
      material: 'cement_masonry',
      quantity: round(volume * 1.5 * waste + plaster.cementBags, 1),
      unit: 'bag',
      source:
        'Mortar 1:6 · plaster 12 mm internal/20 mm external first coat; optional 6 mm second coat',
    },
    sandOutput(volume * 0.32 * waste + plaster.sandM3, s),
    ...(internalPlaster > 0
      ? [
          {
            name: 'Internal plaster',
            ...(s.labourItemized ? { material: 'plaster_labour' } : {}),
            quantity: round(internalPlaster, 0),
            unit: 'sqft',
          },
        ]
      : []),
    ...(externalPlaster > 0
      ? [
          {
            name: 'External plaster',
            ...(s.labourItemized ? { material: 'plaster_labour' } : {}),
            quantity: round(externalPlaster, 0),
            unit: 'sqft',
          },
        ]
      : []),
    ...(s.labourItemized && internalCoats === 2 && internalPlaster > 0
      ? [
          {
            name: 'Internal plaster second coat',
            material: 'plaster_labour',
            quantity: round(internalPlaster, 0),
            unit: 'sqft',
            source: 'Second 6 mm coat; confirm separate labour rate',
          },
        ]
      : []),
    ...(s.labourItemized && externalCoats === 2 && externalPlaster > 0
      ? [
          {
            name: 'External plaster second coat',
            material: 'plaster_labour',
            quantity: round(externalPlaster, 0),
            unit: 'sqft',
            source: 'Second 6 mm coat; confirm separate labour rate',
          },
        ]
      : []),
  ];
};

/** Wall area, priced with brickwork labour (9 in / 4.5 in) when itemized. */
const wallOutput = (
  label: string,
  thicknessIn: number,
  areaSqft: number,
  s: StructuralSettings,
): GeneratedOutput => ({
  name: `${thicknessIn} in ${label}`,
  quantity: round(areaSqft, 0),
  unit: 'sqft',
  ...(s.labourItemized
    ? {
        material:
          thicknessIn >= 6 ? 'labour_brickwork_9' : 'labour_brickwork_4',
      }
    : {}),
});

const steelOutputs = (
  tally: SteelTally,
  stockFeet: number,
): GeneratedOutput[] =>
  [...tally.entries()]
    .sort(([a], [b]) => b - a)
    .map(([diameter, entry]) => {
      const kg = entry.metres * steelKgPerMetre(diameter);
      return {
        name: `${diameter} mm TMT`,
        material: 'steel',
        quantity: entry.bars,
        unit: 'rod',
        rods: entry.bars,
        diameter,
        weightKg: round(kg, 1),
        source:
          `${round(kg, 1)} kg · ${stockFeet} ft rods · ${entry.details.join(' · ')}`.slice(
            0,
            300,
          ),
      };
    });

type LineDraft = Omit<GeneratedLine, 'id' | 'origin' | 'notes'> & {
  notes?: string;
};

const newId = () => globalThis.crypto.randomUUID();

export type QuotationBoqResult = {
  lines: GeneratedLine[];
  floors: BoqFloor[];
  counts: BoqCounts;
  settings: StructuralSettings;
  design: StructuralDesign | null;
  warnings: string[];
  /** Steel summary across all structural lines, by diameter. */
  steel: { diameter: number; kg: number; bars: number }[];
};

export type QuotationBoqInput = {
  details: SftEstimateDetails;
  settings?: unknown;
  /** Edited floors (e.g. corrected heights); defaults come from the quote. */
  floors?: BoqFloor[];
  /** Edited counts per floor; missing values are estimated. */
  counts?: unknown;
  /** Column / beam / footing schedule from the structural drawing. */
  design?: unknown;
  /** New stage-card BOQs account for roof beam and slab quantities independently. */
  splitBeamSlab?: boolean;
};

export function generateQuotationBoq(
  input: QuotationBoqInput,
): QuotationBoqResult {
  const design = normalizeDesign(input.design);
  const splitBeamSlab = input.splitBeamSlab === true;
  // The drawing's own slab / staircase / cover values win over the company's.
  const quotedSlabThickness = Number(input.details.slabThicknessIn);
  const s = normalizeStructuralSettings({
    ...(input.settings && typeof input.settings === 'object'
      ? input.settings
      : {}),
    ...(quotedSlabThickness >= 3 && quotedSlabThickness <= 12
      ? { slabThicknessIn: quotedSlabThickness }
      : {}),
    // Engineer-entered drawing schedule is the final takeoff authority.
    ...design?.settings,
  });
  const floors = (
    input.floors?.length
      ? input.floors
      : floorsFromQuote(input.details, s.defaultFloorHeightFeet)
  ).filter((floor) => floor.areaSqft > 0);
  const counts = normalizeCounts(
    input.counts,
    estimateCounts(floors, s, input.details),
  );
  const warnings: string[] = [];
  const drafts: { draft: LineDraft; origin: BoqOrigin }[] = [];
  const wallsByFloor = new Map<
    string,
    { internalPlaster: number; externalPlaster: number }
  >();
  const stock = s.stockBarFeet;
  // Each element uses its own cover from the drawing (0 = the general one).
  const coverOf = (mm: number) => (mm > 0 ? mm : s.coverMm) * FT_PER_MM;
  const footingCover = coverOf(s.coverFootingMm);
  const columnCover = coverOf(s.coverColumnMm);
  const beamCover = coverOf(s.coverBeamMm);
  const slabCover = coverOf(s.coverSlabMm);
  const totalSteel: SteelTally = new Map();
  const mergeSteel = (tally: SteelTally) => {
    for (const [diameter, entry] of tally)
      for (const detail of entry.details.slice(0, 1))
        addSteel(totalSteel, diameter, entry.metres, entry.bars, detail);
  };

  for (const floor of floors.filter((item) => item.heightAssumed))
    warnings.push(
      `${floor.name}: floor height not on the quotation; ${floor.heightFeet} ft assumed. Enter it in the quotation work details.`,
    );

  if (floors.length) {
    const ground = floors[0]!;
    const groundGrid = columnGrid(ground, s);
    // Column types: the drawing's schedule, or one type from the rules.
    type ColumnType = {
      label: string;
      widthIn: number;
      depthIn: number;
      bars: { dia: number; count: number }[];
      tieDia: number;
      tieSpacingIn: number;
      footing: {
        lengthFeet: number;
        widthFeet: number;
        thicknessIn: number;
        barDia: number;
        spacingIn: number;
      };
      countAt: (floorIndex: number) => number;
    };
    const enteredColumns =
      design?.columns.filter(
        (column) => column.count > 0 && parseBars(column.bars).length > 0,
      ) ?? [];
    const columnTypes: ColumnType[] = enteredColumns.length
      ? enteredColumns.map((type) => ({
          label: type.label,
          widthIn: type.widthIn,
          depthIn: type.depthIn,
          bars: parseBars(type.bars),
          tieDia: type.tieDia,
          tieSpacingIn: type.tieSpacingIn,
          footing: {
            lengthFeet: type.footingLengthFeet,
            widthFeet: type.footingWidthFeet,
            thicknessIn: type.footingThicknessIn,
            barDia: type.footingBarDia,
            spacingIn: type.footingBarSpacingIn,
          },
          countAt: (floorIndex: number) =>
            !type.floors || floorIndex < type.floors ? type.count : 0,
        }))
      : splitBeamSlab
        ? []
        : [
            {
              label: 'Columns',
              widthIn: s.columnWidthIn,
              depthIn: s.columnDepthIn,
              bars: [
                { dia: s.columnBar1Dia, count: s.columnBar1Count },
                { dia: s.columnBar2Dia, count: s.columnBar2Count },
              ].filter((bar) => bar.dia > 0 && bar.count > 0),
              tieDia: s.columnTieDia,
              tieSpacingIn: s.columnTieSpacingIn,
              footing: {
                lengthFeet: s.footingLengthFeet,
                widthFeet: s.footingWidthFeet,
                thicknessIn: s.footingThicknessIn,
                barDia: s.footingBarDia,
                spacingIn: s.footingBarSpacingIn,
              },
              countAt: (floorIndex: number) =>
                floorIndex === 0
                  ? groundGrid.columns
                  : Math.min(
                      columnGrid(floors[floorIndex]!, s, ground).columns,
                      groundGrid.columns,
                    ),
            },
          ];
    const groundColumns = columnTypes.reduce(
      (sum, type) => sum + type.countAt(0),
      0,
    );
    const footingT = Math.max(
      0,
      ...columnTypes.map((type) => type.footing.thicknessIn / 12),
      ...(splitBeamSlab
        ? (design?.footings ?? []).map((row) => row.thicknessIn / 12)
        : []),
    );
    // "12 × 5×5 ft, 2 × 4×4 ft": footings grouped by size.
    const footingSizes = () => {
      const sizes = new Map<string, number>();
      for (const type of columnTypes) {
        const key = `${type.footing.lengthFeet}×${type.footing.widthFeet} ft`;
        sizes.set(key, (sizes.get(key) ?? 0) + type.countAt(0));
      }
      return [...sizes]
        .filter(([, count]) => count > 0)
        .map(([size, count]) => `${count} × ${size}`)
        .join(', ');
    };

    // Legacy estimates keep their original calculation and saved meaning.
    // In the stage-card editor, only independent F1/F2 footing entries are
    // authoritative; column C1 dimensions never create a footing implicitly.
    if (!splitBeamSlab || design?.legacyFootings) {
      const footings = groundColumns;
      let excavation = 0;
      let pcc = 0;
      let footingConcrete = 0;
      const tally: SteelTally = new Map();
      for (const type of columnTypes) {
        const n = type.countAt(0);
        const f = type.footing;
        if (!(n > 0) || !(f.lengthFeet > 0) || !(f.widthFeet > 0)) continue;
        const t = f.thicknessIn / 12;
        excavation +=
          n *
          (f.lengthFeet + 2) *
          (f.widthFeet + 2) *
          s.foundationDepthFeet *
          CUM_PER_CFT;
        pcc +=
          n *
          (f.lengthFeet + 0.5) *
          (f.widthFeet + 0.5) *
          (s.pccThicknessIn / 12) *
          CUM_PER_CFT;
        footingConcrete += n * f.lengthFeet * f.widthFeet * t * CUM_PER_CFT;
        const spacing = f.spacingIn / 12;
        const bendUp = Math.max(0, t - 2 * footingCover);
        for (const [span, across] of [
          [f.lengthFeet, f.widthFeet],
          [f.widthFeet, f.lengthFeet],
        ] as const) {
          const barsPerFooting = barsAcross(
            Math.max(0, across - 2 * footingCover),
            spacing,
          );
          const piece = Math.max(0, span - 2 * footingCover) + 2 * bendUp;
          const plan = cutPlan(piece, barsPerFooting * n, stock, 0);
          addSteel(
            tally,
            f.barDia,
            plan.bars * stock * M_PER_FT,
            plan.bars,
            `${type.label} footing mesh ${barsPerFooting * n} pcs × ${ft(piece)}`,
          );
        }
      }
      mergeSteel(tally);
      if (splitBeamSlab) {
        drafts.push({
          origin: 'quotation-structure',
          draft: {
            name: 'Foundation: excavation from footing sizes (estimated)',
            section: 'Foundation',
            kind: 'quote-excavation',
            unit: 'm³',
            inputs: { footings, depthFeet: s.foundationDepthFeet },
            outputs: [
              {
                name: 'Excavation volume',
                material: 'excavation',
                quantity: round(excavation, 2),
                unit: 'm³',
                source:
                  'Footing-pit estimate (replace with measured length, width and depth)',
              },
            ],
          },
        });
        drafts.push({
          origin: 'quotation-structure',
          draft: {
            name: 'Foundation: PCC beds from footing sizes (estimated)',
            section: 'Foundation',
            kind: 'quote-pcc',
            unit: 'm³',
            inputs: { footings, thicknessIn: s.pccThicknessIn },
            outputs: [
              {
                name: 'PCC volume (reference only)',
                quantity: round(pcc, 3),
                unit: 'm³',
                rate: 0,
              },
              {
                name: 'Cement (PCC)',
                material: 'cement',
                quantity: round(pcc * s.pccCementBagsPerM3, 1),
                unit: 'bag',
              },
              sandOutput(pcc * s.pccSandM3PerM3, s, 'Sand (PCC)'),
              aggregateOutput(
                pcc * s.pccAggregateM3PerM3,
                s,
                'Aggregate (PCC)',
              ),
            ],
          },
        });
      }
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: design?.columns.length
            ? `Foundation: ${footings} footings (${footingSizes()})`
            : `Foundation: ${footings} footings (${s.footingLengthFeet}×${s.footingWidthFeet} ft)`,
          section: 'Foundation',
          kind: 'quote-foundation',
          unit: 'm³',
          inputs: {
            footings,
            grid: design?.columns.length
              ? 'From the structural drawing'
              : `${groundGrid.nx} × ${groundGrid.ny} columns`,
            depthFeet: s.foundationDepthFeet,
          },
          outputs: [
            ...(!splitBeamSlab
              ? [
                  {
                    name: 'Earthwork excavation',
                    material: 'excavation',
                    quantity: round(excavation, 2),
                    unit: 'm³',
                    source: `${footings} pits · 1 ft working space each side`,
                  },
                  {
                    name: 'PCC 1:4:8 bed (reference only)',
                    quantity: round(pcc, 3),
                    unit: 'm³',
                    rate: 0,
                  },
                  {
                    name: 'Cement',
                    material: 'cement',
                    quantity: round(pcc * 3.4, 1),
                    unit: 'bag',
                    source: 'PCC 1:4:8 · 3.4 bags/m³',
                  },
                  sandOutput(pcc * 0.47, s),
                  aggregateOutput(pcc * 0.94, s, '40 mm aggregate'),
                ]
              : []),
            ...concreteOutputs(footingConcrete, 'Footing', s),
            ...steelOutputs(tally, stock),
          ],
        },
      });
    }

    // --- Pedestals (optional) ---------------------------------------------
    // Column bars run through the pedestal from the footing, so only the
    // pedestal's concrete and its own rings are added here.
    if (!splitBeamSlab && s.pedestalHeightFeet > 0) {
      const pedestals = groundColumns;
      const width = s.pedestalWidthIn / 12;
      const depth = s.pedestalDepthIn / 12;
      const concrete =
        pedestals * width * depth * s.pedestalHeightFeet * CUM_PER_CFT;
      const ringLength =
        2 *
          (Math.max(0, width - 2 * columnCover) +
            Math.max(0, depth - 2 * columnCover)) +
        20 * s.columnTieDia * FT_PER_MM;
      const rings =
        pedestals *
        (ceil((s.pedestalHeightFeet * 12) / s.columnTieSpacingIn) + 1);
      const ringPlan = cutPlan(ringLength, rings, stock, 0);
      const tally: SteelTally = new Map();
      addSteel(
        tally,
        s.columnTieDia,
        ringPlan.bars * stock * M_PER_FT,
        ringPlan.bars,
        `${rings} pedestal rings × ${ft(ringLength)}`,
      );
      mergeSteel(tally);
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: `Pedestals: ${pedestals} nos (${s.pedestalWidthIn}×${s.pedestalDepthIn} in × ${s.pedestalHeightFeet} ft)`,
          section: 'Foundation',
          kind: 'quote-pedestals',
          unit: 'm³',
          inputs: {
            pedestals,
            size: `${s.pedestalWidthIn}×${s.pedestalDepthIn} in`,
            heightFeet: s.pedestalHeightFeet,
          },
          outputs: [
            ...concreteOutputs(concrete, 'Pedestal', s),
            ...steelOutputs(tally, stock),
            {
              name: 'Centering & shuttering',
              ...(s.labourItemized ? { material: 'shuttering' } : {}),
              quantity: round(
                pedestals * 2 * (width + depth) * s.pedestalHeightFeet,
                0,
              ),
              unit: 'sqft',
            },
          ],
        },
      });
    }

    // --- New independent footing schedule --------------------------------
    if (splitBeamSlab && !design?.legacyFootings && design?.footings.length) {
      const columnsByLabel = new Set(
        (design.columns ?? []).map((col) => col.label.toLowerCase()),
      );
      for (const footing of design.footings) {
        const refs = footing.columnRefs
          .split(/[,;+]/)
          .map((ref) => ref.trim())
          .filter(Boolean);
        if (!refs.length)
          warnings.push(
            `${footing.label}: select supporting column references for cross-checking; footing quantity is independently measured.`,
          );
        for (const ref of refs) {
          if (!columnsByLabel.has(ref.toLowerCase()))
            warnings.push(
              `${footing.label}: supporting column "${ref}" is not entered in the Columns schedule.`,
            );
        }
        if (footing.type === 'pile_cap')
          warnings.push(
            `${footing.label}: pile cap takeoff excludes piles, drilling and pile reinforcement. Enter them separately from the engineer's pile schedule.`,
          );
        if (footing.type === 'strap' && footing.strapLengthFeet)
          warnings.push(
            `${footing.label}: strap beam reinforcement has not been specified; only measured concrete is quantified.`,
          );
        if (footing.geometry !== 'flat')
          warnings.push(
            `${footing.label}: ${footing.geometry} geometry volume is an estimate; verify step/taper dimensions against the structural section.`,
          );
        const concrete = footingConcreteCft(footing) * CUM_PER_CFT;
        if (!(concrete > 0)) continue;
        const tally: SteelTally = new Map();
        // An explicit directional mesh replaces (never supplements) the
        // legacy two-direction, single-diameter mesh for this footing type.
        const meshPieces = Array.isArray(footing.reinforcement)
          ? footing.reinforcement.flatMap((set) => {
              if (!(set.dia > 0 && set.spacingIn > 0)) return [];
              const length = Math.max(0, footing.lengthFeet - 2 * footingCover);
              const width = Math.max(0, footing.widthFeet - 2 * footingCover);
              const span = set.direction === 'length' ? length : width;
              const across = set.direction === 'length' ? width : length;
              if (!(span > 0 && across > 0)) return [];
              const bendUp =
                set.layer === 'bottom'
                  ? Math.max(0, footing.thicknessIn / 12 - 2 * footingCover)
                  : 0;
              return [
                {
                  diameter: set.dia,
                  pieces:
                    padCount(footing) * barsAcross(across, set.spacingIn / 12),
                  lengthFeet: span + 2 * bendUp,
                  layer: set.layer,
                },
              ];
            })
          : footingMeshPieces(footing, footingCover);
        for (const piece of meshPieces) {
          const plan = cutPlan(piece.lengthFeet, piece.pieces, stock, 0);
          addSteel(
            tally,
            piece.diameter,
            plan.bars * stock * M_PER_FT,
            plan.bars,
            `${footing.label} ${piece.layer} mesh ${piece.pieces} pcs × ${ft(piece.lengthFeet)}`,
          );
        }
        mergeSteel(tally);
        const pieces = padCount(footing);
        drafts.push({
          origin: 'quotation-structure',
          draft: {
            name: `${footing.label}: ${footing.type.replace('_', ' ')} footing (${footing.count} groups, ${pieces} pads)`,
            section: 'Foundation',
            kind: 'quote-footings',
            unit: 'm³',
            inputs: {
              type: footing.type,
              footingRef: footing.label,
              supportedColumns: footing.columnRefs,
              count: footing.count,
              pads: pieces,
              dimensions: `${footing.lengthFeet} × ${footing.widthFeet} ft × ${footing.thicknessIn} in`,
              geometry: footing.geometry,
              reinforcement: footing.mesh,
            },
            outputs: [
              ...concreteOutputs(concrete, 'Footing', s),
              ...steelOutputs(tally, stock),
            ],
          },
        });
        const pedConcrete = pedestalConcreteCft(footing) * CUM_PER_CFT;
        if (footing.pedestal && pedConcrete > 0) {
          const n = footing.count * footing.pedestalsPerGroup;
          const width = footing.pedestalWidthIn / 12;
          const depth = footing.pedestalDepthIn / 12;
          const ht = footing.pedestalHeightFeet;
          const ringLength =
            2 *
              (Math.max(0, width - 2 * columnCover) +
                Math.max(0, depth - 2 * columnCover)) +
            20 * footing.pedestalTieDia * FT_PER_MM;
          const ringCount =
            n * (ceil((ht * 12) / footing.pedestalTieSpacingIn) + 1);
          const pedSteel: SteelTally = new Map();
          const plan = cutPlan(ringLength, ringCount, stock, 0);
          addSteel(
            pedSteel,
            footing.pedestalTieDia,
            plan.bars * stock * M_PER_FT,
            plan.bars,
            `${footing.label} ${ringCount} pedestal rings × ${ft(ringLength)}`,
          );
          mergeSteel(pedSteel);
          drafts.push({
            origin: 'quotation-structure',
            draft: {
              name: `${footing.label}: ${n} pedestals`,
              section: 'Foundation',
              kind: 'quote-pedestals',
              unit: 'm³',
              inputs: {
                footingRef: footing.label,
                pedestals: n,
                size: `${footing.pedestalWidthIn} × ${footing.pedestalDepthIn} in`,
                heightFeet: ht,
              },
              outputs: [
                ...concreteOutputs(pedConcrete, 'Pedestal', s),
                ...steelOutputs(pedSteel, stock),
                {
                  name: 'Pedestal formwork',
                  ...(s.labourItemized ? { material: 'shuttering' } : {}),
                  quantity: round(n * 2 * (width + depth) * ht, 0),
                  unit: 'sqft',
                },
              ],
            },
          });
        }
      }
    }

    // --- Columns, one lift per stage so steel is brought floor by floor ---
    {
      const allBars = columnTypes.flatMap((type) => type.bars);
      const maxDia = Math.max(0, ...allBars.map((bar) => bar.dia));
      const maxLap = lapFeet(maxDia, s.lapDiameters);
      const maxBend = Math.max(0.75, 12 * maxDia * FT_PER_MM);
      const belowPlinth = Math.max(0, s.foundationDepthFeet - footingT);
      const foundationPiece = stock / Math.max(1, s.foundationCuts);
      // The foundation bar (usually half a 40 ft bar) runs through the ground
      // floor when it reaches the ground-floor roof plus the lap; otherwise it
      // stops one lap above plinth and the ground floor gets its own lift.
      // Every joint is a lap just above a floor level.
      const throughGround =
        belowPlinth +
          s.plinthHeightFeet +
          ground.heightFeet +
          maxLap +
          maxBend <=
        foundationPiece + 1e-9;
      if (columnTypes.length && !throughGround)
        warnings.push(
          `Foundation bars (${ft(foundationPiece)}) stop ${ft(maxLap)} above plinth; the ground floor columns get their own lift because footing → ground-floor roof + lap is longer than one foundation piece.`,
        );
      type Lift = {
        stage: string;
        label: string;
        floorIndex: number;
        height: number;
        foundation: boolean;
      };
      const lifts: Lift[] = [
        {
          stage: 'Foundation',
          label: throughGround
            ? `Foundation → ${ground.name} roof`
            : 'Foundation → plinth',
          floorIndex: 0,
          height:
            belowPlinth +
            s.plinthHeightFeet +
            (throughGround ? ground.heightFeet : 0),
          foundation: true,
        },
        ...floors
          .map((floor, index) => ({ floor, index }))
          .filter(({ index }) => index > 0 || !throughGround)
          .map(({ floor, index }) => ({
            stage: floor.name,
            label: floor.name,
            floorIndex: index,
            height: floor.heightFeet,
            foundation: false,
          })),
      ];
      const lastFloor = floors.length - 1;
      for (const lift of lifts) {
        const tally: SteelTally = new Map();
        const notes: string[] = [];
        let concrete = 0;
        let columns = 0;
        const types = columnTypes
          .map((type) => ({ type, n: type.countAt(lift.floorIndex) }))
          .filter(({ n }) => n > 0);
        for (const { type, n } of types) {
          columns += n;
          const tag = design?.columns.length ? `${type.label} ` : '';
          // The last lift of this type needs a lap only for starters.
          const typeTop =
            lift.floorIndex === lastFloor ||
            type.countAt(lift.floorIndex + 1) === 0;
          const reachesTop = typeTop && (!lift.foundation || throughGround);
          for (const bar of type.bars) {
            const lapLength = lapFeet(bar.dia, s.lapDiameters);
            const lap = reachesTop && !s.topStarters ? 0 : lapLength;
            const bend = lift.foundation
              ? Math.max(0.75, 12 * bar.dia * FT_PER_MM)
              : 0;
            const required = lift.height + lap + bend;
            const pieces = n * bar.count;
            const preferred = lift.foundation ? s.foundationCuts : s.floorCuts;
            const plan = cutPlan(required, pieces, stock, lapLength, preferred);
            if (plan.adjusted)
              warnings.push(
                `${lift.label} ${tag ? tag.trim() : 'columns'}, ${bar.dia} mm: needs ${ft(required)} (height ${ft(lift.height)} + lap ${ft(lap)}${bend ? ` + bend ${ft(bend)}` : ''}); ${ft(stock / preferred)} pieces (${preferred} per bar) are too short, so ${plan.piecesPerBar || 'spliced'} per bar is used.`,
              );
            addSteel(
              tally,
              bar.dia,
              plan.bars * stock * M_PER_FT,
              plan.bars,
              `${type.label} ${pieces} pcs × ${ft(plan.pieceFeet)}`,
            );
            notes.push(
              `${lift.label} · ${tag}${bar.dia} mm: ${pieces} pcs, need ${ft(required)} (${ft(lift.height)} + lap ${ft(lap)}${bend ? ` + bend ${ft(bend)}` : ''}), cut ${plan.piecesPerBar ? `${plan.piecesPerBar}/bar @ ${ft(plan.pieceFeet)}` : 'spliced'} → ${plan.bars} bars${plan.offcutFeetPerBar > 0.05 ? `, offcut ${ft(plan.offcutFeetPerBar)}/bar` : ''}`,
            );
          }
          const tieLength =
            2 *
              (Math.max(0, type.widthIn / 12 - 2 * columnCover) +
                Math.max(0, type.depthIn / 12 - 2 * columnCover)) +
            20 * type.tieDia * FT_PER_MM;
          const ties = n * (ceil((lift.height * 12) / type.tieSpacingIn) + 1);
          const tiePlan = cutPlan(tieLength, ties, stock, 0);
          addSteel(
            tally,
            type.tieDia,
            tiePlan.bars * stock * M_PER_FT,
            tiePlan.bars,
            `${type.label} ${ties} rings × ${ft(tieLength)}`,
          );
          concrete +=
            n *
            lift.height *
            (type.widthIn / 12) *
            (type.depthIn / 12) *
            CUM_PER_CFT;
        }
        if (!columns) continue;
        mergeSteel(tally);
        const single = types.length === 1 ? types[0]!.type : undefined;
        drafts.push({
          origin: 'quotation-structure',
          draft: {
            name: single
              ? `${lift.label}: ${columns} columns (${single.widthIn}×${single.depthIn} in)`
              : `${lift.label}: ${columns} columns (${types.map(({ type, n }) => `${n} ${type.label}`).join(', ')})`,
            section: lift.stage,
            kind: 'quote-columns',
            unit: 'm³',
            inputs: {
              columns,
              liftHeightFeet: round(lift.height, 2),
              mainBars: types
                .map(
                  ({ type }) =>
                    `${single ? '' : `${type.label}: `}${type.bars.map((bar) => `${bar.count}×${bar.dia} mm`).join(' + ')}`,
                )
                .join(' · ')
                .slice(0, 200),
              rings: [
                ...new Set(
                  types.map(
                    ({ type }) => `${type.tieDia} mm @ ${type.tieSpacingIn} in`,
                  ),
                ),
              ].join(', '),
              lap: `${s.lapDiameters}d`,
            },
            outputs: [
              ...concreteOutputs(concrete, 'Column', s),
              ...steelOutputs(tally, stock),
            ],
            notes: notes.join('\n').slice(0, 2000),
          },
        });
      }
    }

    // --- Beams and slabs per level ---------------------------------------
    const beamLevels: {
      name: string;
      stage: string;
      floor: BoqFloor;
      slab: boolean;
      index: number;
    }[] = [
      ...(s.plinthBeam
        ? [
            {
              name: 'Plinth beams',
              stage: 'Foundation',
              floor: ground,
              slab: false,
              index: -1,
            },
          ]
        : []),
      ...floors.map((floor, index) => ({
        name: `${floor.name} roof`,
        stage: floor.name,
        floor,
        slab: true,
        index,
      })),
    ];
    const slabT = s.slabThicknessIn / 12;
    for (const level of beamLevels) {
      const grid = columnGrid(level.floor, s, ground);
      const tally: SteelTally = new Map();
      const beamTally: SteelTally =
        splitBeamSlab && level.slab ? new Map() : tally;
      const slabTally: SteelTally =
        splitBeamSlab && level.slab ? new Map() : tally;
      const outputs: GeneratedOutput[] = [];
      // Beam types at this level: the drawing's schedule (running feet per
      // floor roof), or one type from the rules along every column line.
      type BeamAt = {
        label: string;
        widthIn: number;
        depthIn: number;
        bars: { dia: number; count: number; label: string }[];
        stirrupDia: number;
        stirrupSpacingIn: number;
        segments: { runs: number; span: number }[];
      };
      const longest = Math.max(
        1,
        level.floor.lengthFeet,
        level.floor.widthFeet,
      );
      // A schedule gives only the total run: split it into lines no longer
      // than the building so laps and anchorage are counted.
      const runSegments = (run: number) => {
        if (!(run > 0)) return [];
        const lines = Math.max(1, ceil(run / longest));
        return [{ runs: lines, span: run / lines }];
      };
      const gridSegments = [
        { runs: grid.ny, span: level.floor.lengthFeet },
        { runs: grid.nx, span: level.floor.widthFeet },
        { runs: s.extraBeamFeet > 0 ? 1 : 0, span: s.extraBeamFeet },
      ];
      const beamTypes: BeamAt[] = !level.slab
        ? design?.plinthBeams?.length
          ? design.plinthBeams
              .filter(
                (type) =>
                  type.count > 0 &&
                  type.lengthFeet > 0 &&
                  parseBars(type.bars).length > 0,
              )
              .map((type) => ({
                label: type.label,
                widthIn: type.widthIn,
                depthIn: type.depthIn,
                bars: parseBars(type.bars).map((bar) => ({
                  ...bar,
                  label: 'main',
                })),
                stirrupDia: type.stirrupDia,
                stirrupSpacingIn: type.stirrupSpacingIn,
                segments: [{ runs: type.count, span: type.lengthFeet }],
              }))
          : [
              {
                label: 'Plinth beam',
                widthIn: s.plinthBeamWidthIn,
                depthIn: s.plinthBeamDepthIn,
                bars: [
                  {
                    dia: s.plinthBeamBarDia,
                    count: s.plinthBeamBarCount,
                    label: 'main',
                  },
                ],
                stirrupDia: s.plinthBeamStirrupDia || s.beamStirrupDia,
                stirrupSpacingIn:
                  s.plinthBeamStirrupSpacingIn || s.beamStirrupSpacingIn,
                segments: design?.plinthRunFeet
                  ? runSegments(design.plinthRunFeet)
                  : gridSegments,
              },
            ]
        : design?.beams.length
          ? design.beams
              .filter((type) => parseBars(type.bars).length > 0)
              .map((type) => ({
                label: type.label,
                widthIn: type.widthIn,
                depthIn: type.depthIn,
                bars: parseBars(type.bars).map((bar) => ({
                  ...bar,
                  label: 'main',
                })),
                stirrupDia: type.stirrupDia,
                stirrupSpacingIn: type.stirrupSpacingIn,
                segments:
                  type.countsByFloor?.[level.index] &&
                  type.countsByFloor[level.index]! > 0
                    ? [
                        {
                          runs: type.countsByFloor[level.index]!,
                          span:
                            (type.runFeet[level.index] ?? 0) /
                            type.countsByFloor[level.index]!,
                        },
                      ]
                    : runSegments(
                        type.runFeet[level.index] ?? type.runFeet.at(-1) ?? 0,
                      ),
              }))
          : [
              {
                label: 'Beams',
                widthIn: s.beamWidthIn,
                depthIn: s.beamDepthIn,
                bars: [
                  { dia: s.beamTopDia, count: s.beamTopCount, label: 'top' },
                  {
                    dia: s.beamBottomDia,
                    count: s.beamBottomCount,
                    label: 'bottom',
                  },
                  {
                    dia: s.beamExtraDia,
                    count: s.beamExtraCount,
                    label: 'extra',
                  },
                ],
                stirrupDia: s.beamStirrupDia,
                stirrupSpacingIn: s.beamStirrupSpacingIn,
                segments: gridSegments,
              },
            ];
      let concrete = 0;
      let shuttering = 0;
      let totalRun = 0;
      for (const type of beamTypes) {
        const segments = type.segments.filter(
          (segment) => segment.runs > 0 && segment.span > 0,
        );
        const run = segments.reduce(
          (sum, segment) => sum + segment.runs * segment.span,
          0,
        );
        if (!(run > 0)) continue;
        totalRun += run;
        const beamB = type.widthIn / 12;
        const beamD = type.depthIn / 12;
        // Beams: continuous bars along every line, anchored at both ends.
        for (const bar of type.bars.filter(
          (item) => item.dia > 0 && item.count > 0,
        )) {
          const lap = lapFeet(bar.dia, s.lapDiameters);
          const anchor = 2 * lap;
          let bars = 0;
          let metres = 0;
          for (const segment of segments) {
            const plan = cutPlan(
              segment.span + anchor,
              segment.runs * bar.count,
              stock,
              lap,
            );
            bars += plan.bars;
            metres += plan.bars * stock * M_PER_FT;
          }
          addSteel(
            beamTally,
            bar.dia,
            metres,
            bars,
            `${level.name} ${type.label} ${bar.label === 'main' ? '' : `${bar.label} `}${bar.count} bars × ${ft(run)} run`,
          );
        }
        const stirrupLength =
          2 *
            (Math.max(0, beamB - 2 * beamCover) +
              Math.max(0, beamD - 2 * beamCover)) +
          20 * type.stirrupDia * FT_PER_MM;
        const stirrups = segments.reduce(
          (sum, segment) =>
            sum +
            segment.runs *
              (ceil((segment.span * 12) / type.stirrupSpacingIn) + 1),
          0,
        );
        const stirrupBars = cutPlan(stirrupLength, stirrups, stock, 0).bars;
        addSteel(
          beamTally,
          type.stirrupDia,
          stirrupBars * stock * M_PER_FT,
          stirrupBars,
          `${type.label} ${stirrups} stirrups × ${ft(stirrupLength)}`,
        );
        const below = level.slab ? Math.max(0, beamD - slabT) : beamD;
        concrete += run * beamB * below * CUM_PER_CFT;
        shuttering += run * (beamB + 2 * below);
      }
      // Incomplete new schedule rows must not resurrect the old, estimated
      // plinth grid or generate a zero-length structural line.
      if (!level.slab && design?.plinthBeams?.length && !(totalRun > 0))
        continue;
      const beamConcrete = concrete;
      const beamShuttering = shuttering;
      let slabArea = level.floor.lengthFeet * level.floor.widthFeet;
      let slabDrawing = `${s.slabThicknessIn} in · ${s.slabMainDia} mm @ ${s.slabMainSpacingIn} in / ${s.slabDistDia} mm @ ${s.slabDistSpacingIn} in`;
      if (level.slab) {
        const panels =
          design?.slabPanels?.filter((panel) => panel.floor === level.stage) ??
          [];
        if (panels.length) {
          slabArea = 0;
          slabDrawing = panels
            .map(
              (panel) =>
                `${panel.label} ${panel.count}×${panel.lengthFeet}×${panel.widthFeet} ft / ${panel.thicknessIn} in`,
            )
            .join(', ')
            .slice(0, 240);
          for (const panel of panels) {
            if (!(
              panel.count > 0 &&
              panel.lengthFeet > 0 &&
              panel.widthFeet > 0 &&
              panel.thicknessIn > 0
            ))
              continue;
            const area = panel.count * panel.lengthFeet * panel.widthFeet;
            slabArea += area;
            concrete += area * (panel.thicknessIn / 12) * CUM_PER_CFT;
            shuttering += area;
            if (!panel.reinforcement.length)
              warnings.push(
                `${level.stage} ${panel.label}: enter slab reinforcement from the drawing; no steel assumed.`,
              );
            for (const bar of panel.reinforcement) {
              if (!(bar.dia > 0 && bar.spacingIn > 0)) continue;
              const span =
                bar.direction === 'length' ? panel.lengthFeet : panel.widthFeet;
              const across =
                bar.direction === 'length' ? panel.widthFeet : panel.lengthFeet;
              const pieces =
                panel.count *
                (Math.floor(
                  (Math.max(0, across - 2 * slabCover) * 12) / bar.spacingIn,
                ) +
                  1);
              const lap = lapFeet(bar.dia, s.lapDiameters);
              const piece =
                Math.max(0, span - 2 * slabCover) +
                2 * Math.max(0.5, 0.5 * lap);
              const plan = cutPlan(piece, pieces, stock, lap);
              addSteel(
                slabTally,
                bar.dia,
                plan.bars * stock * M_PER_FT,
                plan.bars,
                `${level.stage} ${panel.label} ${bar.layer} ${bar.direction} ${pieces} pcs × ${ft(piece)}`,
              );
            }
          }
        } else {
          const area = level.floor.lengthFeet * level.floor.widthFeet;
          concrete += area * slabT * CUM_PER_CFT;
          shuttering += area;
          for (const bar of [
            {
              dia: s.slabMainDia,
              spacing: s.slabMainSpacingIn,
              span: Math.min(level.floor.lengthFeet, level.floor.widthFeet),
              across: Math.max(level.floor.lengthFeet, level.floor.widthFeet),
              label: 'main',
              extra: 1 + s.slabExtraTopPercent / 100,
            },
            {
              dia: s.slabDistDia,
              spacing: s.slabDistSpacingIn,
              span: Math.max(level.floor.lengthFeet, level.floor.widthFeet),
              across: Math.min(level.floor.lengthFeet, level.floor.widthFeet),
              label: 'distribution',
              extra: 1,
            },
          ].filter((item) => item.dia > 0)) {
            const count = ceil(
              ((Math.max(0, bar.across - 2 * slabCover) * 12) / bar.spacing +
                1) *
                bar.extra,
            );
            const lap = lapFeet(bar.dia, s.lapDiameters);
            const piece = bar.span + 2 * Math.max(0.5, 0.5 * lap);
            const plan = cutPlan(piece, count, stock, lap);
            addSteel(
              slabTally,
              bar.dia,
              plan.bars * stock * M_PER_FT,
              plan.bars,
              `${level.name} slab ${bar.label} ${count} pcs × ${ft(piece)}`,
            );
          }
        }
      }
      if (splitBeamSlab && level.slab) {
        // Each shared roof line used to include beam + slab concrete, steel
        // and shuttering together. Split those measured quantities at source
        // so each stage card owns its own materials without double counting.
        mergeSteel(beamTally);
        mergeSteel(slabTally);
        if (totalRun > 0) {
          drafts.push({
            origin: 'quotation-structure',
            draft: {
              name: `${level.name}: beams (${round(totalRun, 0)} rft)`,
              section: level.stage,
              kind: 'quote-beams',
              unit: 'm³',
              inputs: { beamRunFeet: round(totalRun, 1) },
              outputs: [
                ...concreteOutputs(beamConcrete, 'Beam', s),
                ...steelOutputs(beamTally, stock),
                {
                  name: 'Beam centering & shuttering',
                  ...(s.labourItemized ? { material: 'shuttering' } : {}),
                  quantity: round(beamShuttering, 0),
                  unit: 'sqft',
                },
              ],
            },
          });
        }
        drafts.push({
          origin: 'quotation-structure',
          draft: {
            name: `${level.name}: slab (${round(slabArea, 0)} sqft)`,
            section: level.stage,
            kind: 'quote-slab',
            unit: 'm³',
            inputs: {
              slab: slabDrawing,
            },
            outputs: [
              ...concreteOutputs(concrete - beamConcrete, 'Slab', s),
              ...steelOutputs(slabTally, stock),
              {
                name: 'Slab centering & shuttering',
                ...(s.labourItemized ? { material: 'shuttering' } : {}),
                quantity: round(shuttering - beamShuttering, 0),
                unit: 'sqft',
              },
            ],
          },
        });
        continue;
      }
      mergeSteel(tally);
      outputs.push(
        ...concreteOutputs(
          concrete,
          level.slab ? 'Beam + slab' : 'Plinth beam',
          s,
        ),
        ...steelOutputs(tally, stock),
        {
          name: 'Centering & shuttering',
          ...(s.labourItemized ? { material: 'shuttering' } : {}),
          quantity: round(shuttering, 0),
          unit: 'sqft',
        },
      );
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: level.slab
            ? `${level.name} slab + beams (${round(level.floor.lengthFeet * level.floor.widthFeet, 0)} sqft)`
            : `Plinth beams (${round(totalRun, 0)} rft)`,
          section: level.stage,
          kind: level.slab ? 'quote-slab' : 'quote-plinth-beam',
          unit: 'm³',
          inputs: {
            beamRunFeet: round(totalRun, 1),
            beam: beamTypes
              .map((type) => `${type.label} ${type.widthIn}×${type.depthIn} in`)
              .join(', ')
              .slice(0, 200),
            ...(level.slab
              ? {
                  slab: `${s.slabThicknessIn} in · ${s.slabMainDia} mm @ ${s.slabMainSpacingIn} in / ${s.slabDistDia} mm @ ${s.slabDistSpacingIn} in`,
                }
              : {}),
          },
          outputs,
        },
      });
    }

    // --- Masonry and plaster per floor ------------------------------------
    for (const floor of floors) {
      const perimeter = 2 * (floor.lengthFeet + floor.widthFeet);
      const wallHeight = Math.max(0, floor.heightFeet - s.beamDepthIn / 12);
      const parkingShare =
        (floor.parkingSqft ?? 0) / Math.max(1, floor.areaSqft);
      const wallShare =
        1 - parkingShare + (parkingShare * s.parkingWallPercent) / 100;
      const solid = (1 - s.openingsPercent / 100) * wallShare;
      const drawnWalls = counts.walls?.[floor.name] ?? [];
      const measured = drawnWalls.length > 0;
      const fc = counts.floors[floor.name]!;
      const floorDoorSizes = counts.doorSizes?.[floor.name];
      // A schedule is authoritative; do not apply the general openings % on
      // top of door/window size deductions.
      const openingArea = (
        key:
          | 'mainDoors'
          | 'internalDoors'
          | 'bathroomDoors'
          | 'poojaDoors'
          | 'ventilators'
          | 'rollingShutters',
        typicalWidth: number,
        typicalHeight: number,
      ) => {
        const entered = parseOpenings(floorDoorSizes?.[key]);
        const n = fc[key];
        if (entered.length) {
          const enteredCount = entered.reduce((sum, row) => sum + row.count, 0);
          if (enteredCount !== n)
            warnings.push(
              `${floor.name}: ${key} size schedule lists ${enteredCount} openings but count is ${n}; verify the drawing.`,
            );
          return entered.reduce(
            (sum, row) => sum + row.count * row.widthFeet * row.heightFeet,
            0,
          );
        }
        if (n > 0 && measured)
          warnings.push(
            `${floor.name}: ${key} sizes not entered; ${typicalWidth}×${typicalHeight} ft assumed for masonry deduction.`,
          );
        return n * typicalWidth * typicalHeight;
      };
      const windowOpenings = parseOpenings(counts.windowSizes?.[floor.name]);
      const scheduledWindowCount = windowOpenings.reduce(
        (sum, row) => sum + row.count,
        0,
      );
      if (
        measured &&
        windowOpenings.length &&
        scheduledWindowCount !== fc.windows
      )
        warnings.push(
          `${floor.name}: window schedule lists ${scheduledWindowCount} windows; count is ${fc.windows}.`,
        );
      if (measured && !windowOpenings.length && fc.windows > 0)
        warnings.push(
          `${floor.name}: window sizes not entered; ${s.windowSqft} sq ft/window assumed for masonry deduction.`,
        );
      const externalOpenings =
        openingArea('mainDoors', 3.5, 7) +
        openingArea('ventilators', 2, 1.5) +
        openingArea('rollingShutters', 8, 8) +
        (windowOpenings.length
          ? windowOpenings.reduce(
              (sum, row) => sum + row.count * row.widthFeet * row.heightFeet,
              0,
            )
          : fc.windows * s.windowSqft);
      const internalOpenings =
        openingArea('internalDoors', 3, 7) +
        openingArea('bathroomDoors', 2.5, 7) +
        openingArea('poojaDoors', 2.5, 7);
      const grossExt = drawnWalls
        .filter((row) => row.location === 'external')
        .reduce(
          (sum, row) => sum + row.count * row.lengthFeet * row.heightFeet,
          0,
        );
      const grossInt = drawnWalls
        .filter((row) => row.location === 'internal')
        .reduce(
          (sum, row) => sum + row.count * row.lengthFeet * row.heightFeet,
          0,
        );
      if (measured && externalOpenings > grossExt)
        warnings.push(
          `${floor.name}: external openings exceed drawn external wall area.`,
        );
      if (measured && internalOpenings > grossInt)
        warnings.push(
          `${floor.name}: internal openings exceed drawn internal wall area.`,
        );
      const netExternal = Math.max(0, grossExt - externalOpenings);
      const netInternal = Math.max(0, grossInt - internalOpenings);
      const externalArea = measured
        ? netExternal
        : perimeter * wallHeight * solid;
      const internalArea = measured
        ? netInternal
        : perimeter * s.internalWallRatio * wallHeight * solid;
      const internalPlaster = externalArea + 2 * internalArea;
      const externalPlaster = externalArea * (measured ? 1 : 1.1);
      wallsByFloor.set(floor.name, { internalPlaster, externalPlaster });
      const internalCoats: 1 | 2 =
        counts.finishes?.[floor.name]?.internalPlasterCoats === 2 ? 2 : 1;
      const externalCoats: 1 | 2 =
        counts.finishes?.[floor.name]?.externalPlasterCoats === 2 ? 2 : 1;
      const plaster = plasterMaterialTakeoff(
        internalPlaster,
        externalPlaster,
        internalCoats,
        externalCoats,
        s.materialWastagePercent,
      );
      const measuredWallOutputs: GeneratedOutput[] = [];
      let volume = 0;
      if (measured || splitBeamSlab) {
        const rows = measured
          ? drawnWalls
          : [
              {
                id: 'estimate-external',
                name: 'External wall estimate',
                location: 'external' as const,
                count: 1,
                lengthFeet: externalArea,
                heightFeet: 1,
                thicknessIn: s.externalWallIn,
              },
              {
                id: 'estimate-internal',
                name: 'Internal wall estimate',
                location: 'internal' as const,
                count: 1,
                lengthFeet: internalArea,
                heightFeet: 1,
                thicknessIn: s.internalWallIn,
              },
            ];
        const waste = 1 + s.materialWastagePercent / 100;
        let bricks = 0;
        let cementBrickwork = 0;
        let sandBrickwork = 0;
        for (const row of rows) {
          const gross = row.count * row.lengthFeet * row.heightFeet;
          const ratio = !measured
            ? 1
            : row.location === 'external'
              ? grossExt > 0
                ? netExternal / grossExt
                : 0
              : grossInt > 0
                ? netInternal / grossInt
                : 0;
          const netArea = gross * ratio;
          if (!(netArea > 0)) continue;
          const thick = row.thicknessIn >= 6 ? '9' : '4';
          const rules =
            thick === '9'
              ? {
                  bricks: s.masonryBricksPer100Sqft9,
                  cement: s.masonryCementBagsPer100Sqft9,
                  sand: s.masonrySandM3Per100Sqft9,
                }
              : {
                  bricks: s.masonryBricksPer100Sqft4,
                  cement: s.masonryCementBagsPer100Sqft4,
                  sand: s.masonrySandM3Per100Sqft4,
                };
          bricks += (netArea * rules.bricks) / 100;
          cementBrickwork += (netArea * rules.cement) / 100;
          sandBrickwork += (netArea * rules.sand) / 100;
          volume += netArea * (row.thicknessIn / 12) * CUM_PER_CFT;
          measuredWallOutputs.push(
            wallOutput(
              `${row.name} (${row.location})`,
              row.thicknessIn,
              netArea,
              s,
            ),
          );
        }
        measuredWallOutputs.push(
          {
            name: 'Bricks',
            material: 'bricks',
            quantity: ceil(bricks * waste),
            unit: 'nos',
            source: 'Net measured wall area × configured bricks per 100 sq ft',
          },
          {
            name: 'Cement (brickwork)',
            material: 'cement_masonry',
            quantity: round(cementBrickwork * waste, 1),
            unit: 'bag',
            source: 'Net measured wall area × configured bags per 100 sq ft',
          },
          sandOutput(sandBrickwork * waste, s, 'Sand (brickwork)'),
          {
            name: 'Cement (plaster)',
            material: 'cement_masonry',
            quantity: round(plaster.cementBags, 1),
            unit: 'bag',
            source: `${internalCoats} internal / ${externalCoats} external coat(s) from measured wall faces + ${s.materialWastagePercent}% waste`,
          },
          {
            ...sandOutput(plaster.sandM3, s, 'Sand (plaster)'),
            source: `${internalCoats} internal / ${externalCoats} external coat(s) from measured wall faces + ${s.materialWastagePercent}% waste`,
          },
          ...(internalPlaster > 0
            ? [
                {
                  name: 'Internal plaster',
                  ...(s.labourItemized ? { material: 'plaster_labour' } : {}),
                  quantity: round(internalPlaster, 0),
                  unit: 'sqft',
                },
              ]
            : []),
          ...(externalPlaster > 0
            ? [
                {
                  name: 'External plaster',
                  ...(s.labourItemized ? { material: 'plaster_labour' } : {}),
                  quantity: round(externalPlaster, 0),
                  unit: 'sqft',
                },
              ]
            : []),
          ...(s.labourItemized && internalCoats === 2 && internalPlaster > 0
            ? [
                {
                  name: 'Internal plaster second coat',
                  material: 'plaster_labour',
                  quantity: round(internalPlaster, 0),
                  unit: 'sqft',
                  source: 'Second 6 mm coat; confirm separate labour rate',
                },
              ]
            : []),
          ...(s.labourItemized && externalCoats === 2 && externalPlaster > 0
            ? [
                {
                  name: 'External plaster second coat',
                  material: 'plaster_labour',
                  quantity: round(externalPlaster, 0),
                  unit: 'sqft',
                  source: 'Second 6 mm coat; confirm separate labour rate',
                },
              ]
            : []),
        );
      } else {
        volume =
          (externalArea * (s.externalWallIn / 12) +
            internalArea * (s.internalWallIn / 12)) *
          CUM_PER_CFT;
      }
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: `${floor.name}: brickwork + plaster`,
          section: floor.name,
          kind: 'quote-masonry',
          unit: 'sqft',
          inputs: {
            externalWallFeet: measured
              ? round(grossExt, 1)
              : round(perimeter, 1),
            internalWallFeet: measured
              ? round(grossInt, 1)
              : round(perimeter * s.internalWallRatio, 1),
            wallHeightFeet: round(wallHeight, 2),
            openings: measured
              ? `${round(externalOpenings + internalOpenings, 1)} sqft from openings schedule`
              : `${s.openingsPercent}%`,
          },
          outputs:
            measured || splitBeamSlab
              ? measuredWallOutputs
              : [
                  wallOutput(
                    'external wall',
                    s.externalWallIn,
                    externalArea,
                    s,
                  ),
                  wallOutput(
                    'internal wall',
                    s.internalWallIn,
                    internalArea,
                    s,
                  ),
                  ...brickworkOutputs(
                    volume,
                    internalPlaster,
                    externalPlaster,
                    s,
                    internalCoats,
                    externalCoats,
                  ),
                ],
        },
      });
    }

    // --- Parapet walls and terrace waterproofing -------------------------
    // The roof edge is the widest floor's perimeter (open terrace around a
    // smaller penthouse); a smaller top floor adds its own roof parapet.
    const top = floors[floors.length - 1]!;
    const widest = floors.reduce((a, b) =>
      b.lengthFeet * b.widthFeet > a.lengthFeet * a.widthFeet ? b : a,
    );
    if (s.parapetHeightFeet > 0) {
      const edge = 2 * (widest.lengthFeet + widest.widthFeet);
      const topIsSmaller =
        top !== widest &&
        top.lengthFeet * top.widthFeet < widest.lengthFeet * widest.widthFeet;
      const perimeter =
        edge + (topIsSmaller ? 2 * (top.lengthFeet + top.widthFeet) : 0);
      const area = perimeter * s.parapetHeightFeet;
      const volume = area * (s.parapetWallIn / 12) * CUM_PER_CFT;
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: `${top.name}: parapet wall (${s.parapetHeightFeet} ft) + terrace waterproofing`,
          section: top.name,
          kind: 'quote-parapet',
          unit: 'sqft',
          inputs: {
            parapetFeet: round(perimeter, 1),
            heightFeet: s.parapetHeightFeet,
            thickness: `${s.parapetWallIn} in`,
          },
          outputs: [
            wallOutput('parapet wall', s.parapetWallIn, area, s),
            ...brickworkOutputs(volume, 0, 2 * area, s),
            {
              name: 'Terrace waterproofing',
              material: 'waterproofing',
              quantity: round(widest.lengthFeet * widest.widthFeet, 0),
              unit: 'sqft',
              source: topIsSmaller ? 'Open terrace and top roof' : 'Top roof',
            },
          ],
        },
      });
    }

    // --- Staircases: per-floor drawing types or the legacy company rule ----
    for (const floor of floors) {
      const measuredStairs =
        design?.staircases?.filter((stair) => stair.floor === floor.name) ?? [];
      const staircaseTypes: DesignStairType[] = measuredStairs.length
        ? measuredStairs
        : s.stairsPerFloor > 0
          ? [
              {
                label: 'Staircase',
                floor: floor.name,
                count: s.stairsPerFloor,
                widthFeet: s.stairWidthFeet,
                riserIn: s.stairRiserIn,
                treadIn: s.stairTreadIn,
                waistIn: s.stairWaistIn,
                landingFeet: s.stairLandingFeet,
                reinforcement: [
                  {
                    role: 'main',
                    dia: s.stairMainDia,
                    spacingIn: s.stairBarSpacingIn,
                  },
                  {
                    role: 'distribution',
                    dia: s.stairDistDia,
                    spacingIn: s.stairBarSpacingIn,
                  },
                ],
              },
            ]
          : [];
      for (const stair of staircaseTypes) {
        if (!(
          stair.count > 0 &&
          stair.widthFeet > 0 &&
          stair.riserIn > 0 &&
          stair.treadIn > 0 &&
          stair.waistIn > 0
        ))
          continue;
        const risers = ceil((floor.heightFeet * 12) / stair.riserIn);
        const flightRise = floor.heightFeet / 2;
        const flightRun = ((risers / 2) * stair.treadIn) / 12;
        const flight = Math.hypot(flightRun, flightRise);
        const slabArea =
          2 * flight * stair.widthFeet + stair.landingFeet * stair.widthFeet;
        const steps =
          risers *
          0.5 *
          (stair.treadIn / 12) *
          (stair.riserIn / 12) *
          stair.widthFeet;
        const volume =
          stair.count * ((slabArea * stair.waistIn) / 12 + steps) * CUM_PER_CFT;
        const tally: SteelTally = new Map();
        if (!stair.reinforcement.length)
          warnings.push(
            `${floor.name} ${stair.label}: no staircase reinforcement entered; no steel inferred.`,
          );
        for (const bar of stair.reinforcement) {
          if (!(bar.dia > 0 && bar.spacingIn > 0)) continue;
          const spacing = bar.spacingIn / 12;
          const isMain = bar.role === 'main';
          const pieces = isMain
            ? stair.count * 2 * (Math.floor(stair.widthFeet / spacing) + 1)
            : stair.count *
              (2 * (Math.floor(flight / spacing) + 1) +
                Math.floor(stair.landingFeet / spacing) +
                1);
          const lap = isMain ? lapFeet(bar.dia, s.lapDiameters) : 0;
          const length = isMain
            ? flight + stair.landingFeet / 2 + 1.5
            : stair.widthFeet;
          const plan = cutPlan(length, pieces, stock, lap);
          addSteel(
            tally,
            bar.dia,
            plan.bars * stock * M_PER_FT,
            plan.bars,
            `${floor.name} ${stair.label} ${bar.role} ${pieces} pcs × ${ft(length)}`,
          );
        }
        mergeSteel(tally);
        drafts.push({
          origin: 'quotation-structure',
          draft: {
            name: measuredStairs.length
              ? `${floor.name}: ${stair.label} (${stair.count} × ${risers} risers)`
              : `${floor.name}: staircase (${stair.count} × ${risers} risers)`,
            section: floor.name,
            kind: 'quote-staircase',
            unit: 'm³',
            inputs: {
              risers,
              widthFeet: stair.widthFeet,
              waist: `${stair.waistIn} in`,
            },
            outputs: [
              ...concreteOutputs(volume, 'Staircase', s),
              ...steelOutputs(tally, stock),
              {
                name: 'Centering & shuttering',
                ...(s.labourItemized ? { material: 'shuttering' } : {}),
                quantity: round(stair.count * slabArea, 0),
                unit: 'sqft',
              },
            ],
          },
        });
      }
    }
    // Order structure stage by stage: Foundation, then each floor.
    const stageOrder = ['Foundation', ...floors.map((floor) => floor.name)];
    const rank = (section: string) => {
      const index = stageOrder.indexOf(section);
      return index < 0 ? stageOrder.length : index;
    };
    drafts.sort((a, b) => rank(a.draft.section) - rank(b.draft.section));
    // Binding wire per stage, so each floor's steel order is complete.
    const stageKg = new Map<string, number>();
    for (const { draft } of drafts)
      for (const output of draft.outputs)
        if (output.material === 'steel' && output.weightKg)
          stageKg.set(
            draft.section,
            (stageKg.get(draft.section) ?? 0) + output.weightKg,
          );
    for (const [stage, kg] of stageKg) {
      const index = drafts.reduce(
        (last, { draft }, i) => (draft.section === stage ? i : last),
        -1,
      );
      drafts.splice(index + 1, 0, {
        origin: 'quotation-structure',
        draft: {
          name: `${stage}: binding wire`,
          section: stage,
          kind: 'quote-binding-wire',
          unit: 'kg',
          inputs: { steelKg: round(kg, 0) },
          outputs: [
            {
              name: 'Binding wire',
              material: 'binding_wire',
              quantity: round(kg * 0.008, 1),
              unit: 'kg',
              source: '8 kg per tonne of reinforcement',
            },
          ],
        },
      });
    }
  }

  // --- Package allowances → categories counted floor by floor -----------
  const builtUp = floors.reduce((sum, floor) => sum + floor.areaSqft, 0);
  const allowances = new Map<
    AllowanceCategory,
    { rate: number; label: string; extra: boolean }
  >();
  // A floor-specific specification such as "First Floor main door" overrides
  // the general main-door limit only for that floor.
  const floorAllowances = new Map<
    string,
    Map<AllowanceCategory, { rate: number; label: string; extra: boolean }>
  >();
  const unmatched: {
    section: NonNullable<SftEstimateDetails['sections']>[number];
    allowance: number;
    unit: string;
    extra: boolean;
  }[] = [];
  for (const section of input.details.sections ?? []) {
    const allowance = Number(
      section.allowanceValue || section.allowancePerSqft || '',
    );
    const treatment =
      section.pricingTreatment ?? (allowance > 0 ? 'allowance' : 'included');
    if (
      !(allowance > 0) ||
      treatment === 'excluded' ||
      treatment === 'included'
    )
      continue;
    const unit =
      section.unit && section.unit !== 'none'
        ? section.unit
        : section.allowancePerSqft
          ? 'sqft'
          : 'none';
    if (unit === 'none') continue;
    const label = [section.title, section.brand, section.grade]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 160);
    const categories = allowanceCategories(section.title, unit);
    if (!categories.length) {
      unmatched.push({
        section,
        allowance,
        unit,
        extra: treatment === 'extra',
      });
      continue;
    }
    const quoted = { rate: allowance, label, extra: treatment === 'extra' };
    const scopedFloor = floors.find((floor) => {
      const prefix = floor.name.toLowerCase();
      const title = section.title.toLowerCase();
      return (
        title.startsWith(prefix) && /[\s:—-]/.test(title.charAt(prefix.length))
      );
    });
    const target = scopedFloor
      ? (floorAllowances.get(scopedFloor.name) ??
        new Map<AllowanceCategory, typeof quoted>())
      : allowances;
    for (const category of categories)
      if (!target.has(category)) target.set(category, quoted);
    if (scopedFloor) floorAllowances.set(scopedFloor.name, target);
  }
  // A generic "Internal doors" allowance also covers bathroom and pooja
  // doors unless the package prices those separately.
  // Finish descriptions from the final quote can vary by package.
  // Avoid calling Royal granite "tiles" or a three-coat paint system "two coats".
  // These descriptions are not supplier prices or measured ceiling heights.
  const packageSpecs = input.details.sections ?? [];
  const parkingIsGranite = packageSpecs.some(
    (spec) =>
      /parking/i.test(spec.title) &&
      /granite/i.test(spec.title + ' ' + spec.description),
  );
  const interiorHasThreeCoats = packageSpecs.some(
    (spec) =>
      /interior.*paint/i.test(spec.title) &&
      /(?:emulsion|paint)[^;]*\b3\s*coats\b/i.test(spec.description),
  );
  const bathroomTilesToCeiling = packageSpecs.some(
    (spec) =>
      /bathroom.*wall.*til/i.test(spec.title) &&
      /ceiling/i.test(spec.description),
  );
  const included = new Set<AllowanceCategory>();
  const generic = allowances.get('internalDoors');
  if (generic) {
    if (!allowances.has('bathroomDoors'))
      allowances.set('bathroomDoors', generic);
    if (!allowances.has('poojaDoors')) allowances.set('poojaDoors', generic);
  }
  const item = (
    category: AllowanceCategory,
    name: string,
    quantity: number,
    unit: string,
    material: string,
    source?: string,
    floorName?: string,
  ): GeneratedOutput[] => {
    if (!(quantity > 0) || included.has(category)) return [];
    const quoted =
      (floorName ? floorAllowances.get(floorName)?.get(category) : undefined) ??
      allowances.get(category);
    // Quantities only come from the quotation; the cost comes from the rate
    // card. The quoted allowance is kept for comparison.
    return [
      {
        name,
        quantity: round(quantity, 2),
        unit,
        material,
        ...(quoted ? { quotedRate: quoted.rate } : {}),
        ...(source || quoted
          ? {
              source: [
                source,
                quoted
                  ? `quoted ${quoted.extra ? 'extra' : 'allowance'}: ${quoted.label}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')
                .slice(0, 300),
            }
          : {}),
      },
    ];
  };

  // --- Finishes, services and labour, floor by floor ---------------------
  for (const floor of floors) {
    const fc = counts.floors[floor.name]!;
    const walls = wallsByFloor.get(floor.name) ?? {
      internalPlaster: 0,
      externalPlaster: 0,
    };
    const doors =
      fc.mainDoors + fc.internalDoors + fc.bathroomDoors + fc.poojaDoors;
    // Window area from the plan's sizes when entered, else typical size.
    const openings = parseOpenings(counts.windowSizes?.[floor.name]);
    const windowArea = openings.length
      ? openings.reduce(
          (sum, opening) =>
            sum + opening.count * opening.widthFeet * opening.heightFeet,
          0,
        )
      : fc.windows * s.windowSqft;
    const windowBasis = openings.length
      ? openings
          .map(
            (opening) =>
              `${opening.count} × ${opening.widthFeet}×${opening.heightFeet} ft`,
          )
          .join(' + ')
      : `${fc.windows} windows × ${s.windowSqft} sq ft`;
    const living = livingSqft(floor);
    const parking = floor.parkingSqft ?? 0;
    // --- Tiles from the rooms / sizes entered, else estimates ---------
    const fin = counts.finishes?.[floor.name];
    const rooms = (fin?.rooms ?? []).filter(
      (room) => room.lengthFeet > 0 && room.widthFeet > 0,
    );
    const roomArea = fin?.excludeRoomFlooring
      ? 0
      : rooms.length
        ? rooms.reduce((sum, room) => sum + room.lengthFeet * room.widthFeet, 0)
        : (living * s.tileCoveragePercent) / 100;
    const skirting =
      !fin?.excludeRoomFlooring && rooms.length
        ? rooms.reduce(
            (sum, room) =>
              sum +
              2 *
                (room.lengthFeet + room.widthFeet) *
                (s.skirtingHeightIn / 12),
            0,
          )
        : 0;
    const floorTiles = roomArea + skirting;
    const bathL = fin?.bathroomLengthFeet || s.bathroomLengthFeet;
    const bathW = fin?.bathroomWidthFeet || s.bathroomWidthFeet;
    // Each bathroom as drawn; any not listed use the typical size above.
    const listedBaths = parseSizes(fin?.bathroomSizes).slice(0, fc.bathrooms);
    const baths = [
      ...listedBaths,
      ...Array.from(
        { length: Math.max(0, fc.bathrooms - listedBaths.length) },
        () => ({ lengthFeet: bathL, widthFeet: bathW }),
      ),
    ];
    const bathSizesText = listedBaths.length
      ? baths
          .map(
            (bath) =>
              `${round(bath.lengthFeet, 2)}×${round(bath.widthFeet, 2)}`,
          )
          .join(' + ') + ' ft'
      : '';
    const bathFloor = baths.reduce(
      (sum, bath) => sum + bath.lengthFeet * bath.widthFeet,
      0,
    );
    // Walls up to the tile height, less one 2.5 × 7 ft door per bathroom.
    const wallTiles = baths.reduce(
      (sum, bath) =>
        sum +
        Math.max(
          0,
          2 * (bath.lengthFeet + bath.widthFeet) * s.wallTileHeightFeet -
            2.5 * Math.min(7, s.wallTileHeightFeet),
        ),
      0,
    );
    const bathWaterproofing = baths.reduce(
      (sum, bath) =>
        sum +
        bath.lengthFeet * bath.widthFeet +
        2 * (bath.lengthFeet + bath.widthFeet),
      0,
    );
    const listedCount = parseSizes(fin?.bathroomSizes).length;
    if (listedCount && listedCount !== fc.bathrooms)
      warnings.push(
        `${floor.name}: ${listedCount} bathroom sizes entered for ${fc.bathrooms} bathrooms.`,
      );
    const windowCount = openings.reduce((sum, item) => sum + item.count, 0);
    if (openings.length && windowCount !== fc.windows)
      warnings.push(
        `${floor.name}: window sizes list ${windowCount} windows; the count says ${fc.windows}.`,
      );
    const platformFeet = fin?.kitchenPlatformFeet || s.kitchenPlatformFeet;
    const kitchens = fin?.kitchenMeasurements;
    const kitchenCount = kitchens === undefined ? fc.kitchens : kitchens.length;
    const kitchenGranite =
      kitchens === undefined
        ? fc.kitchens * platformFeet * s.kitchenPlatformDepthFeet
        : kitchens.reduce(
            (sum, kitchen) =>
              sum + kitchen.platformFeet * kitchen.platformDepthFeet,
            0,
          );
    const kitchenTiles =
      kitchens === undefined
        ? fc.kitchens * platformFeet * s.kitchenWallTileHeightFeet
        : kitchens.reduce(
            (sum, kitchen) =>
              sum + kitchen.wallTileFeet * kitchen.wallTileHeightFeet,
            0,
          );
    const tileWastePercent = fin?.tileWastagePercent ?? s.tileWastagePercent;
    const tileWaste = 1 + tileWastePercent / 100;
    /** Area to buy (with wastage) and the tiles / boxes to order. */
    const tileOrder = (
      area: number,
      lengthIn: number,
      widthIn: number,
      perBox: number,
    ) => {
      const buy = area * tileWaste;
      const tiles = ceil(buy / ((lengthIn * widthIn) / 144));
      return {
        quantity: round(buy, 1),
        order: `${tiles} tiles of ${round(lengthIn / 12, 2)}×${round(widthIn / 12, 2)} ft · ${ceil(tiles / perBox)} boxes of ${perBox}`,
      };
    };
    const interiorPaint = walls.internalPlaster + floor.areaSqft;
    const exteriorPaint = walls.externalPlaster;
    // Staircase flooring: treads and risers of each flight plus the landing.
    const risers = ceil((floor.heightFeet * 12) / s.stairRiserIn);
    const stairGranite =
      fin?.staircaseGraniteSqft ??
      s.stairsPerFloor *
        s.stairWidthFeet *
        (risers * ((s.stairTreadIn + s.stairRiserIn) / 12) +
          s.stairLandingFeet);
    const finishLine = (
      kind: string,
      title: string,
      outputs: GeneratedOutput[],
      inputs: Record<string, string | number>,
    ) => {
      if (outputs.length)
        drafts.push({
          origin: 'quotation-structure',
          draft: {
            name: `${floor.name}: ${title}`,
            section: floor.name,
            kind,
            unit: 'each',
            inputs,
            outputs,
          },
        });
    };
    finishLine(
      'quote-doors-windows',
      'doors & windows',
      [
        ...item(
          'mainDoors',
          'Main door',
          fc.mainDoors,
          'door',
          'door_main',
          undefined,
          floor.name,
        ),
        ...item(
          'internalDoors',
          'Bedroom / internal door',
          fc.internalDoors,
          'door',
          'door_internal',
        ),
        ...item(
          'bathroomDoors',
          'Bathroom door',
          fc.bathroomDoors,
          'door',
          'door_bathroom',
        ),
        ...item(
          'poojaDoors',
          'Pooja door',
          fc.poojaDoors,
          'door',
          'door_pooja',
        ),
        ...item(
          'windows',
          'Windows',
          windowArea,
          'sqft',
          'window',
          windowBasis,
        ),
        ...item(
          'ventilators',
          'Ventilators',
          fc.ventilators,
          'each',
          'ventilator',
        ),
        ...item(
          'rollingShutters',
          'Rolling shutter',
          fc.rollingShutters,
          'each',
          'rolling_shutter',
        ),
        ...(doors > 0
          ? [
              {
                name: 'Door fixing labour',
                material: 'labour_door_fixing',
                quantity: doors,
                unit: 'door',
              },
            ]
          : []),
      ],
      { ...fc },
    );
    // Window chajjas need no second user-entered dimensions. Each opening
    // width from the drawing produces one shade, with standard projection,
    // provisional reinforcement and site-mix material takeoff.
    const sunshades = windowSunshadeTakeoff(openings, s);
    if (sunshades.windowCount > 0)
      finishLine(
        'quote-window-sajjas',
        'window sunshades (from measured windows)',
        sunshades.outputs,
        {
          windowCount: sunshades.windowCount,
          projectionFeet: WINDOW_SUNSHADE_ASSUMPTIONS.projectionFeet,
          overhangFeet: WINDOW_SUNSHADE_ASSUMPTIONS.overhangEachSideFeet,
          thicknessIn: WINDOW_SUNSHADE_ASSUMPTIONS.slabThicknessIn,
        },
      );
    else if (fc.windows > 0)
      warnings.push(
        `${floor.name}: window sunshade quantities require window width sizes; no guessed sunshade volumes were added.`,
      );

    const tiled = (
      category: AllowanceCategory,
      name: string,
      area: number,
      material: string,
      size: [number, number, number],
      source: string,
    ): GeneratedOutput[] => {
      if (!(area > 0)) return [];
      const order = tileOrder(area, ...size);
      return item(category, name, order.quantity, 'sqft', material, source).map(
        (output) => ({ ...output, order: order.order }),
      );
    };
    finishLine(
      'quote-flooring',
      'flooring & tiles',
      [
        ...tiled(
          'floorTiles',
          'Room flooring tiles',
          floorTiles,
          'floor_tiles',
          [s.floorTileLengthIn, s.floorTileWidthIn, s.floorTilesPerBox],
          rooms.length
            ? `${rooms.map((room) => `${room.name || 'Room'} ${room.lengthFeet}×${room.widthFeet}`).join(', ')} + skirting ${round(skirting, 0)} sq ft`
            : `${s.tileCoveragePercent}% of ${round(living, 0)} sq ft (enter rooms for exact)`,
        ),
        ...tiled(
          'bathFloorTiles',
          'Bathroom floor tiles (anti-skid)',
          bathFloor,
          'bath_floor_tiles',
          [s.bathFloorTileIn, s.bathFloorTileIn, s.bathFloorTilesPerBox],
          bathSizesText || `${fc.bathrooms} bathrooms × ${bathL}×${bathW} ft`,
        ),
        ...tiled(
          'wallTiles',
          'Bathroom wall tiles',
          wallTiles,
          'wall_tiles',
          [s.wallTileLengthIn, s.wallTileWidthIn, s.wallTilesPerBox],
          (bathSizesText
            ? `${bathSizesText} walls × ${s.wallTileHeightFeet} ft, less door`
            : `${fc.bathrooms} bathrooms × ${round(2 * (bathL + bathW), 1)} ft walls × ${s.wallTileHeightFeet} ft, less door`) +
            (bathroomTilesToCeiling
              ? ' · Package specifies ceiling-height tiling: confirm actual clear height in BOQ settings'
              : ''),
        ),
        ...item(
          'staircaseGranite',
          'Staircase granite',
          round(stairGranite * tileWaste, 1),
          'sqft',
          'staircase_granite',
          `${risers} steps × ${s.stairWidthFeet} ft + landing`,
        ),
        ...(parking > 0
          ? (() => {
              const order = tileOrder(
                parking,
                s.parkingTileIn,
                s.parkingTileIn,
                s.parkingTilesPerBox,
              );
              return item(
                'parkingTiles',
                parkingIsGranite ? 'Parking granite flooring' : 'Parking tiles',
                order.quantity,
                'sqft',
                'parking_flooring',
                parkingIsGranite
                  ? 'Granite is specified in quotation: verify that the supplier rate is for granite, not parking tiles'
                  : undefined,
              ).map((output) => ({
                ...output,
                order: parkingIsGranite
                  ? `Granite area ${order.quantity} sq ft; confirm supplier slab size and offcuts`
                  : order.order,
              }));
            })()
          : []),
        // Bedding mortar: floors 40 mm 1:4, wall tiles 12 mm 1:3.
        ...(floorTiles +
          bathFloor +
          stairGranite +
          parking +
          wallTiles +
          kitchenGranite +
          kitchenTiles >
        0
          ? [
              {
                name: 'Cement (tile bedding)',
                material: 'cement_masonry',
                quantity: round(
                  ((floorTiles +
                    bathFloor +
                    stairGranite +
                    parking +
                    kitchenGranite) *
                    0.028 +
                    (wallTiles + kitchenTiles) * 0.0104) *
                    (1 + s.materialWastagePercent / 100),
                  1,
                ),
                unit: 'bag',
                source: 'Floor bed 40 mm 1:4 · wall tile bed 12 mm 1:3',
              },
              sandOutput(
                ((floorTiles +
                  bathFloor +
                  stairGranite +
                  parking +
                  kitchenGranite) *
                  0.00387 +
                  (wallTiles + kitchenTiles) * 0.00109) *
                  (1 + s.materialWastagePercent / 100),
                s,
              ),
            ]
          : []),
        {
          name: 'Tile & granite laying labour',
          material: 'labour_tiling',
          quantity: round(
            floorTiles +
              bathFloor +
              wallTiles +
              kitchenTiles +
              kitchenGranite +
              stairGranite +
              parking,
            0,
          ),
          unit: 'sqft',
        },
      ],
      { builtUpSqft: floor.areaSqft, bathrooms: fc.bathrooms },
    );
    // Railings are measured from the drawing, not inferred from the staircase
    // area. An unstated contractual price limit remains unspecified.
    finishLine(
      'quote-railings',
      'railings & metal works',
      item(
        'railings',
        'SS railing',
        fin?.railingFeet ?? 0,
        'running_ft',
        'railing_ss304',
        'Measured staircase / balcony railing in running feet',
      ),
      { railingFeet: fin?.railingFeet ?? 0 },
    );
    finishLine(
      'quote-kitchen',
      'kitchen',
      [
        ...item(
          'kitchenPlatform',
          'Kitchen platform granite',
          round(kitchenGranite * tileWaste, 1),
          'sqft',
          'kitchen_platform',
          kitchens === undefined
            ? `${fc.kitchens} kitchens × ${platformFeet} ft × ${s.kitchenPlatformDepthFeet} ft`
            : kitchens
                .map(
                  (k) =>
                    `${k.name}: ${k.platformFeet}×${k.platformDepthFeet || s.kitchenPlatformDepthFeet} ft`,
                )
                .join('; '),
        ),
        ...tiled(
          'kitchenWallTiles',
          'Kitchen wall tiles',
          kitchenTiles,
          'kitchen_wall_tiles',
          [s.wallTileLengthIn, s.wallTileWidthIn, s.wallTilesPerBox],
          kitchens === undefined
            ? `${fc.kitchens} kitchens × ${platformFeet} ft × ${s.kitchenWallTileHeightFeet} ft`
            : kitchens
                .map(
                  (k) =>
                    `${k.name}: ${k.wallTileFeet || k.platformFeet}×${k.wallTileHeightFeet || s.kitchenWallTileHeightFeet} ft`,
                )
                .join('; '),
        ),
        ...item(
          'kitchenSink',
          'Kitchen sink',
          kitchenCount,
          'each',
          'kitchen_sink',
        ),
      ],
      { kitchens: kitchenCount },
    );
    finishLine(
      'quote-painting',
      'painting',
      [
        ...item(
          'paintInterior',
          interiorHasThreeCoats
            ? 'Interior painting (putty, primer, 3 coats)'
            : 'Interior painting (putty, primer, 2 coats)',
          interiorPaint,
          'sqft',
          'paint_interior',
          interiorHasThreeCoats
            ? 'Walls and ceiling; 3-coat finish specified in quotation: verify labour and paint rate'
            : 'Walls and ceiling',
        ),
        ...item(
          'paintExterior',
          'Exterior painting',
          exteriorPaint,
          'sqft',
          'paint_exterior',
        ),
        {
          name: 'Painting labour',
          material: 'labour_painting',
          quantity: round(interiorPaint + exteriorPaint, 0),
          unit: 'sqft',
        },
      ],
      { builtUpSqft: floor.areaSqft },
    );
    // --- Electrical: points → wires (coils), conduit, switches, sockets,
    // boards, distribution board and MCBs. Fixtures (lights, fans) are the
    // customer's.
    const lights = fc.lightPoints;
    const fans = fc.fanPoints;
    const sockets = fc.socketPoints;
    const power = fc.powerPoints;
    const allPoints = lights + fans + sockets + power;
    const units = Math.max(1, fc.kitchens);
    const floorIndex = floors.indexOf(floor);
    const coil = (metres: number) => ceil(metres / 90);
    const feederMetres = allPoints
      ? round(units * (floorIndex * floor.heightFeet * M_PER_FT + 15) * 3, 0)
      : 0;
    const electricalOutputs: GeneratedOutput[] = allowances.has('electrical')
      ? item(
          'electrical',
          'Electrical points (wiring, switches)',
          allPoints,
          'point',
          'electrical_point',
        )
      : allPoints > 0
        ? [
            {
              name: 'Wire 1.5 sq mm (lights, fans)',
              material: 'wire_15',
              quantity: coil((lights + fans) * s.wireMetresPerPoint),
              unit: 'coil',
              source: `${lights + fans} points × ${s.wireMetresPerPoint} m · 90 m coils`,
            },
            {
              name: 'Wire 2.5 sq mm (6 A sockets)',
              material: 'wire_25',
              quantity: coil(sockets * s.wireMetresPerPoint),
              unit: 'coil',
              source: `${sockets} sockets × ${s.wireMetresPerPoint} m · 90 m coils`,
            },
            {
              name: 'Wire 4 sq mm (16 A power points)',
              material: 'wire_40',
              quantity: coil(power * s.powerWireMetresPerPoint),
              unit: 'coil',
              source: `${power} power points × ${s.powerWireMetresPerPoint} m · 90 m coils`,
            },
            {
              name: 'Feeder cable 6 sq mm (meter to floor DB)',
              material: 'wire_60',
              quantity: feederMetres,
              unit: 'm',
              source: `${units} DB × (${round(floorIndex * floor.heightFeet * M_PER_FT, 1)} m rise + 15 m) × 3 cores`,
            },
            {
              name: 'PVC conduit 25 mm (3 m)',
              material: 'conduit',
              quantity: ceil((allPoints * s.conduitMetresPerPoint) / 3),
              unit: 'pipe',
              source: `${allPoints} points × ${s.conduitMetresPerPoint} m`,
            },
            {
              name: 'Switches 6 A',
              material: 'switch_6a',
              quantity: lights + fans + sockets,
              unit: 'nos',
            },
            {
              name: 'Switches 16 A',
              material: 'switch_16a',
              quantity: power,
              unit: 'nos',
            },
            {
              name: 'Sockets 6 A',
              material: 'socket_6a',
              quantity: sockets,
              unit: 'nos',
            },
            {
              name: 'Sockets 16 A',
              material: 'socket_16a',
              quantity: power,
              unit: 'nos',
            },
            {
              name: 'Fan regulators',
              material: 'fan_regulator',
              quantity: fans,
              unit: 'nos',
            },
            {
              name: 'Switch boards (box + plate)',
              material: 'switch_board',
              quantity:
                ceil((lights + fans + sockets) / s.pointsPerSwitchBoard) +
                power,
              unit: 'nos',
            },
            {
              name: 'Distribution board (8-way)',
              material: 'db_box',
              quantity: units,
              unit: 'nos',
            },
            {
              name: 'MCBs',
              material: 'mcb',
              quantity:
                units *
                  (ceil((lights + fans) / units / s.pointsPerCircuit) +
                    ceil(sockets / units / 6) +
                    1) +
                power,
              unit: 'nos',
              source:
                'Light / fan and socket circuits + incomer, one per power point',
            },
          ].filter((output) => output.quantity > 0)
        : [];
    // --- Plumbing: water points → CPVC lines; soil, waste and rainwater
    // lines in SWR / PVC. Sanitary ware and CP fittings are the quote's
    // allowance; these pipes are not.
    const waterPoints =
      fc.bathrooms * s.waterPointsPerBathroom +
      fc.kitchens * s.waterPointsPerKitchen;
    const heightM = floor.heightFeet * M_PER_FT;
    const pipes = (metres: number) => ceil(metres / 3);
    const stacks = fc.bathrooms ? ceil(fc.bathrooms / s.bathroomsPerStack) : 0;
    const plumbingOutputs: GeneratedOutput[] =
      fc.bathrooms + fc.kitchens > 0
        ? [
            ...item(
              'plumbing',
              'CPVC ½ in pipes (3 m)',
              pipes(waterPoints * s.cpvcMetresPerPoint),
              'pipe',
              'cpvc_half',
              `${waterPoints} water points × ${s.cpvcMetresPerPoint} m`,
            ),
            {
              name: 'CPVC fittings (elbows, tees, sockets)',
              material: 'cpvc_fittings',
              quantity: waterPoints * 4,
              unit: 'nos',
            },
            {
              name: 'CPVC 1 in supply riser (3 m)',
              material: 'cpvc_riser',
              quantity: pipes(2 * heightM),
              unit: 'pipe',
              source: 'Supply and hot-water lines, floor height',
            },
            {
              name: 'Concealed stop valves',
              material: 'concealed_valve',
              quantity: fc.bathrooms * 2 + fc.kitchens,
              unit: 'nos',
            },
            {
              name: 'SWR 110 mm soil pipes (3 m)',
              material: 'swr_110',
              quantity: fc.bathrooms + pipes(stacks * heightM),
              unit: 'pipe',
              source: `WC lines + ${stacks} soil stacks × floor height`,
            },
            {
              name: 'SWR 75 mm waste pipes (3 m)',
              material: 'swr_75',
              quantity: fc.bathrooms + fc.kitchens,
              unit: 'pipe',
            },
            {
              name: 'Floor / nahani traps',
              material: 'floor_trap',
              quantity: fc.bathrooms + fc.kitchens,
              unit: 'nos',
            },
            {
              name: 'SWR fittings (bends, tees, door bends)',
              material: 'swr_fittings',
              quantity: fc.bathrooms * 6 + fc.kitchens * 3,
              unit: 'nos',
            },
            {
              name: 'Rainwater pipes 110 mm (3 m)',
              material: 'rainwater_pipe',
              quantity: pipes(2 * heightM),
              unit: 'pipe',
              source: '2 down pipes × floor height',
            },
            {
              name: 'Solvent, tape, clamps (sundries)',
              material: 'plumbing_sundries',
              quantity: 1,
              unit: 'floor',
            },
            ...(fc.bathrooms > 0
              ? [
                  {
                    name: 'Bathroom waterproofing',
                    material: 'bathroom_waterproofing',
                    quantity: round(bathWaterproofing, 0),
                    unit: 'sqft',
                    source: bathSizesText
                      ? `${bathSizesText} floors + 1 ft up walls`
                      : `${fc.bathrooms} × (floor ${bathL}×${bathW} + 1 ft up walls)`,
                  },
                  {
                    name: 'Plumbing labour',
                    material: 'labour_plumbing',
                    quantity: fc.bathrooms,
                    unit: 'bathroom',
                  },
                ]
              : []),
          ]
        : [];
    finishLine(
      'quote-electrical',
      'electrical',
      [
        ...electricalOutputs,
        ...(allPoints > 0
          ? [
              {
                name: 'Electrical labour',
                material: 'labour_electrical',
                quantity: allPoints,
                unit: 'point',
              },
            ]
          : []),
      ],
      { lights, fans, sockets, power },
    );
    finishLine(
      'quote-services',
      'plumbing & sanitary',
      [
        ...item(
          'sanitary',
          'Sanitary ware & CP fittings',
          fc.bathrooms,
          'bathroom',
          'sanitary_cp',
        ),
        ...plumbingOutputs,
      ],
      { bathrooms: fc.bathrooms, kitchens: fc.kitchens, waterPoints },
    );
    finishLine(
      'quote-civil-labour',
      'civil labour',
      [
        s.labourItemized
          ? {
              name: 'RCC labour (steel fixing, concreting, curing)',
              material: 'labour_rcc',
              quantity: round(floor.areaSqft, 1),
              unit: 'sqft',
              source:
                'Per sq ft built-up. Brickwork, plastering and centering are priced on their own lines.',
            }
          : {
              name: 'Structural labour (shuttering, concreting, brickwork, plastering)',
              material: 'labour_civil',
              quantity: round(floor.areaSqft, 1),
              unit: 'sqft',
              source: 'Contract rate per sq ft built-up',
            },
      ],
      { builtUpSqft: floor.areaSqft },
    );
  }

  // --- External works: compound wall and entrance gate -------------------
  // A compound wall on the quotation is measured here (its quoted height
  // wins over the company default) instead of as an additional work.
  const quotedWall = quotedCompoundWall(input.details);
  const quotedWallRow = compoundWallRow(input.details);
  if (counts.compoundWallFeet > 0) {
    const wallHeight =
      quotedWall && quotedWall.heightFeet > 0
        ? quotedWall.heightFeet
        : s.compoundWallHeightFeet;
    const area = counts.compoundWallFeet * wallHeight;
    const wallLabour = { ...s, labourItemized: 1 };
    const volume = area * (s.compoundWallIn / 12) * CUM_PER_CFT;
    drafts.push({
      origin: 'quotation-structure',
      draft: {
        name: `Compound wall (${counts.compoundWallFeet} rft × ${wallHeight} ft)`,
        section: 'External works',
        kind: 'quote-compound-wall',
        unit: 'sqft',
        ...(quotedWallRow && Number(quotedWallRow.amount) > 0
          ? { quotedPrice: Number(quotedWallRow.amount) }
          : {}),
        inputs: {
          lengthFeet: counts.compoundWallFeet,
          heightFeet: wallHeight,
          thickness: `${s.compoundWallIn} in`,
        },
        // The built-up contract rate does not cover the compound wall:
        // its brickwork and plaster labour are always priced here.
        outputs: [
          wallOutput('compound wall', s.compoundWallIn, area, wallLabour),
          ...brickworkOutputs(volume, 0, 2 * area, wallLabour),
          ...item(
            'paintExterior',
            'Compound wall painting',
            2 * area,
            'sqft',
            'paint_exterior',
          ),
        ],
        notes:
          'Brickwork, plaster and paint with their labour. Add the wall footing and pillars as takeoff items.',
      },
    });
  }
  const gates = item(
    'gates',
    'Entrance gate',
    counts.entranceGates,
    'each',
    'gate',
  );
  if (gates.length)
    drafts.push({
      origin: 'quotation-structure',
      draft: {
        name: 'Entrance gate',
        section: 'External works',
        kind: 'quote-gate',
        unit: 'each',
        inputs: { gates: counts.entranceGates },
        outputs: gates,
      },
    });

  // Water storage: underground sump and overhead tank.
  const water = [
    ...item(
      'sump',
      `Underground sump (${s.sumpLitres} L)`,
      s.sumpLitres > 0 ? s.sumpLitres : 0,
      'litre',
      'sump',
      'Excavation, brickwork / RCC, plaster and waterproofing',
    ),
    ...item(
      'overheadTank',
      `Overhead tank (${s.overheadTankLitres} L)`,
      s.overheadTankLitres > 0 ? 1 : 0,
      'each',
      'overhead_tank',
    ),
  ];
  if (water.length)
    drafts.push({
      origin: 'quotation-structure',
      draft: {
        name: 'Water storage: sump & overhead tank',
        section: 'External works',
        kind: 'quote-water',
        unit: 'each',
        inputs: {
          sumpLitres: s.sumpLitres,
          overheadTankLitres: s.overheadTankLitres,
        },
        outputs: water,
      },
    });

  // Package allowances that don't map to a counted item stay building-level.
  for (const { section, allowance, unit, extra } of unmatched) {
    const { quantity, basis } = otherAllowanceQuantity(
      section.title,
      unit,
      builtUp,
    );
    const label = [section.title, section.brand, section.grade]
      .filter(Boolean)
      .join(' · ');
    drafts.push({
      origin: 'quotation-allowance',
      draft: {
        name: label.slice(0, 200),
        section: 'Finishes & fittings',
        kind: 'quote-allowance',
        unit: unitLabel(unit),
        inputs: { allowance, per: unitLabel(unit) },
        outputs: [
          {
            name: section.title.slice(0, 160),
            quantity: round(quantity, 2),
            unit: unitLabel(unit),
            quotedRate: allowance,
            source: `${basis} · enter the cost rate`.slice(0, 300),
          },
        ],
        notes: extra
          ? 'Chargeable extra in the quotation package. Enter the actual cost.'
          : 'Allowance in the quoted package. Enter the actual cost.',
      },
    });
  }

  // --- Additional quoted works (sump, borewell …) ------------------------
  for (const row of input.details.rows) {
    if ((row.kind ?? 'floor') !== 'additional') continue;
    // Measured under External works.
    if (row === quotedWallRow && counts.compoundWallFeet > 0) continue;
    const unit = row.unit ?? 'sqft';
    drafts.push({
      origin: 'quotation-additional',
      draft: {
        name: row.name,
        section: 'Additional quoted works',
        kind: 'quote-additional',
        unit: unitLabel(unit),
        inputs: { quantity: Number(row.areaSqft) || 0 },
        outputs: [
          {
            name: row.name,
            quantity: Number(row.areaSqft) || 0,
            unit: unitLabel(unit),
            source: 'Quoted item: enter its cost or break it down',
          },
        ],
        quotedPrice: Number(row.amount) || 0,
      },
    });
  }

  // --- Design & approvals, and handover ----------------------------------
  if (builtUp > 0) {
    drafts.push({
      origin: 'quotation-structure',
      draft: {
        name: 'Design, soil test & approvals',
        section: 'Design & approvals',
        kind: 'quote-design',
        unit: 'sqft',
        inputs: { builtUpSqft: round(builtUp, 0) },
        outputs: [
          {
            name: 'Architectural & structural design',
            material: 'design_fees',
            quantity: round(builtUp, 0),
            unit: 'sqft',
          },
          {
            name: 'Soil test',
            material: 'soil_test',
            quantity: 1,
            unit: 'LS',
          },
          {
            name: 'Building permission & approvals',
            material: 'building_permission',
            quantity: 1,
            unit: 'LS',
          },
        ],
      },
    });
    drafts.push({
      origin: 'quotation-structure',
      draft: {
        name: 'Handover: cleaning, testing & snags',
        section: 'Handover',
        kind: 'quote-handover',
        unit: 'sqft',
        inputs: { builtUpSqft: round(builtUp, 0) },
        outputs: [
          {
            name: 'Final cleaning',
            material: 'handover_cleaning',
            quantity: round(builtUp, 0),
            unit: 'sqft',
          },
          {
            name: 'Testing & snag rectification',
            material: 'handover_snags',
            quantity: 1,
            unit: 'LS',
          },
        ],
      },
    });
  }

  // Design → foundation → each floor → external works → handover.
  const stageOrder = [
    'Design & approvals',
    'Foundation',
    ...floors.map((floor) => floor.name),
    'External works',
    'Finishes & fittings',
    'Additional quoted works',
    'Handover',
  ];
  const stageRank = (section: string) => {
    const index = stageOrder.indexOf(section);
    return index < 0 ? stageOrder.length : index;
  };
  drafts.sort(
    (a, b) => stageRank(a.draft.section) - stageRank(b.draft.section),
  );

  return {
    lines: drafts.map(({ draft, origin }) => ({
      ...draft,
      id: newId(),
      origin,
      notes: draft.notes ?? '',
    })),
    floors,
    counts,
    settings: s,
    design,
    warnings,
    steel: [...totalSteel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([diameter, entry]) => ({
        diameter,
        kg: round(entry.metres * steelKgPerMetre(diameter), 1),
        bars: entry.bars,
      })),
  };
}

function validCount(value: unknown, fallback: number, max = 999) {
  const number = Number(value);
  return value !== undefined &&
    value !== null &&
    value !== '' &&
    Number.isFinite(number) &&
    number >= 0
    ? Math.min(max, Math.round(number))
    : fallback;
}

const UNIT_LABELS: Record<string, string> = {
  sqft: 'sqft',
  wall_sqft: 'sqft',
  running_ft: 'rft',
  cubic_ft: 'cft',
  piece: 'each',
  lumpsum: 'LS',
  bathroom: 'bathroom',
  door: 'door',
  kg: 'kg',
  tonne: 'tonne',
  bag: 'bag',
  cubic_meter: 'm³',
  point: 'point',
  meter: 'm',
  bhk: 'BHK',
};
const unitLabel = (unit: string) => UNIT_LABELS[unit] ?? unit;

export type AllowanceCategory =
  | 'mainDoors'
  | 'internalDoors'
  | 'bathroomDoors'
  | 'poojaDoors'
  | 'windows'
  | 'ventilators'
  | 'gates'
  | 'floorTiles'
  | 'bathFloorTiles'
  | 'parkingTiles'
  | 'wallTiles'
  | 'paintInterior'
  | 'paintExterior'
  | 'electrical'
  | 'sanitary'
  | 'plumbing'
  | 'kitchenPlatform'
  | 'kitchenWallTiles'
  | 'kitchenSink'
  | 'staircaseGranite'
  | 'railings'
  | 'rollingShutters'
  | 'overheadTank'
  | 'sump';

/**
 * Which counted items a package allowance prices, from its title and unit.
 * Only allowances whose unit matches the counted quantity are mapped.
 */
export function allowanceCategories(
  title: string,
  unit: string,
): AllowanceCategory[] {
  const t = title.toLowerCase();
  const perItem = ['door', 'piece', 'lumpsum'].includes(unit);
  const piece = unit === 'piece' || unit === 'lumpsum';
  if (/shutter/.test(t)) return piece ? ['rollingShutters'] : [];
  if (/sump/.test(t)) return piece ? ['sump'] : [];
  if (/overhead|water tank|\btank\b/.test(t))
    return piece ? ['overheadTank'] : [];
  if (/rail|handrail|balustrade/.test(t))
    return unit === 'running_ft' ? ['railings'] : [];
  if (/stair/.test(t)) return unit === 'sqft' ? ['staircaseGranite'] : [];
  if (/sink/.test(t)) return piece ? ['kitchenSink'] : [];
  if (/kitchen/.test(t) && /til/.test(t))
    return unit === 'sqft' ? ['kitchenWallTiles'] : [];
  if (/platform|countertop|counter top|kitchen/.test(t))
    return unit === 'sqft' ? ['kitchenPlatform'] : [];
  if (/gate/.test(t))
    return unit === 'piece' || unit === 'door' ? ['gates'] : [];
  if (/door/.test(t)) {
    if (!perItem) return [];
    if (/main|entrance|front/.test(t)) return ['mainDoors'];
    if (/bath|toilet|wash/.test(t)) return ['bathroomDoors'];
    if (/pooja|puja|prayer/.test(t)) return ['poojaDoors'];
    return ['internalDoors'];
  }
  if (/ventilat/.test(t)) return unit === 'piece' ? ['ventilators'] : [];
  if (/window/.test(t)) return unit === 'sqft' ? ['windows'] : [];
  if (
    /(bathroom|toilet|washroom)/.test(t) &&
    /(floor|anti.skid)/.test(t) &&
    /til/.test(t)
  )
    return unit === 'sqft' ? ['bathFloorTiles'] : [];
  if (/(parking|tandur)/.test(t) && /(tile|floor|stone)/.test(t))
    return unit === 'sqft' ? ['parkingTiles'] : [];
  if (/(wall|dado|bathroom) til/.test(t))
    return unit === 'sqft' ? ['wallTiles'] : [];
  if (/tile|flooring|granite|marble|vitrified/.test(t))
    return unit === 'sqft' ? ['floorTiles'] : [];
  if (/paint/.test(t)) {
    if (unit !== 'sqft') return [];
    if (/exterior|external|outside/.test(t)) return ['paintExterior'];
    if (/interior|internal|inside/.test(t)) return ['paintInterior'];
    return ['paintInterior', 'paintExterior'];
  }
  if (/electric|wiring|switch/.test(t))
    return unit === 'point' ? ['electrical'] : [];
  if (/plumb/.test(t)) {
    if (unit !== 'bathroom') return [];
    // "Bathroom fittings & plumbing" is the fittings allowance (sanitary
    // ware, taps, accessories); pipes are costed on their own.
    return /fitting|sanitary|\bcp\b|fixture|accessor/.test(t)
      ? ['sanitary']
      : ['plumbing'];
  }
  if (/sanitary|cp fitting|bathroom fitting|fixture|bathroom/.test(t))
    return unit === 'bathroom' ? ['sanitary'] : [];
  return [];
}

function otherAllowanceQuantity(
  title: string,
  unit: string,
  builtUp: number,
): { quantity: number; basis: string } {
  if (unit === 'lumpsum') return { quantity: 1, basis: 'Lump sum' };
  if (unit === 'sqft' && /ceiling|putty/i.test(title))
    return { quantity: builtUp, basis: `${round(builtUp, 0)} sqft built-up` };
  return { quantity: 0, basis: 'Enter the measured quantity' };
}

/** Find and parse the floor-wise schedule among a revision's item descriptions. */
export function sftDetailsFromDescriptions(
  descriptions: readonly string[],
): SftEstimateDetails | null {
  for (const description of descriptions) {
    const parsed = parseSftEstimate(description);
    if (parsed) return parsed;
  }
  return null;
}
