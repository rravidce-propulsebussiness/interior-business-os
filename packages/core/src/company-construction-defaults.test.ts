import { describe, expect, it } from 'vitest';
import {
  companyConstructionStages,
  defaultCompanyConstructionStages,
} from './company-construction-defaults';

describe('company construction stage templates', () => {
  it('has one-time pre-construction and foundation plus reusable floor stages', () => {
    expect(
      companyConstructionStages.parse(defaultCompanyConstructionStages),
    ).toHaveLength(7);
    expect(
      defaultCompanyConstructionStages
        .filter((stage) => !stage.repeatsPerFloor)
        .map((stage) => stage.id),
    ).toEqual(['preconstruction', 'foundation']);
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
    expect(defaultCompanyConstructionStages.every((stage) => stage.percent === undefined)).toBe(true);
  });

  it('accepts per-quote payment markers but rejects incomplete stages and unsafe guides', () => {
    expect(companyConstructionStages.safeParse(defaultCompanyConstructionStages.map((stage,index) => index === 0 ? {...stage, items: [{id:'pay-1',kind:'payment',title:'Payment on approval',days:0}]} : stage)).success).toBe(true);
    expect(
      companyConstructionStages.safeParse(
        defaultCompanyConstructionStages.slice(1),
      ).success,
    ).toBe(false);
    const withUnsafeGuide = defaultCompanyConstructionStages.map(
      (stage, index) =>
        index === 0
          ? {
              ...stage,
              items: [
                {
                  id: 'guide-1',
                  kind: 'work' as const,
                  title: 'Survey the site',
                  days: 1,
                  guideVideoUrl: 'http://example.test',
                },
              ],
            }
          : stage,
    );
    expect(companyConstructionStages.safeParse(withUnsafeGuide).success).toBe(
      false,
    );
  });

  it('requires a site check or test before QC in each stage', () => {
    const invalid = defaultCompanyConstructionStages.map((stage, index) =>
      index === 0
        ? {
            ...stage,
            items: [
              {
                id: 'qc-1',
                kind: 'qc' as const,
                title: 'Review the inspection',
                days: 1,
              },
            ],
          }
        : stage,
    );
    expect(companyConstructionStages.safeParse(invalid).success).toBe(false);
    const valid = defaultCompanyConstructionStages.map((stage, index) =>
      index === 0
        ? {
            ...stage,
            items: [
              {
                id: 'check-1',
                kind: 'check' as const,
                title: 'Check site boundaries',
                days: 1,
              },
              {
                id: 'qc-1',
                kind: 'qc' as const,
                title: 'Review boundary check',
                days: 1,
              },
            ],
          }
        : stage,
    );
    expect(companyConstructionStages.safeParse(valid).success).toBe(true);
  });
});
