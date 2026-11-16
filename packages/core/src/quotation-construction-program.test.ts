import { describe, expect, it } from 'vitest';
import {
  companyConstructionStages,
  defaultCompanyConstructionStages,
} from './company-construction-defaults';
import {
  encodeQuotationConstructionProgram,
  savedQuotationConstructionProgram,
} from './quotation-construction-program';

describe('reusable construction stage programme', () => {
  it('keeps one-time and per-floor stages without universal payment shares', () => {
    expect(
      companyConstructionStages.parse(defaultCompanyConstructionStages),
    ).toHaveLength(7);
    expect(
      defaultCompanyConstructionStages
        .filter((stage) => stage.repeatsPerFloor)
        .map((stage) => stage.id),
    ).toEqual([
      'slabs',
      'brickwork',
      'electrical-plumbing',
      'tiles',
      'painting',
    ]);
    expect(
      defaultCompanyConstructionStages.every((stage) => !('percent' in stage)),
    ).toBe(true);
  });

  it('round trips a quote-specific floor and date snapshot without exposing it as terms text', () => {
    const program = {
      startDate: '2026-11-16',
      floors: ['Ground', 'First'],
      stages: defaultCompanyConstructionStages,
      paymentOverrides: {
        'slabs|0|payment-slabs': 250000,
        'slabs|1|payment-slabs': 330000,
      },
    };
    const encoded = encodeQuotationConstructionProgram(program);
    expect(
      savedQuotationConstructionProgram(`Customer terms\n${encoded}`),
    ).toEqual(program);
    expect(
      savedQuotationConstructionProgram(`${encoded}\n${encoded}`),
    ).toBeNull();
  });
});
