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
};
export const FLOOR_COUNT_FIELDS = [
  ['mainDoors', 'Main doors'],
  ['internalDoors', 'Bedroom / internal doors'],
  ['bathroomDoors', 'Bathroom doors'],
  ['poojaDoors', 'Pooja doors'],
  ['windows', 'Windows'],
  ['ventilators', 'Ventilators'],
  ['bathrooms', 'Bathrooms'],
  ['kitchens', 'Kitchens'],
  ['rollingShutters', 'Rolling shutters'],
] as const satisfies readonly (readonly [keyof FloorCounts, string])[];

export type BoqCounts = {
  /** Keyed by floor name, e.g. "Ground Floor". */
  floors: Record<string, FloorCounts>;
  entranceGates: number;
  /** Compound wall running length in feet (0 = none). */
  compoundWallFeet: number;
};

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
    key: 'bathroomWallTileSqft',
    label: 'Wall tiles per bathroom (sq ft)',
    group: 'Finishes & services',
    value: 180,
    min: 0,
    max: 600,
    step: 1,
    help: 'About 7 ft dado around a 6×8 ft bathroom, less the door.',
  },
  {
    key: 'sqftPerElectricalPoint',
    label: 'Built-up sq ft per electrical point',
    group: 'Finishes & services',
    value: 25,
    min: 5,
    max: 100,
    step: 1,
  },
  {
    key: 'kitchenPlatformSqft',
    label: 'Kitchen platform per kitchen (sq ft)',
    group: 'Finishes & services',
    value: 20,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: 'kitchenWallTileSqft',
    label: 'Kitchen wall tiles per kitchen (sq ft)',
    group: 'Finishes & services',
    value: 30,
    min: 0,
    max: 200,
    step: 1,
    help: 'About 2 ft high above the platform.',
  },
  {
    key: 'labourItemized',
    label: 'Labour: itemized (1) or one contract rate (0)',
    group: 'Finishes & services',
    value: 1,
    min: 0,
    max: 1,
    step: 1,
    help: 'Itemized: RCC, brickwork, plastering and centering priced separately.',
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
      rows: [],
      height: 0,
    };
    entry.area += Number(row.areaSqft) || 0;
    if (/ — Parking$/.test(row.name))
      entry.parking += Number(row.areaSqft) || 0;
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
    perFloor[floor.name] = {
      mainDoors: index === 0 || floor.parkingSqft ? (living > 0 ? 1 : 0) : 0,
      internalDoors:
        living > 0
          ? Math.max(1, Math.round(living / settings.sqftPerInternalDoor))
          : 0,
      bathroomDoors: bathrooms,
      poojaDoors: index === 0 && living > 0 ? 1 : 0,
      windows:
        living > 0
          ? Math.max(2, Math.round(living / settings.sqftPerWindow))
          : 0,
      ventilators: bathrooms,
      bathrooms,
      kitchens: living >= 400 ? Math.max(1, Math.round(living / 1200)) : 0,
      rollingShutters: 0,
    };
  });
  // A quoted compound wall (running ft) sets its length.
  const compound = details?.rows.find(
    (row) =>
      row.kind === 'additional' &&
      /compound|boundary/i.test(row.name) &&
      (row.unit ?? 'sqft') === 'running_ft',
  );
  return {
    floors: perFloor,
    entranceGates: floors.length ? 1 : 0,
    compoundWallFeet: compound ? Number(compound.areaSqft) || 0 : 0,
  };
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
    floors[name] = Object.fromEntries(
      FLOOR_COUNT_FIELDS.map(([key]) => [
        key,
        validCount(edited[key], defaults[key]),
      ]),
    ) as FloorCounts;
  }
  return {
    floors,
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

/** One column type of the drawing, with its footing. */
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
};
export type StructuralDesign = {
  columns: DesignColumnType[];
  beams: DesignBeamType[];
  /** Plinth beam running feet (0 = from the column grid). */
  plinthRunFeet: number;
};

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
    }))
    .filter((item) => item.count > 0 && parseBars(item.bars).length > 0);
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
    }))
    .filter((item) => parseBars(item.bars).length > 0);
  if (!columns.length && !beams.length) return null;
  return {
    columns,
    beams,
    plinthRunFeet: num(value.plinthRunFeet, 0, 0, 5000),
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

const concreteOutputs = (
  volume: number,
  label: string,
  s: StructuralSettings,
): GeneratedOutput[] => [
  { name: `${label} concrete (M20)`, quantity: round(volume, 3), unit: 'm³' },
  {
    name: 'Cement',
    material: 'cement',
    quantity: round(volume * 8.06, 1),
    unit: 'bag',
    source: 'M20 nominal mix 1:1.5:3 · 8.06 bags/m³',
  },
  sandOutput(volume * 0.42, s),
  aggregateOutput(volume * 0.84, s, '20 mm aggregate'),
];

/**
 * Bricks, mortar and plaster materials for a wall volume (m³) and plastered
 * faces (sq ft). Internal plaster 12 mm 1:6, external 20 mm 1:4.
 */
const brickworkOutputs = (
  volume: number,
  internalPlaster: number,
  externalPlaster: number,
  s: StructuralSettings,
): GeneratedOutput[] => {
  const waste = 1 + s.materialWastagePercent / 100;
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
      quantity: round(
        (volume * 1.5 + internalPlaster * 0.0058 + externalPlaster * 0.0136) *
          waste,
        1,
      ),
      unit: 'bag',
      source:
        'Mortar 1:6 · 12 mm internal plaster 1:6 · 20 mm external plaster 1:4',
    },
    sandOutput(
      (volume * 0.32 + internalPlaster * 0.0012 + externalPlaster * 0.0019) *
        waste,
      s,
    ),
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
};

export function generateQuotationBoq(
  input: QuotationBoqInput,
): QuotationBoqResult {
  const s = normalizeStructuralSettings(input.settings);
  const design = normalizeDesign(input.design);
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
  const cover = s.coverMm * FT_PER_MM;
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
    const columnTypes: ColumnType[] = design?.columns.length
      ? design.columns.map((type) => ({
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
      ...columnTypes.map((type) => type.footing.thicknessIn / 12),
    );
    const sizeText = (type: ColumnType) =>
      `${type.countAt(0)} × ${type.footing.lengthFeet}×${type.footing.widthFeet} ft`;

    // --- Foundation: excavation, PCC, footings ---------------------------
    {
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
        const bendUp = Math.max(0, t - 2 * cover);
        for (const [span, across] of [
          [f.lengthFeet, f.widthFeet],
          [f.widthFeet, f.lengthFeet],
        ] as const) {
          const barsPerFooting =
            Math.floor(Math.max(0, across - 2 * cover) / spacing) + 1;
          const piece = Math.max(0, span - 2 * cover) + 2 * bendUp;
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
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: design?.columns.length
            ? `Foundation: ${footings} footings (${columnTypes.map(sizeText).join(', ')})`
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
            {
              name: 'Earthwork excavation',
              material: 'excavation',
              quantity: round(excavation, 2),
              unit: 'm³',
              source: `${footings} pits · 1 ft working space each side`,
            },
            {
              name: 'PCC 1:4:8 bed',
              quantity: round(pcc, 3),
              unit: 'm³',
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
            ...concreteOutputs(footingConcrete, 'Footing', s),
            ...steelOutputs(tally, stock),
          ],
        },
      });
    }

    // --- Pedestals (optional) ---------------------------------------------
    // Column bars run through the pedestal from the footing, so only the
    // pedestal's concrete and its own rings are added here.
    if (s.pedestalHeightFeet > 0) {
      const pedestals = groundColumns;
      const width = s.pedestalWidthIn / 12;
      const depth = s.pedestalDepthIn / 12;
      const concrete =
        pedestals * width * depth * s.pedestalHeightFeet * CUM_PER_CFT;
      const ringLength =
        2 * (Math.max(0, width - 2 * cover) + Math.max(0, depth - 2 * cover)) +
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
              material: 'shuttering',
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
      if (!throughGround)
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
              (Math.max(0, type.widthIn / 12 - 2 * cover) +
                Math.max(0, type.depthIn / 12 - 2 * cover)) +
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
        ? [
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
              stirrupDia: s.beamStirrupDia,
              stirrupSpacingIn: s.beamStirrupSpacingIn,
              segments: design?.plinthRunFeet
                ? runSegments(design.plinthRunFeet)
                : gridSegments,
            },
          ]
        : design?.beams.length
          ? design.beams.map((type) => ({
              label: type.label,
              widthIn: type.widthIn,
              depthIn: type.depthIn,
              bars: parseBars(type.bars).map((bar) => ({
                ...bar,
                label: 'main',
              })),
              stirrupDia: type.stirrupDia,
              stirrupSpacingIn: type.stirrupSpacingIn,
              segments: runSegments(
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
            tally,
            bar.dia,
            metres,
            bars,
            `${level.name} ${type.label} ${bar.label === 'main' ? '' : `${bar.label} `}${bar.count} bars × ${ft(run)} run`,
          );
        }
        const stirrupLength =
          2 *
            (Math.max(0, beamB - 2 * cover) + Math.max(0, beamD - 2 * cover)) +
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
          tally,
          type.stirrupDia,
          stirrupBars * stock * M_PER_FT,
          stirrupBars,
          `${type.label} ${stirrups} stirrups × ${ft(stirrupLength)}`,
        );
        const below = level.slab ? Math.max(0, beamD - slabT) : beamD;
        concrete += run * beamB * below * CUM_PER_CFT;
        shuttering += run * (beamB + 2 * below);
      }
      if (level.slab) {
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
            ((Math.max(0, bar.across - 2 * cover) * 12) / bar.spacing + 1) *
              bar.extra,
          );
          const lap = lapFeet(bar.dia, s.lapDiameters);
          const piece = bar.span + 2 * Math.max(0.5, 0.5 * lap);
          const plan = cutPlan(piece, count, stock, lap);
          addSteel(
            tally,
            bar.dia,
            plan.bars * stock * M_PER_FT,
            plan.bars,
            `${level.name} slab ${bar.label} ${count} pcs × ${ft(piece)}`,
          );
        }
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
          material: 'shuttering',
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
      // Parking / stilt portions have few walls.
      const parkingShare =
        (floor.parkingSqft ?? 0) / Math.max(1, floor.areaSqft);
      const wallShare =
        1 - parkingShare + (parkingShare * s.parkingWallPercent) / 100;
      const solid = (1 - s.openingsPercent / 100) * wallShare;
      const externalArea = perimeter * wallHeight * solid;
      const internalArea = perimeter * s.internalWallRatio * wallHeight * solid;
      const volume =
        (externalArea * (s.externalWallIn / 12) +
          internalArea * (s.internalWallIn / 12)) *
        CUM_PER_CFT;
      const internalPlaster = externalArea + 2 * internalArea;
      const externalPlaster = externalArea * 1.1;
      wallsByFloor.set(floor.name, { internalPlaster, externalPlaster });
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: `${floor.name}: brickwork + plaster`,
          section: floor.name,
          kind: 'quote-masonry',
          unit: 'sqft',
          inputs: {
            externalWallFeet: round(perimeter, 1),
            internalWallFeet: round(perimeter * s.internalWallRatio, 1),
            wallHeightFeet: round(wallHeight, 2),
            openings: `${s.openingsPercent}%`,
          },
          outputs: [
            wallOutput('external wall', s.externalWallIn, externalArea, s),
            wallOutput('internal wall', s.internalWallIn, internalArea, s),
            ...brickworkOutputs(volume, internalPlaster, externalPlaster, s),
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

    // --- Staircase from each floor to the next (and to the terrace) -------
    if (s.stairsPerFloor > 0)
      for (const floor of floors) {
        const risers = ceil((floor.heightFeet * 12) / 6);
        const flightRise = floor.heightFeet / 2;
        const flightRun = ((risers / 2) * 10) / 12;
        const flight = Math.hypot(flightRun, flightRise);
        const w = s.stairWidthFeet;
        const waist = s.stairWaistIn / 12;
        const slabArea = 2 * flight * w + s.stairLandingFeet * w;
        const steps = risers * 0.5 * (10 / 12) * (6 / 12) * w;
        const volume =
          s.stairsPerFloor * (slabArea * waist + steps) * CUM_PER_CFT;
        const tally: SteelTally = new Map();
        const spacing = s.stairBarSpacingIn / 12;
        const main = s.stairsPerFloor * 2 * (Math.floor(w / spacing) + 1);
        const mainLength = flight + s.stairLandingFeet / 2 + 1.5;
        const mainPlan = cutPlan(
          mainLength,
          main,
          stock,
          lapFeet(s.stairMainDia, s.lapDiameters),
        );
        addSteel(
          tally,
          s.stairMainDia,
          mainPlan.bars * stock * M_PER_FT,
          mainPlan.bars,
          `stair main ${main} pcs × ${ft(mainLength)}`,
        );
        const dist =
          s.stairsPerFloor *
          (2 * (Math.floor(flight / spacing) + 1) +
            Math.floor(s.stairLandingFeet / spacing) +
            1);
        const distPlan = cutPlan(w, dist, stock, 0);
        addSteel(
          tally,
          s.stairDistDia,
          distPlan.bars * stock * M_PER_FT,
          distPlan.bars,
          `stair distribution ${dist} pcs × ${ft(w)}`,
        );
        mergeSteel(tally);
        drafts.push({
          origin: 'quotation-structure',
          draft: {
            name: `${floor.name}: staircase (${s.stairsPerFloor} × ${risers} risers)`,
            section: floor.name,
            kind: 'quote-staircase',
            unit: 'm³',
            inputs: {
              risers,
              widthFeet: w,
              waist: `${s.stairWaistIn} in`,
            },
            outputs: [
              ...concreteOutputs(volume, 'Staircase', s),
              ...steelOutputs(tally, stock),
              {
                name: 'Centering & shuttering',
                material: 'shuttering',
                quantity: round(s.stairsPerFloor * slabArea, 0),
                unit: 'sqft',
              },
            ],
          },
        });
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
    for (const category of categories)
      if (!allowances.has(category)) allowances.set(category, quoted);
  }
  // A generic "Internal doors" allowance also covers bathroom and pooja
  // doors unless the package prices those separately.
  // One per-bathroom allowance covering fittings and plumbing is charged
  // once, on the fittings line; the plumbing material line is not repeated.
  const included = new Set<AllowanceCategory>();
  const fittings = allowances.get('sanitary');
  if (fittings && allowances.get('plumbing') === fittings)
    included.add('plumbing');
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
  ): GeneratedOutput[] => {
    if (!(quantity > 0) || included.has(category)) return [];
    const quoted = allowances.get(category);
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
    const windowArea = fc.windows * s.windowSqft;
    const living = livingSqft(floor);
    const parking = floor.parkingSqft ?? 0;
    const floorTiles = (living * s.tileCoveragePercent) / 100;
    const wallTiles = fc.bathrooms * s.bathroomWallTileSqft;
    const kitchenTiles = fc.kitchens * s.kitchenWallTileSqft;
    const interiorPaint = walls.internalPlaster + floor.areaSqft;
    const exteriorPaint = walls.externalPlaster;
    const points =
      ceil(living / s.sqftPerElectricalPoint) + ceil(parking / 100);
    // Staircase flooring: treads and risers of each flight plus the landing.
    const risers = ceil((floor.heightFeet * 12) / 6);
    const stairGranite =
      s.stairsPerFloor *
      s.stairWidthFeet *
      (risers * (16 / 12) + s.stairLandingFeet);
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
        ...item('mainDoors', 'Main door', fc.mainDoors, 'door', 'door_main'),
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
          `${fc.windows} windows × ${s.windowSqft} sq ft`,
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
    finishLine(
      'quote-flooring',
      'flooring & tiles',
      [
        ...item(
          'floorTiles',
          'Floor tiles',
          floorTiles,
          'sqft',
          'floor_tiles',
          `${s.tileCoveragePercent}% of ${round(living, 0)} sq ft`,
        ),
        ...item(
          'wallTiles',
          'Bathroom wall tiles',
          wallTiles,
          'sqft',
          'wall_tiles',
          `${fc.bathrooms} bathrooms × ${s.bathroomWallTileSqft} sq ft`,
        ),
        ...item(
          'kitchenWallTiles',
          'Kitchen wall tiles',
          kitchenTiles,
          'sqft',
          'kitchen_wall_tiles',
          `${fc.kitchens} kitchens × ${s.kitchenWallTileSqft} sq ft`,
        ),
        ...item(
          'staircaseGranite',
          'Staircase granite',
          stairGranite,
          'sqft',
          'staircase_granite',
          `${risers} steps × ${s.stairWidthFeet} ft + landing`,
        ),
        ...(parking > 0
          ? [
              {
                name: 'Parking flooring',
                material: 'parking_flooring',
                quantity: round(parking, 0),
                unit: 'sqft',
              },
            ]
          : []),
        // Bedding mortar: floors 40 mm 1:4, wall tiles 12 mm 1:3.
        ...(floorTiles + stairGranite + parking + wallTiles + kitchenTiles > 0
          ? [
              {
                name: 'Cement (tile bedding)',
                material: 'cement_masonry',
                quantity: round(
                  ((floorTiles + stairGranite + parking) * 0.028 +
                    (wallTiles + kitchenTiles) * 0.0104) *
                    (1 + s.materialWastagePercent / 100),
                  1,
                ),
                unit: 'bag',
                source: 'Floor bed 40 mm 1:4 · wall tile bed 12 mm 1:3',
              },
              sandOutput(
                ((floorTiles + stairGranite + parking) * 0.00387 +
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
            floorTiles + wallTiles + kitchenTiles + stairGranite + parking,
            0,
          ),
          unit: 'sqft',
        },
      ],
      { builtUpSqft: floor.areaSqft, bathrooms: fc.bathrooms },
    );
    finishLine(
      'quote-kitchen',
      'kitchen',
      [
        ...item(
          'kitchenPlatform',
          'Kitchen platform (granite)',
          fc.kitchens * s.kitchenPlatformSqft,
          'sqft',
          'kitchen_platform',
          `${fc.kitchens} kitchens × ${s.kitchenPlatformSqft} sq ft`,
        ),
        ...item(
          'kitchenSink',
          'Kitchen sink',
          fc.kitchens,
          'each',
          'kitchen_sink',
        ),
      ],
      { kitchens: fc.kitchens },
    );
    finishLine(
      'quote-painting',
      'painting',
      [
        ...item(
          'paintInterior',
          'Interior painting (putty, primer, 2 coats)',
          interiorPaint,
          'sqft',
          'paint_interior',
          'Walls and ceiling',
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
    finishLine(
      'quote-services',
      'electrical & plumbing',
      [
        ...item(
          'electrical',
          'Electrical points (wiring, switches)',
          points,
          'point',
          'electrical_point',
          `1 point per ${s.sqftPerElectricalPoint} sq ft`,
        ),
        {
          name: 'Electrical labour',
          material: 'labour_electrical',
          quantity: points,
          unit: 'point',
        },
        ...item(
          'sanitary',
          'Sanitary ware & CP fittings',
          fc.bathrooms,
          'bathroom',
          'sanitary_cp',
        ),
        ...item(
          'plumbing',
          'Plumbing pipes & fittings',
          fc.bathrooms,
          'bathroom',
          'plumbing_bathroom',
        ),
        {
          name: 'Plumbing labour',
          material: 'labour_plumbing',
          quantity: fc.bathrooms,
          unit: 'bathroom',
        },
      ],
      { points, bathrooms: fc.bathrooms },
    );
    finishLine(
      'quote-civil-labour',
      'civil labour',
      [
        s.labourItemized
          ? {
              name: 'RCC labour (steel fixing, concreting, curing)',
              material: 'labour_rcc',
              quantity: round(floor.areaSqft, 0),
              unit: 'sqft',
              source:
                'Per sq ft built-up. Brickwork, plastering and centering are priced on their own lines.',
            }
          : {
              name: 'Civil labour contract (concrete, brickwork, plastering)',
              material: 'labour_civil',
              quantity: round(floor.areaSqft, 0),
              unit: 'sqft',
              source: 'Per sq ft built-up; centering is priced separately',
            },
      ],
      { builtUpSqft: floor.areaSqft },
    );
  }

  // --- External works: compound wall and entrance gate -------------------
  if (counts.compoundWallFeet > 0) {
    const area = counts.compoundWallFeet * s.compoundWallHeightFeet;
    const volume = area * (s.compoundWallIn / 12) * CUM_PER_CFT;
    drafts.push({
      origin: 'quotation-structure',
      draft: {
        name: `Compound wall (${counts.compoundWallFeet} rft × ${s.compoundWallHeightFeet} ft)`,
        section: 'External works',
        kind: 'quote-compound-wall',
        unit: 'sqft',
        inputs: {
          lengthFeet: counts.compoundWallFeet,
          heightFeet: s.compoundWallHeightFeet,
          thickness: `${s.compoundWallIn} in`,
        },
        outputs: [
          wallOutput('compound wall', s.compoundWallIn, area, s),
          ...brickworkOutputs(volume, 0, 2 * area, s),
          ...item(
            'paintExterior',
            'Compound wall painting',
            2 * area,
            'sqft',
            'paint_exterior',
          ),
        ],
        notes:
          'Brickwork, plaster and paint only. Add the wall footing and pillars as takeoff items.',
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
    // "Bathroom fittings & plumbing": one allowance covers both.
    return /fitting|sanitary|\bcp\b|fixture/.test(t)
      ? ['sanitary', 'plumbing']
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
