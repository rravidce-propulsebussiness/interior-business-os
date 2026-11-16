import { z } from 'zod';
import { companyConstructionStages } from './company-construction-defaults';

const snapshot = z
  .object({
    startDate: z.iso.date(),
    floors: z.array(z.string().trim().min(1).max(80)).min(1).max(18),
    stages: companyConstructionStages,
    // Amounts are quote-specific and never written back into the company template.
    paymentOverrides: z
      .record(
        z.string().min(1).max(160),
        z.number().finite().nonnegative().max(1000000000000),
      )
      .optional(),
  })
  .strict();
export type QuotationConstructionProgram = z.infer<typeof snapshot>;
const open = '[QUOTATION_CONSTRUCTION_PROGRAM]';
const close = '[/QUOTATION_CONSTRUCTION_PROGRAM]';

export function encodeQuotationConstructionProgram(
  value: QuotationConstructionProgram,
): string {
  const valid = snapshot.parse(value);
  const json = JSON.stringify(valid);
  if (json.length > 100000)
    throw new Error('Construction programme is too large.');
  return `${open}\n${json}\n${close}`;
}

export function savedQuotationConstructionProgram(
  terms: string,
): QuotationConstructionProgram | null {
  const matches = [
    ...terms.matchAll(
      /\[QUOTATION_CONSTRUCTION_PROGRAM\]([\s\S]*?)\[\/QUOTATION_CONSTRUCTION_PROGRAM\]/g,
    ),
  ];
  if (matches.length !== 1) return null;
  try {
    return snapshot.parse(JSON.parse(matches[0]?.[1] ?? ''));
  } catch {
    return null;
  }
}
