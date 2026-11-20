/**
 * Display units for manual BOQ takeoffs. Pure and client-safe.
 *
 * Calculations and saved BOQ inputs are always metric (metres, m², mm).
 * With feet selected, lengths show in ft, areas in sq ft and bar spacings in
 * inches; values are converted back to metric before calculating or saving.
 * Bar diameters stay in mm in both systems (bars are sold by mm size).
 */
export type LengthUnit = 'm' | 'ft';
export type FieldKind = 'len' | 'area' | 'spacing' | null;
type FieldDef = { key: string; label: string; value: string };

const FT_PER_M = 3.280839895;
const SQFT_PER_SQM = 10.7639104;
const IN_PER_MM = 1 / 25.4;

export function fieldKind(def: Pick<FieldDef, 'key' | 'label'>): FieldKind {
  if (/\(m²\)/.test(def.label)) return 'area';
  if (/\(m\)/.test(def.label)) return 'len';
  if (/spacing/i.test(def.key) && /\(mm\)/.test(def.label)) return 'spacing';
  return null;
}

const factor = (kind: FieldKind) =>
  kind === 'len'
    ? FT_PER_M
    : kind === 'area'
      ? SQFT_PER_SQM
      : kind === 'spacing'
        ? IN_PER_MM
        : 1;
const places = (kind: FieldKind) =>
  kind === 'spacing' ? 1 : kind === 'area' ? 2 : 3;
const tidy = (value: number, digits: number) =>
  String(Number(value.toFixed(digits)));

/** Metric value → the value shown for `unit`. Text / blank pass through. */
export function toDisplay(
  value: string | number | boolean,
  kind: FieldKind,
  unit: LengthUnit,
): string {
  const text = String(value);
  if (unit === 'm' || !kind || text.trim() === '') return text;
  const number = Number(text);
  if (!Number.isFinite(number)) return text;
  return tidy(number * factor(kind), places(kind));
}

/** Shown value in `unit` → metric value used for calculation and saving. */
export function toMetric(
  value: string | number | boolean,
  kind: FieldKind,
  unit: LengthUnit,
): string {
  const text = String(value);
  if (unit === 'm' || !kind || text.trim() === '') return text;
  const number = Number(text);
  if (!Number.isFinite(number)) return text;
  return tidy(number / factor(kind), kind === 'spacing' ? 1 : 4);
}

export function unitLabel(label: string, kind: FieldKind, unit: LengthUnit) {
  if (unit === 'm' || !kind) return label;
  if (kind === 'area') return label.replace('(m²)', '(sq ft)');
  if (kind === 'len') return label.replace('(m)', '(ft)');
  return label.replace('(mm)', '(in)');
}

/** Convert a whole set of template inputs between units. */
export function convertInputs<
  T extends Record<string, string | number | boolean>,
>(inputs: T, defs: readonly FieldDef[], from: LengthUnit, to: LengthUnit): T {
  if (from === to) return inputs;
  const kinds = new Map(defs.map((def) => [def.key, fieldKind(def)]));
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => {
      const kind = kinds.get(key) ?? null;
      const metric = toMetric(value, kind, from);
      return [key, to === 'm' ? metric : toDisplay(metric, kind, to)];
    }),
  ) as T;
}
