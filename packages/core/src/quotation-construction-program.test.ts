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
  it('keeps one-time and per-floor stages with a 100% payment allocation', () => {
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
      defaultCompanyConstructionStages.reduce(
        (sum, stage) => sum + stage.percent,
        0,
      ),
    ).toBe(100);
  });

  it('round trips a quote-specific floor and date snapshot without exposing it as terms text', () => {
    const program = {
      startDate: '2026-11-16',
      skipSundays: true,
      floors: ['Ground', 'First'],
      stages: defaultCompanyConstructionStages,
    };
    const encoded = encodeQuotationConstructionProgram(program);
    expect(
      savedQuotationConstructionProgram(`Customer terms\n${encoded}`),
    ).toEqual(program);
    expect(
      savedQuotationConstructionProgram(`${encoded}\n${encoded}`),
    ).toBeNull();
  });

  it('keeps older quotation snapshots using the Sunday-excluding calendar', () => {
    const legacy = encodeQuotationConstructionProgram({
      startDate: '2026-11-16',
      skipSundays: true,
      floors: ['Ground'],
      stages: defaultCompanyConstructionStages,
    }).replace('"skipSundays":true,', '');

    expect(savedQuotationConstructionProgram(legacy)?.skipSundays).toBe(true);
  });
});
