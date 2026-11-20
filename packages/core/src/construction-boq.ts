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
  /** Fixed unit rate (e.g. quoted allowance per door). */
  rate?: number;
  source?: string;
  /** Stock bars required, for reinforcement outputs measured in kg. */
  rods?: number;
  diameter?: number;
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
};

export type BoqCounts = {
  mainDoors: number;
  internalDoors: number;
  bathrooms: number;
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
    key: 'windowPercent',
    label: 'Windows: % of built-up area',
    group: 'Allowances',
    value: 10,
    min: 0,
    max: 40,
    step: 0.5,
  },
  {
    key: 'sqftPerInternalDoor',
    label: 'Built-up sq ft per internal door',
    group: 'Allowances',
    value: 200,
    min: 50,
    max: 600,
    step: 1,
    help: 'Used only when door count is not entered.',
  },
  {
    key: 'sqftPerBathroom',
    label: 'Built-up sq ft per bathroom',
    group: 'Allowances',
    value: 500,
    min: 100,
    max: 2000,
    step: 1,
    help: 'Used only when bathroom count is not entered.',
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
    { area: number; rows: SftEstimateDetails['rows']; height: number }
  >();
  for (const row of details.rows) {
    if ((row.kind ?? 'floor') !== 'floor') continue;
    const level = LEVEL_PREFIX.exec(row.name)?.[1]?.trim() || row.name;
    const entry = levels.get(level) ?? { area: 0, rows: [], height: 0 };
    entry.area += Number(row.areaSqft) || 0;
    entry.rows.push(row);
    const height = Number(row.heightFeet);
    if (Number.isFinite(height) && height > entry.height) entry.height = height;
    levels.set(level, entry);
  }
  return [...levels.entries()].map(([name, entry]) => {
    const single = entry.rows.length === 1 ? entry.rows[0] : undefined;
    const length = Number(single?.lengthFeet);
    const width = Number(single?.widthFeet);
    const realRectangle = single && length > 1 && width > 1;
    const side = Math.sqrt(Math.max(entry.area, 1));
    const heightAssumed = !(entry.height > 0);
    return {
      name,
      areaSqft: round(entry.area),
      lengthFeet: realRectangle ? length : round(side),
      widthFeet: realRectangle ? width : round(side),
      heightFeet: heightAssumed ? defaultHeightFeet : entry.height,
      ...(heightAssumed ? { heightAssumed: true } : {}),
    };
  });
}

/** Default door / bathroom counts from the quoted areas. */
export function estimateCounts(
  floors: readonly BoqFloor[],
  settings: StructuralSettings = DEFAULT_STRUCTURAL_SETTINGS,
): BoqCounts {
  let internalDoors = 0;
  let bathrooms = 0;
  for (const floor of floors) {
    internalDoors += Math.max(
      1,
      Math.round(floor.areaSqft / settings.sqftPerInternalDoor),
    );
    bathrooms += Math.max(
      1,
      Math.round(floor.areaSqft / settings.sqftPerBathroom),
    );
  }
  return { mainDoors: floors.length ? 1 : 0, internalDoors, bathrooms };
}

// ---------------------------------------------------------------------------
// Structure

const columnGrid = (floor: BoqFloor, spacing: number) => {
  const nx = ceil(floor.lengthFeet / spacing) + 1;
  const ny = ceil(floor.widthFeet / spacing) + 1;
  return {
    nx,
    ny,
    columns: nx * ny,
    // Every grid line carries a continuous beam.
    beamRunFeet: ny * floor.lengthFeet + nx * floor.widthFeet,
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

const concreteOutputs = (volume: number, label: string): GeneratedOutput[] => [
  { name: `${label} concrete (M20)`, quantity: round(volume, 3), unit: 'm³' },
  {
    name: 'Cement',
    material: 'cement',
    quantity: round(volume * 8.06, 1),
    unit: 'bag',
    source: 'M20 nominal mix 1:1.5:3 · 8.06 bags/m³',
  },
  {
    name: 'Sand',
    material: 'sand',
    quantity: round(volume * 0.42, 3),
    unit: 'm³',
  },
  {
    name: '20 mm aggregate',
    material: 'aggregate',
    quantity: round(volume * 0.84, 3),
    unit: 'm³',
  },
];

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
        quantity: round(kg, 1),
        unit: 'kg',
        rods: entry.bars,
        diameter,
        source:
          `${entry.bars} bars of ${stockFeet} ft · ${entry.details.join(' · ')}`.slice(
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
  warnings: string[];
  /** Steel summary across all structural lines, by diameter. */
  steel: { diameter: number; kg: number; bars: number }[];
};

export type QuotationBoqInput = {
  details: SftEstimateDetails;
  settings?: unknown;
  /** Edited floors (e.g. corrected heights); defaults come from the quote. */
  floors?: BoqFloor[];
  counts?: Partial<BoqCounts>;
};

export function generateQuotationBoq(
  input: QuotationBoqInput,
): QuotationBoqResult {
  const s = normalizeStructuralSettings(input.settings);
  const floors = (
    input.floors?.length
      ? input.floors
      : floorsFromQuote(input.details, s.defaultFloorHeightFeet)
  ).filter((floor) => floor.areaSqft > 0);
  const estimated = estimateCounts(floors, s);
  const counts: BoqCounts = {
    mainDoors: validCount(input.counts?.mainDoors, estimated.mainDoors),
    internalDoors: validCount(
      input.counts?.internalDoors,
      estimated.internalDoors,
    ),
    bathrooms: validCount(input.counts?.bathrooms, estimated.bathrooms),
  };
  const warnings: string[] = [];
  const drafts: { draft: LineDraft; origin: BoqOrigin }[] = [];
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
    const groundGrid = columnGrid(ground, s.columnSpacingFeet);
    const columnBars = [
      { dia: s.columnBar1Dia, count: s.columnBar1Count },
      { dia: s.columnBar2Dia, count: s.columnBar2Count },
    ].filter((bar) => bar.dia > 0 && bar.count > 0);
    const footingT = s.footingThicknessIn / 12;

    // --- Foundation: excavation, PCC, footings ---------------------------
    {
      const footings = groundGrid.columns;
      const excavation =
        footings *
        (s.footingLengthFeet + 2) *
        (s.footingWidthFeet + 2) *
        s.foundationDepthFeet *
        CUM_PER_CFT;
      const pcc =
        footings *
        (s.footingLengthFeet + 0.5) *
        (s.footingWidthFeet + 0.5) *
        (s.pccThicknessIn / 12) *
        CUM_PER_CFT;
      const footingConcrete =
        footings *
        s.footingLengthFeet *
        s.footingWidthFeet *
        footingT *
        CUM_PER_CFT;
      const tally: SteelTally = new Map();
      const spacing = s.footingBarSpacingIn / 12;
      const bendUp = Math.max(0, footingT - 2 * cover);
      for (const [span, across] of [
        [s.footingLengthFeet, s.footingWidthFeet],
        [s.footingWidthFeet, s.footingLengthFeet],
      ] as const) {
        const barsPerFooting =
          Math.floor(Math.max(0, across - 2 * cover) / spacing) + 1;
        const piece = Math.max(0, span - 2 * cover) + 2 * bendUp;
        const plan = cutPlan(piece, barsPerFooting * footings, stock, 0);
        addSteel(
          tally,
          s.footingBarDia,
          plan.bars * stock * M_PER_FT,
          plan.bars,
          `footing mesh ${barsPerFooting * footings} pcs × ${ft(piece)}`,
        );
      }
      mergeSteel(tally);
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: `Foundation: ${footings} footings (${s.footingLengthFeet}×${s.footingWidthFeet} ft)`,
          section: 'Foundation',
          kind: 'quote-foundation',
          unit: 'm³',
          inputs: {
            footings,
            grid: `${groundGrid.nx} × ${groundGrid.ny} columns`,
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
            {
              name: 'Sand',
              material: 'sand',
              quantity: round(pcc * 0.47, 3),
              unit: 'm³',
            },
            {
              name: '40 mm aggregate',
              material: 'aggregate',
              quantity: round(pcc * 0.94, 3),
              unit: 'm³',
            },
            ...concreteOutputs(footingConcrete, 'Footing'),
            ...steelOutputs(tally, stock),
          ],
        },
      });
    }

    // --- Columns, lift by lift -------------------------------------------
    {
      const tally: SteelTally = new Map();
      const liftNotes: string[] = [];
      let columnConcrete = 0;
      let tieCount = 0;
      const section =
        (s.columnWidthIn / 12) * (s.columnDepthIn / 12) * CUM_PER_CFT;
      const tieLength =
        2 *
          (Math.max(0, s.columnWidthIn / 12 - 2 * cover) +
            Math.max(0, s.columnDepthIn / 12 - 2 * cover)) +
        20 * s.columnTieDia * FT_PER_MM;
      const lifts = floors.map((floor, index) => {
        const grid = columnGrid(floor, s.columnSpacingFeet);
        const columns = Math.min(grid.columns, groundGrid.columns);
        const isTop = index === floors.length - 1;
        const height =
          index === 0
            ? s.foundationDepthFeet -
              footingT +
              s.plinthHeightFeet +
              floor.heightFeet
            : floor.heightFeet;
        return { floor, index, columns, isTop, height };
      });
      for (const lift of lifts) {
        columnConcrete += lift.columns * lift.height * section;
        const ties =
          lift.columns * (ceil((lift.height * 12) / s.columnTieSpacingIn) + 1);
        tieCount += ties;
        for (const bar of columnBars) {
          const lap =
            lift.isTop && !s.topStarters ? 0 : lapFeet(bar.dia, s.lapDiameters);
          // Foundation bars get an L-bend into the footing mesh.
          const bend =
            lift.index === 0 ? Math.max(0.75, 12 * bar.dia * FT_PER_MM) : 0;
          const required = lift.height + lap + bend;
          const pieces = lift.columns * bar.count;
          const plan = cutPlan(
            required,
            pieces,
            stock,
            lapFeet(bar.dia, s.lapDiameters),
            lift.index === 0 ? s.foundationCuts : s.floorCuts,
          );
          const liftName =
            lift.index === 0
              ? `Foundation → ${lift.floor.name}`
              : lift.floor.name;
          if (plan.adjusted) {
            const preferred = lift.index === 0 ? s.foundationCuts : s.floorCuts;
            warnings.push(
              `${liftName} columns, ${bar.dia} mm: needs ${ft(required)} (height ${ft(lift.height)} + lap ${ft(lap)}${bend ? ` + bend ${ft(bend)}` : ''}); ${ft(stock / preferred)} pieces (${preferred} per bar) are too short, so ${plan.piecesPerBar || 'spliced'} per bar is used.`,
            );
          }
          addSteel(
            tally,
            bar.dia,
            plan.bars * stock * M_PER_FT,
            plan.bars,
            `${liftName}: ${pieces} pcs × ${ft(plan.pieceFeet)}`,
          );
          liftNotes.push(
            `${liftName} · ${bar.dia} mm: ${pieces} pcs, need ${ft(required)}, cut ${plan.piecesPerBar ? `${plan.piecesPerBar}/bar @ ${ft(plan.pieceFeet)}` : 'spliced'} → ${plan.bars} bars${plan.offcutFeetPerBar > 0.05 ? `, offcut ${ft(plan.offcutFeetPerBar)}/bar` : ''}`,
          );
        }
      }
      const tiePlan = cutPlan(tieLength, tieCount, stock, 0);
      addSteel(
        tally,
        s.columnTieDia,
        tiePlan.bars * stock * M_PER_FT,
        tiePlan.bars,
        `${tieCount} rings × ${ft(tieLength)}`,
      );
      mergeSteel(tally);
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: `Columns: ${groundGrid.columns} nos (${s.columnWidthIn}×${s.columnDepthIn} in), ${floors.length} lift${floors.length === 1 ? '' : 's'}`,
          section: 'Structure',
          kind: 'quote-columns',
          unit: 'm³',
          inputs: {
            columns: groundGrid.columns,
            mainBars: columnBars
              .map((bar) => `${bar.count}×${bar.dia} mm`)
              .join(' + '),
            rings: `${s.columnTieDia} mm @ ${s.columnTieSpacingIn} in`,
            lap: `${s.lapDiameters}d`,
          },
          outputs: [
            ...concreteOutputs(columnConcrete, 'Column'),
            ...steelOutputs(tally, stock),
          ],
          notes: liftNotes.join('\n').slice(0, 2000),
        },
      });
    }

    // --- Beams and slabs per level ---------------------------------------
    const beamLevels: { name: string; floor: BoqFloor; slab: boolean }[] = [
      ...(s.plinthBeam
        ? [{ name: 'Plinth beams', floor: ground, slab: false }]
        : []),
      ...floors.map((floor) => ({
        name: `${floor.name} roof`,
        floor,
        slab: true,
      })),
    ];
    const slabT = s.slabThicknessIn / 12;
    const beamB = s.beamWidthIn / 12;
    const beamD = s.beamDepthIn / 12;
    const stirrupLength =
      2 * (Math.max(0, beamB - 2 * cover) + Math.max(0, beamD - 2 * cover)) +
      20 * s.beamStirrupDia * FT_PER_MM;
    for (const level of beamLevels) {
      const grid = columnGrid(level.floor, s.columnSpacingFeet);
      const tally: SteelTally = new Map();
      const outputs: GeneratedOutput[] = [];
      // Beams: continuous bars along every grid line, anchored at both ends.
      for (const bar of [
        { dia: s.beamTopDia, count: s.beamTopCount, label: 'top' },
        { dia: s.beamBottomDia, count: s.beamBottomCount, label: 'bottom' },
      ].filter((item) => item.dia > 0 && item.count > 0)) {
        const lap = lapFeet(bar.dia, s.lapDiameters);
        const anchor = 2 * lap;
        let bars = 0;
        let metres = 0;
        for (const [runs, span] of [
          [grid.ny, level.floor.lengthFeet],
          [grid.nx, level.floor.widthFeet],
        ] as const) {
          const plan = cutPlan(span + anchor, runs * bar.count, stock, lap);
          bars += plan.bars;
          metres += plan.bars * stock * M_PER_FT;
        }
        addSteel(
          tally,
          bar.dia,
          metres,
          bars,
          `${level.name} beam ${bar.label} ${bar.count} bars × ${ft(grid.beamRunFeet)} run`,
        );
      }
      const stirrups =
        grid.ny *
          (ceil((level.floor.lengthFeet * 12) / s.beamStirrupSpacingIn) + 1) +
        grid.nx *
          (ceil((level.floor.widthFeet * 12) / s.beamStirrupSpacingIn) + 1);
      const stirrupBars = cutPlan(stirrupLength, stirrups, stock, 0).bars;
      addSteel(
        tally,
        s.beamStirrupDia,
        stirrupBars * stock * M_PER_FT,
        stirrupBars,
        `${stirrups} stirrups × ${ft(stirrupLength)}`,
      );
      const beamDepthBelowSlab = level.slab
        ? Math.max(0, beamD - slabT)
        : beamD;
      let concrete =
        grid.beamRunFeet * beamB * beamDepthBelowSlab * CUM_PER_CFT;
      let shuttering = grid.beamRunFeet * (beamB + 2 * beamDepthBelowSlab);
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
            : `Plinth beams (${round(grid.beamRunFeet, 0)} rft)`,
          section: 'Structure',
          kind: level.slab ? 'quote-slab' : 'quote-plinth-beam',
          unit: 'm³',
          inputs: {
            beamRunFeet: round(grid.beamRunFeet, 1),
            beam: `${s.beamWidthIn}×${s.beamDepthIn} in`,
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
      const wallHeight = Math.max(0, floor.heightFeet - beamD);
      const solid = 1 - s.openingsPercent / 100;
      const externalArea = perimeter * wallHeight * solid;
      const internalArea = perimeter * s.internalWallRatio * wallHeight * solid;
      const volume =
        (externalArea * (s.externalWallIn / 12) +
          internalArea * (s.internalWallIn / 12)) *
        CUM_PER_CFT;
      const waste = 1 + s.materialWastagePercent / 100;
      const internalPlaster = externalArea + 2 * internalArea;
      const externalPlaster = externalArea * 1.1;
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: `${floor.name}: brickwork + plaster`,
          section: 'Masonry',
          kind: 'quote-masonry',
          unit: 'sqft',
          inputs: {
            externalWallFeet: round(perimeter, 1),
            internalWallFeet: round(perimeter * s.internalWallRatio, 1),
            wallHeightFeet: round(wallHeight, 2),
            openings: `${s.openingsPercent}%`,
          },
          outputs: [
            {
              name: `${s.externalWallIn} in external wall`,
              quantity: round(externalArea, 0),
              unit: 'sqft',
            },
            {
              name: `${s.internalWallIn} in internal wall`,
              quantity: round(internalArea, 0),
              unit: 'sqft',
            },
            {
              name: 'Bricks',
              material: 'bricks',
              quantity: ceil(volume * s.bricksPerCubicMetre * waste),
              unit: 'each',
              source: `${round(volume, 2)} m³ wall × ${s.bricksPerCubicMetre}/m³`,
            },
            {
              name: 'Cement',
              material: 'cement',
              quantity: round(
                (volume * 1.5 +
                  internalPlaster * 0.0058 +
                  externalPlaster * 0.0136) *
                  waste,
                1,
              ),
              unit: 'bag',
              source:
                'Mortar 1:6 · 12 mm internal plaster 1:6 · 20 mm external plaster 1:4',
            },
            {
              name: 'Sand',
              material: 'sand',
              quantity: round(
                (volume * 0.32 +
                  internalPlaster * 0.0012 +
                  externalPlaster * 0.0019) *
                  waste,
                3,
              ),
              unit: 'm³',
            },
            {
              name: 'Internal plaster',
              material: 'plaster_labour',
              quantity: round(internalPlaster, 0),
              unit: 'sqft',
            },
            {
              name: 'External plaster',
              material: 'plaster_labour',
              quantity: round(externalPlaster, 0),
              unit: 'sqft',
            },
          ],
        },
      });
    }

    // Binding wire on the total reinforcement.
    const totalKg = [...totalSteel.entries()].reduce(
      (sum, [diameter, entry]) =>
        sum + entry.metres * steelKgPerMetre(diameter),
      0,
    );
    if (totalKg > 0) {
      drafts.push({
        origin: 'quotation-structure',
        draft: {
          name: 'Binding wire',
          section: 'Structure',
          kind: 'quote-binding-wire',
          unit: 'kg',
          inputs: { steelKg: round(totalKg, 0) },
          outputs: [
            {
              name: 'Binding wire',
              material: 'binding_wire',
              quantity: round(totalKg * 0.008, 1),
              unit: 'kg',
              source: '8 kg per tonne of reinforcement',
            },
          ],
        },
      });
    }
  }

  // --- Package allowances (₹ per door, per bathroom, per sq ft …) ---------
  const builtUp = floors.reduce((sum, floor) => sum + floor.areaSqft, 0);
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
    const title = section.title;
    const { quantity, basis } = allowanceQuantity(title, unit, {
      builtUp,
      counts,
      settings: s,
    });
    const label = [title, section.brand, section.grade]
      .filter(Boolean)
      .join(' · ');
    drafts.push({
      origin: 'quotation-allowance',
      draft: {
        name: label.slice(0, 200),
        section: 'Finishes & fittings',
        kind: 'quote-allowance',
        unit: unitLabel(unit),
        inputs: { allowance, per: unitLabel(unit), treatment },
        outputs: [
          {
            name: title.slice(0, 160),
            quantity: round(quantity, 2),
            unit: unitLabel(unit),
            rate: allowance,
            source: basis.slice(0, 300),
          },
        ],
        notes:
          treatment === 'extra'
            ? 'Chargeable extra in the quotation package.'
            : 'Allowance included in the quoted package rate.',
      },
    });
  }

  // --- Additional quoted works (compound wall, sump …) -------------------
  for (const row of input.details.rows) {
    if ((row.kind ?? 'floor') !== 'additional') continue;
    const unit = row.unit ?? 'sqft';
    drafts.push({
      origin: 'quotation-additional',
      draft: {
        name: row.name,
        section: 'Additional quoted works',
        kind: 'quoted',
        unit: unitLabel(unit),
        inputs: { quantity: Number(row.areaSqft) || 0 },
        outputs: [
          {
            name: row.name,
            quantity: Number(row.areaSqft) || 0,
            unit: unitLabel(unit),
            source: 'Break down materials and labour manually',
          },
        ],
        quotedPrice: Number(row.amount) || 0,
      },
    });
  }

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

function validCount(value: unknown, fallback: number) {
  const number = Number(value);
  return value !== undefined &&
    value !== '' &&
    Number.isFinite(number) &&
    number >= 0
    ? Math.min(999, Math.round(number))
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

function allowanceQuantity(
  title: string,
  unit: string,
  context: { builtUp: number; counts: BoqCounts; settings: StructuralSettings },
): { quantity: number; basis: string } {
  const { builtUp, counts, settings } = context;
  if (unit === 'door') {
    if (/main|entrance|front/i.test(title))
      return {
        quantity: counts.mainDoors,
        basis: `${counts.mainDoors} main door`,
      };
    return {
      quantity: counts.internalDoors,
      basis: `${counts.internalDoors} internal doors (edit the count if needed)`,
    };
  }
  if (unit === 'bathroom')
    return {
      quantity: counts.bathrooms,
      basis: `${counts.bathrooms} bathrooms (edit the count if needed)`,
    };
  if (unit === 'lumpsum') return { quantity: 1, basis: 'Lump sum' };
  if (unit === 'sqft') {
    if (/window|ventilator/i.test(title))
      return {
        quantity: (builtUp * settings.windowPercent) / 100,
        basis: `${settings.windowPercent}% of ${round(builtUp, 0)} sqft built-up`,
      };
    if (/tile|floor|granite|marble|vitrified/i.test(title))
      return {
        quantity: (builtUp * settings.tileCoveragePercent) / 100,
        basis: `${settings.tileCoveragePercent}% of ${round(builtUp, 0)} sqft built-up`,
      };
    if (/paint|ceiling|putty/i.test(title))
      return { quantity: builtUp, basis: `${round(builtUp, 0)} sqft built-up` };
  }
  if (unit === 'bhk') return { quantity: 0, basis: 'Enter BHK count' };
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
