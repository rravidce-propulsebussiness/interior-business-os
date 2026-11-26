/** Concrete mix selection belongs to the BOQ; supply/steel grades do not. */
export const CONCRETE_GRADES = [20, 25, 30, 35, 40, 45, 50, 55, 60] as const;
export type ConcreteGrade = (typeof CONCRETE_GRADES)[number];
export const CONCRETE_MEMBERS = [
  'Footing',
  'Pedestal',
  'Column',
  'Plinth beam',
  'Beam',
  'Slab',
  'Staircase',
] as const;
export type ConcreteMember = (typeof CONCRETE_MEMBERS)[number];
export type MixRecipe = {
  cementBags: number;
  sandCubicMetres: number;
  aggregateCubicMetres: number;
  confirmed: boolean;
};
export type ConcreteMix = {
  defaultGrade: ConcreteGrade;
  overrides: Partial<Record<ConcreteMember, ConcreteGrade>>;
  recipes: Partial<Record<ConcreteGrade, MixRecipe>>;
  rmcRates: Partial<Record<ConcreteGrade, number>>;
};
/** Historical estimate, not an approved M20 mix design. */
export const M20_SITE_MIX_PER_M3 = {
  cementBags: 8.06,
  sandCubicMetres: 0.42,
  aggregateCubicMetres: 0.84,
} as const;

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const grade = (value: unknown): ConcreteGrade | undefined =>
  CONCRETE_GRADES.find((g) => g === Number(value));

export function normalizeConcreteMix(
  raw: unknown,
  legacyRate?: number,
): ConcreteMix {
  const source = object(raw);
  const mix: ConcreteMix = {
    defaultGrade: grade(source.defaultGrade) ?? 20,
    overrides: {},
    recipes: {},
    rmcRates: {},
  };
  for (const member of CONCRETE_MEMBERS) {
    const value = grade(object(source.overrides)[member]);
    if (value !== undefined) mix.overrides[member] = value;
  }
  for (const g of CONCRETE_GRADES) {
    const recipe = object(object(source.recipes)[g]);
    const cementBags = Number(recipe.cementBags);
    const sandCubicMetres = Number(recipe.sandCubicMetres);
    const aggregateCubicMetres = Number(recipe.aggregateCubicMetres);
    if (
      cementBags > 0 &&
      cementBags <= 30 &&
      sandCubicMetres > 0 &&
      sandCubicMetres <= 3 &&
      aggregateCubicMetres > 0 &&
      aggregateCubicMetres <= 3
    ) {
      mix.recipes[g] = {
        cementBags,
        sandCubicMetres,
        aggregateCubicMetres,
        confirmed: recipe.confirmed === true,
      };
    }
    const rate = object(source.rmcRates)[g];
    if (
      typeof rate === 'number' &&
      Number.isFinite(rate) &&
      rate >= 0 &&
      rate <= 10000000
    )
      mix.rmcRates[g] = rate;
  }
  if (
    raw == null &&
    legacyRate !== undefined &&
    Number.isFinite(legacyRate) &&
    legacyRate >= 0
  )
    mix.rmcRates[20] = legacyRate;
  return mix;
}

export const gradeForMember = (
  mix: ConcreteMix,
  member: string,
): ConcreteGrade => mix.overrides[member as ConcreteMember] ?? mix.defaultGrade;

export const mixRecipe = (
  mix: ConcreteMix,
  g: ConcreteGrade,
): MixRecipe | undefined =>
  mix.recipes[g] ??
  (g === 20 ? { ...M20_SITE_MIX_PER_M3, confirmed: false } : undefined);

export const usedConcreteGrades = (mix: ConcreteMix): ConcreteGrade[] =>
  [...new Set([mix.defaultGrade, ...Object.values(mix.overrides)])].sort(
    (a, b) => a - b,
  );

export const rmcMaterialKey = (g: ConcreteGrade) => 'concrete_m' + g;
export const rmcGradeForMaterial = (
  material?: string,
): ConcreteGrade | undefined =>
  CONCRETE_GRADES.find((g) => rmcMaterialKey(g) === material);

type QuoteSpec = {
  title?: string | undefined;
  brand?: string | undefined;
  grade?: string | undefined;
  description?: string | undefined;
  pricingTreatment?: string | undefined;
};
const STEEL_GRADES = [
  'Fe415',
  'Fe415D',
  'Fe500',
  'Fe500D',
  'Fe550',
  'Fe550D',
  'Fe600',
] as const;
export { STEEL_GRADES };
export type SteelGrade = (typeof STEEL_GRADES)[number];
export type SteelSpecification = { brand: string; grade: SteelGrade | null };

/** Prefer structured grade; do not infer a grade from an unspecified brand.
 * Old brochures frequently put a single strength value in "Tata 550 TMT".
 * Retain that explicit numeric strength, but do not add a ductility suffix. */
export function quotedSteelSpecification(
  sections?: readonly QuoteSpec[],
): SteelSpecification | null {
  const row = sections?.find(
    (s) =>
      /\b(steel|tmt|reinforcement)\b/i.test(s.title ?? '') &&
      s.pricingTreatment !== 'excluded',
  );
  if (!row) return null;
  const read = (s: string) => {
    const matches = [
      ...s.matchAll(/\b(?:fe\s*)?(415|500|550|600)\s*(d)?\b/gi),
    ].map((m) => ('Fe' + m[1] + (m[2] ? 'D' : '')) as SteelGrade);
    const unique = [...new Set(matches)];
    return unique.length === 1 && STEEL_GRADES.includes(unique[0]!)
      ? unique[0]!
      : null;
  };
  return {
    brand: row.brand?.trim() ?? '',
    grade: row.grade?.trim()
      ? read(row.grade)
      : read([row.brand, row.description].filter(Boolean).join(' ')),
  };
}
