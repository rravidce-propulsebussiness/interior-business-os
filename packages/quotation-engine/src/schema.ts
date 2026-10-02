import { z } from 'zod';
import { Decimal } from './decimal';
const validWindow = (row: { valid_from: string; valid_until: string | null }) =>
  !row.valid_until || Date.parse(row.valid_until) > Date.parse(row.valid_from);
export const decimal = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/);
export const signedDecimal = z
  .string()
  .regex(/^-?(0|[1-9]\d{0,11})(\.\d{1,6})?$/);
const key = z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(64),
  label = z.string().trim().min(1).max(200);
export const status = z.enum(['active', 'inactive']);
export const roundingSchema = z
  .object({
    mode: z.enum(['none', 'nearest', 'up', 'down']),
    step: decimal.refine((x) => /[1-9]/.test(x), 'Positive increment required'),
  })
  .strict();
export const conditionSchema = z
  .object({
    attribute_key: key,
    operator: z.enum(['equals', 'not_equals', 'in', 'not_in']),
    values: z.array(key).min(1).max(100),
  })
  .strict();
const common = {
  id: z.uuid(),
  organization_id: z.uuid(),
  version: z.number().int().positive(),
  status,
};
export const categorySchema = z.object({
  ...common,
  name: label,
  key,
  parent_id: z.uuid().nullable(),
  industry_id: z.uuid().nullable(),
  description: z.string().max(2000),
  sort_order: z.number().int(),
});
export const itemSchema = z.object({
  ...common,
  name: label,
  key,
  description: z.string().max(2000),
  category_id: z.uuid().nullable(),
  industry_id: z.uuid().nullable(),
  unit_key: key,
  method_key: key,
  quantity_rounding: roundingSchema,
  amount_rounding: roundingSchema,
  sort_order: z.number().int(),
});
export const attributeSchema = z.object({
  ...common,
  item_id: z.uuid(),
  key,
  label,
  input_type: z.enum(['select', 'multi_select', 'boolean', 'number', 'text']),
  required: z.boolean(),
  visible_sales: z.boolean(),
  visible_customer: z.boolean(),
  affects_pricing: z.boolean(),
  default_options: z.array(key).max(100),
  conditions: z.array(conditionSchema).max(20),
  help_text: z.string().max(1000),
  sort_order: z.number().int(),
});
export const optionSchema = z.object({
  ...common,
  item_id: z.uuid(),
  attribute_id: z.uuid(),
  key,
  label,
  description: z.string().max(2000),
  sort_order: z.number().int(),
});
export const bookSchema = z
  .object({
    ...common,
    name: label,
    key,
    currency: z.string().regex(/^[A-Z]{3}$/),
    branch_id: z.uuid().nullable(),
    is_default: z.boolean(),
    valid_from: z.iso.datetime({ offset: true }),
    valid_until: z.iso.datetime({ offset: true }).nullable(),
  })
  .refine(validWindow, 'Invalid effective window');
export const rateSchema = z
  .object({
    ...common,
    item_id: z.uuid(),
    price_book_id: z.uuid().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    base_rate: decimal,
    minimum_rate: decimal.nullable(),
    valid_from: z.iso.datetime({ offset: true }),
    valid_until: z.iso.datetime({ offset: true }).nullable(),
  })
  .refine(validWindow, 'Invalid effective window');
export const costSchema = z.object({
  ...common,
  rate_id: z.uuid(),
  estimated_cost_rate: decimal,
});
export const modifierSchema = z
  .object({
    ...common,
    item_id: z.uuid(),
    option_id: z.uuid().nullable(),
    price_book_id: z.uuid().nullable(),
    label,
    kind: z.enum(['per_unit', 'fixed', 'percentage']),
    value: signedDecimal,
    sort_order: z.number().int(),
  })
  .refine(
    (x) =>
      x.kind !== 'percentage' ||
      (signedDecimal.safeParse(x.value).success &&
        Decimal.from(x.value).compare(Decimal.from('-100')) >= 0 &&
        Decimal.from(x.value).compare(Decimal.from('1000')) <= 0),
    'Percentage must be between -100 and 1000',
  );
export const unitSchema = z.object({
  key,
  label,
  dimension: z.enum([
    'area',
    'length',
    'volume',
    'count',
    'scalar',
    'percentage',
    'custom',
  ]),
});
export const methodSchema = z.object({
  key,
  label,
  dimension: z.enum([
    'area',
    'length',
    'volume',
    'count',
    'scalar',
    'percentage',
    'custom',
  ]),
  fields: z.array(key),
});
export const catalogSchema = z.object({
  categories: z.array(categorySchema),
  items: z.array(itemSchema),
  attributes: z.array(attributeSchema),
  options: z.array(optionSchema),
  books: z.array(bookSchema),
  rates: z.array(rateSchema),
  costs: z.array(costSchema),
  modifiers: z.array(modifierSchema),
  units: z.array(unitSchema),
  methods: z.array(methodSchema),
  branches: z.array(
    z.object({ id: z.uuid(), organization_id: z.uuid(), name: label, status }),
  ),
});
export type Catalog = z.infer<typeof catalogSchema>;
export type Attribute = z.infer<typeof attributeSchema>;
export type Answers = Record<string, string | string[] | boolean>;
export const previewSchema = z
  .object({
    organization_id: z.uuid(),
    item_id: z.uuid(),
    price_book_id: z.uuid().nullable(),
    branch_id: z.uuid().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    at: z.iso.datetime({ offset: true }),
    measurements: z.record(key, decimal),
    answers: z.record(
      key,
      z.union([z.string().max(1000), z.array(key).max(100), z.boolean()]),
    ),
  })
  .strict();
export type PreviewInput = z.infer<typeof previewSchema>;
export const entitySchemas = {
  catalog_categories: categorySchema,
  catalog_items: itemSchema,
  catalog_item_attributes: attributeSchema,
  catalog_attribute_options: optionSchema,
  price_books: bookSchema,
  price_book_items: rateSchema,
  pricing_modifiers: modifierSchema,
  pricing_costs: costSchema,
};
export type Entity = keyof typeof entitySchemas;
