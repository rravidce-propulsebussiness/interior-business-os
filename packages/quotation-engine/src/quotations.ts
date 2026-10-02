import { z } from 'zod';
import { Decimal as D } from './decimal';
import { calculate } from './engine';
import { decimal, previewSchema } from './schema';
import type { Catalog, PreviewInput } from './schema';
import type { Calculation } from './engine';
const zero = D.from('0');
export const discountSchema = z
  .object({ kind: z.enum(['none', 'fixed', 'percentage']), value: decimal })
  .strict();
export type Discount = z.infer<typeof discountSchema>;
export const noDiscount: Discount = { kind: 'none', value: '0' };
export const catalogLineInputSchema = z
  .object({
    id: z.uuid().optional(),
    area_id: z.uuid().nullable(),
    sort_order: z.number().int().min(0).max(10000),
    optional: z.boolean(),
    description: z.string().max(3000),
    discount: discountSchema,
    override: z
      .object({ rate: decimal, reason: z.string().trim().min(3).max(500) })
      .strict()
      .nullable(),
    pricing: previewSchema,
  })
  .strict();
export const manualLineInputSchema = z
  .object({
    id: z.uuid().optional(),
    area_id: z.uuid().nullable(),
    sort_order: z.number().int().min(0).max(10000),
    optional: z.boolean(),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(3000),
    quantity: decimal,
    unit: z.string().trim().min(1).max(80),
    rate: decimal,
    reason: z.string().trim().min(3).max(500),
    discount: discountSchema,
    estimated_cost_rate: decimal.nullable(),
  })
  .strict();
export const snapshotDecimal = z
  .string()
  .regex(/^(0|[1-9]\d{0,79})(\.\d{1,100})?$/);
const specification = z.object({
  key: z.string(),
  label: z.string(),
  visibleCustomer: z.boolean(),
  value: z.union([z.string(), z.array(z.string()), z.boolean()]),
  options: z.array(z.object({ key: z.string(), label: z.string() })),
});
export const lineSnapshotSchema = z
  .object({
    snapshot_version: z.literal(1),
    line_type: z.enum(['catalog', 'manual']),
    name: z.string(),
    code: z.string(),
    category: z.string(),
    quantity: snapshotDecimal,
    unit: z.object({ key: z.string(), label: z.string() }),
    calculation: z.record(z.string(), z.json()).nullable(),
    pricing_input: previewSchema.nullable(),
    customer_specifications: z.array(
      z.object({ label: z.string(), value: z.string() }),
    ),
    original_amount: snapshotDecimal,
    effective_amount: snapshotDecimal,
    discount: discountSchema,
    discount_amount: snapshotDecimal,
    final_amount: snapshotDecimal,
    minimum_amount: snapshotDecimal.nullable(),
    override: z.object({ rate: decimal, reason: z.string() }).nullable(),
    manual_reason: z.string().nullable(),
    display_rate: snapshotDecimal,
    engine_version: z.string(),
  })
  .strict();
export type LineSnapshot = z.infer<typeof lineSnapshotSchema>;
export interface LineCost {
  estimatedCostRate: string;
  estimatedCost: string;
}
export const lineCostSchema = z.object({
  estimatedCostRate: snapshotDecimal,
  estimatedCost: snapshotDecimal,
});
export function applyDiscount(amount: string, discount: Discount) {
  discount = discountSchema.parse(discount);
  const basis = D.from(snapshotDecimal.parse(amount)),
    value = D.from(discount.value);
  if (discount.kind === 'none' && value.compare(zero) !== 0)
    throw new Error('No-discount value must be zero');
  if (discount.kind === 'percentage' && value.compare(D.from('100')) > 0)
    throw new Error('Percentage exceeds 100');
  const reduction =
    discount.kind === 'none'
      ? zero
      : discount.kind === 'fixed'
        ? value
        : basis.mul(value).mul(D.from('0.01'));
  if (reduction.compare(basis) > 0) throw new Error('Discount exceeds amount');
  return {
    discount: reduction.toString(),
    amount: basis.sub(reduction).toString(),
  };
}
export function customerSpecifications(calculation: Calculation) {
  return calculation.specifications
    .filter((s) => s.visibleCustomer)
    .map((s) => ({
      label: s.label,
      value: s.options.length
        ? s.options.map((o) => o.label).join(', ')
        : Array.isArray(s.value)
          ? s.value.join(', ')
          : typeof s.value === 'boolean'
            ? s.value
              ? 'Yes'
              : 'No'
            : s.value,
    }));
}
export function catalogLine(
  catalog: Catalog,
  input: z.infer<typeof catalogLineInputSchema>,
): { snapshot: LineSnapshot; cost: LineCost | null } {
  const calculation = calculate(catalog, input.pricing),
    item = catalog.items.find((i) => i.id === input.pricing.item_id)!;
  const { internal, ...publicCalculation } = calculation;
  const amount = input.override
    ? D.from(calculation.calculatedQuantity)
        .mul(D.from(input.override.rate))
        .toString()
    : calculation.finalCalculatedAmount;
  const discounted = applyDiscount(amount, input.discount),
    minimum =
      calculation.minimumSellingRate === null
        ? null
        : D.from(calculation.calculatedQuantity)
            .mul(D.from(calculation.minimumSellingRate))
            .toString();
  if (
    minimum !== null &&
    D.from(discounted.amount).compare(D.from(minimum)) < 0
  )
    throw new Error('Below minimum selling amount');
  return {
    snapshot: lineSnapshotSchema.parse({
      snapshot_version: 1,
      line_type: 'catalog',
      name: item.name,
      code: item.key,
      category:
        catalog.categories.find((c) => c.id === item.category_id)?.name ?? '',
      quantity: calculation.calculatedQuantity,
      unit: calculation.unit,
      calculation: publicCalculation,
      pricing_input: {
        ...input.pricing,
        answers: Object.fromEntries(
          calculation.specifications.map((s) => [s.key, s.value]),
        ),
      },
      customer_specifications: customerSpecifications(calculation),
      original_amount: calculation.finalCalculatedAmount,
      effective_amount: amount,
      discount: input.discount,
      discount_amount: discounted.discount,
      final_amount: discounted.amount,
      minimum_amount: minimum,
      override: input.override,
      manual_reason: null,
      display_rate: input.override?.rate ?? calculation.adjustedUnitRate,
      engine_version: calculation.calculationVersion,
    }),
    cost: internal
      ? {
          estimatedCostRate: internal.estimatedCostRate,
          estimatedCost: internal.estimatedCost,
        }
      : null,
  };
}
export function manualLine(input: z.infer<typeof manualLineInputSchema>): {
  snapshot: LineSnapshot;
  cost: LineCost | null;
} {
  const quantity = D.from(input.quantity);
  if (quantity.compare(zero) <= 0)
    throw new Error('Positive quantity required');
  const amount = quantity.mul(D.from(input.rate)).toString(),
    discounted = applyDiscount(amount, input.discount);
  return {
    snapshot: lineSnapshotSchema.parse({
      snapshot_version: 1,
      line_type: 'manual',
      name: input.name,
      code: '',
      category: '',
      quantity: input.quantity,
      unit: { key: 'manual', label: input.unit },
      calculation: null,
      pricing_input: null,
      customer_specifications: [],
      original_amount: amount,
      effective_amount: amount,
      discount: input.discount,
      discount_amount: discounted.discount,
      final_amount: discounted.amount,
      minimum_amount: null,
      override: null,
      manual_reason: input.reason,
      display_rate: input.rate,
      engine_version: 'manual/1',
    }),
    cost:
      input.estimated_cost_rate === null
        ? null
        : {
            estimatedCostRate: input.estimated_cost_rate,
            estimatedCost: quantity
              .mul(D.from(input.estimated_cost_rate))
              .toString(),
          },
  };
}
export function quotationTotals(
  lines: { snapshot: LineSnapshot; optional: boolean }[],
  discount: Discount,
) {
  const included = lines.filter((l) => !l.optional),
    sum = (rows: typeof lines, key: 'effective_amount' | 'final_amount') =>
      rows.reduce((v, l) => v.add(D.from(l.snapshot[key])), zero);
  const before = sum(included, 'effective_amount'),
    subtotal = sum(included, 'final_amount'),
    result = applyDiscount(subtotal.toString(), discount);
  // Proportional minimum check without division or rounding ambiguity.
  for (const line of included)
    if (
      line.snapshot.minimum_amount !== null &&
      D.from(line.snapshot.final_amount)
        .mul(D.from(result.amount))
        .compare(D.from(line.snapshot.minimum_amount).mul(subtotal)) < 0
    )
      throw new Error('Revision discount falls below a line minimum');
  return {
    line_subtotal: before.toString(),
    line_discount: before.sub(subtotal).toString(),
    subtotal: subtotal.toString(),
    revision_discount: result.discount,
    final_amount: result.amount,
    optional_amount: sum(
      lines.filter((l) => l.optional),
      'final_amount',
    ).toString(),
  };
}
export function estimatedContribution(finalAmount: string, costs: LineCost[]) {
  const cost = costs.reduce((v, c) => v.add(D.from(c.estimatedCost)), zero),
    amount = D.from(finalAmount),
    contribution = amount.sub(cost);
  // Percentage is informational, rounded half away from zero to two decimal places using integers.
  const numerator = contribution.n * amount.d * 10000n,
    denominator = contribution.d * amount.n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const percentage =
    denominator > 0n
      ? new D(
          (numerator < 0n ? -1n : 1n) *
            ((absolute + denominator / 2n) / denominator),
          100n,
        ).toString()
      : null;
  return {
    estimatedCost: cost.toString(),
    estimatedContribution: contribution.toString(),
    estimatedContributionPercent: percentage,
  };
}
export const revisionStatusSchema = z.enum([
  'draft',
  'issued',
  'superseded',
  'cancelled',
]);
export function canTransition(
  from: z.infer<typeof revisionStatusSchema>,
  to: z.infer<typeof revisionStatusSchema>,
) {
  return (
    (from === 'draft' && (to === 'issued' || to === 'cancelled')) ||
    (from === 'issued' && (to === 'superseded' || to === 'cancelled'))
  );
}
export function restorePricingInput(
  snapshot: LineSnapshot,
  at: string,
): PreviewInput {
  if (!snapshot.pricing_input) throw new Error('Not a catalog line');
  return previewSchema.parse({ ...snapshot.pricing_input, at });
}
export function validateCalculationSnapshot(snapshot: LineSnapshot) {
  lineSnapshotSchema.parse(snapshot);
  if (snapshot.calculation) {
    const c = snapshot.calculation;
    specification.array().parse(c.specifications);
    if (
      c.calculationVersion !== 'finished-work/1' ||
      Object.hasOwn(c, 'internal')
    )
      throw new Error('Unsupported or unsafe calculation snapshot');
  }
  return structuredClone(snapshot);
}
