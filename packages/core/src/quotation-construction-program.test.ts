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
  it('keeps one-time and per-floor stages with payment markers instead of fixed shares', () => {
    expect(
      companyConstructionStages.parse(defaultCompanyConstructionStages),
    ).toHaveLength(10);
    expect(
      defaultCompanyConstructionStages
        .filter((stage) => stage.repeatsPerFloor)
        .map((stage) => stage.id),
    ).toEqual([
      'slabs',
      'brickwork',
      'electrical-plumbing',
      'internal-plastering-shelves',
      'tiles',
      'painting',
    ]);
    expect(
      defaultCompanyConstructionStages
        .filter((stage) => !stage.repeatsPerFloor)
        .map((stage) => stage.id),
    ).toEqual([
      'preconstruction',
      'design',
      'foundation',
      'external-plastering-elevation',
    ]);
    expect(
      defaultCompanyConstructionStages.every((stage) =>
        stage.items.some((item) => item.kind === 'payment'),
      ),
    ).toBe(true);
    expect(
      defaultCompanyConstructionStages.every((stage) => !('percent' in stage)),
    ).toBe(true);
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

  it('preserves Design items in immutable quotation programme snapshots', () => {
    const stages = structuredClone(defaultCompanyConstructionStages);
    stages[1]!.items.push({
      id: 'design-owner-approval',
      kind: 'design',
      title: 'Owner approval for 3D elevation',
      days: 2,
    });
    const encoded = encodeQuotationConstructionProgram({
      startDate: '2026-11-18',
      skipSundays: true,
      floors: ['Ground'],
      stages,
    });
    const snapshot = savedQuotationConstructionProgram(encoded);
    expect(snapshot?.stages[1]?.items.at(-1)?.kind).toBe('design');
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
