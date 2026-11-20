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
};

export const MATERIAL_GROUPS = [
  {
    key: 'steel',
    label: 'Steel / TMT',
    unit: 'kg',
    category: 'material',
    starters: ['JSW', 'Vizag (RINL)', 'Local ISI'],
  },
  {
    key: 'cement',
    label: 'Cement',
    unit: 'bag',
    category: 'material',
    starters: ['UltraTech', 'Maha', 'Ramco'],
  },
  {
    key: 'bricks',
    label: 'Bricks',
    unit: 'each',
    category: 'material',
    starters: ['Local', 'Karimnagar'],
  },
  {
    key: 'sand',
    label: 'Sand',
    unit: 'm³',
    category: 'material',
    starters: ['River sand', 'M-sand'],
  },
  {
    key: 'aggregate',
    label: 'Aggregate',
    unit: 'm³',
    category: 'material',
    starters: ['Standard'],
  },
  {
    key: 'binding_wire',
    label: 'Binding wire',
    unit: 'kg',
    category: 'material',
    starters: ['Standard'],
  },
  {
    key: 'excavation',
    label: 'Excavation',
    unit: 'm³',
    category: 'labour',
    starters: ['JCB', 'Manual'],
  },
  {
    key: 'shuttering',
    label: 'Centering & shuttering',
    unit: 'sqft',
    category: 'labour',
    starters: ['Standard'],
  },
  {
    key: 'plaster_labour',
    label: 'Plastering labour',
    unit: 'sqft',
    category: 'labour',
    starters: ['Standard'],
  },
] as const satisfies readonly {
  key: string;
  label: string;
  unit: string;
  category: RateCategory;
  starters: readonly string[];
}[];

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
  if (unit === 'm³' && name.includes('sand')) return 'sand';
  if (unit === 'm³' && name.includes('aggregate')) return 'aggregate';
  if (unit === 'each' && name === 'bricks') return 'bricks';
  return undefined;
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
 * Unit rate for a BOQ output: a fixed rate on the output (quoted allowance)
 * wins; then the BOQ's brand / source for its material group; then a plain
 * rate line with the same name and unit.
 */
export function rateForOutput(
  output: PricedOutput,
  rates: readonly Rate[],
  selections: Readonly<Record<string, string>> = {},
): number {
  if (output.rate !== undefined && Number.isFinite(output.rate))
    return output.rate;
  const material = materialForOutput(output);
  if (material) {
    const variant = selectedVariant(rates, material, selections);
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
