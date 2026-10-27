import { z } from 'zod';

/**
 * Immutable customer-facing snapshot. Company rates may change later, but the
 * quoted brand, physical-unit price, consumption and SFT total never drift.
 */
export const CUSTOM_BRAND_QUOTE_PREFIX = 'CUSTOM_BRAND_QUOTE_V1:';
const amount = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,4})?$/);
const choiceSchema = z
  .object({
    id: z.uuid(),
    category: z.string().min(2).max(50),
    name: z.string().min(2).max(120),
    specification: z.string().max(250),
    unitPrice: amount,
    priceUnit: z.string().min(1).max(30),
    consumptionPerSqft: amount,
    ratePerSqft: amount,
  })
  .strict();

export const customBrandQuoteSchema = z
  .object({
    areaSqft: amount,
    ratePerSqft: amount,
    total: amount,
    selections: z.array(choiceSchema).min(1).max(20),
  })
  .strict();
export type CustomBrandQuote = z.infer<typeof customBrandQuoteSchema>;

export function encodeCustomBrandQuote(raw: unknown): string {
  const parsed = customBrandQuoteSchema.parse(raw);
  const result = CUSTOM_BRAND_QUOTE_PREFIX + JSON.stringify(parsed);
  if (result.length > 12000)
    throw new Error('Too many material specifications');
  return result;
}

export function parseCustomBrandQuote(value: string): CustomBrandQuote | null {
  if (!value.startsWith(CUSTOM_BRAND_QUOTE_PREFIX) || value.length > 12000)
    return null;
  try {
    return customBrandQuoteSchema.parse(
      JSON.parse(value.slice(CUSTOM_BRAND_QUOTE_PREFIX.length)),
    );
  } catch {
    return null;
  }
}
