import { describe, expect, it } from 'vitest';
import {
  companyConstructionStages,
  defaultCompanyConstructionStages,
} from './company-construction-defaults';

describe('company construction stage templates', () => {
  it('has one-time pre-construction and foundation plus reusable floor stages', () => {
    expect(
      companyConstructionStages.parse(defaultCompanyConstructionStages),
    ).toHaveLength(8);
    expect(
      defaultCompanyConstructionStages
        .filter((stage) => !stage.repeatsPerFloor)
        .map((stage) => stage.id),
    ).toEqual(['preconstruction', 'design', 'foundation']);
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
      defaultCompanyConstructionStages.every((stage) =>
        stage.items.some((item) => item.kind === 'payment'),
      ),
    ).toBe(true);
    expect(
      defaultCompanyConstructionStages.every((stage) => stage.percent == null),
    ).toBe(true);
  });

  it('starts construction design with payment, then four ordered design deliverables', () => {
    const stage = defaultCompanyConstructionStages.find(
      (item) => item.id === 'design',
    );
    expect(stage?.items.map(({ kind, title }) => ({ kind, title }))).toEqual([
      { kind: 'payment', title: 'Design and Agreement Payment' },
      { kind: 'design', title: 'Floor Plan' },
      { kind: 'design', title: 'Structural Plan' },
      { kind: 'design', title: 'Elevation' },
      { kind: 'design', title: 'MEP Plans' },
    ]);
    expect(
      companyConstructionStages.safeParse(defaultCompanyConstructionStages).success,
    ).toBe(true);
    expect(
      defaultCompanyConstructionStages.find(
        (item) => item.id === 'preconstruction',
      )?.items[0]?.title,
    ).toBe('Price freeze payment');
  });

  it('accepts legacy shares and editable stage counts, rejects duplicate IDs and unsafe guide links', () => {
    expect(
      companyConstructionStages.safeParse(
        defaultCompanyConstructionStages.map((stage, index) =>
          index === 0 ? { ...stage, percent: 9 } : stage,
        ),
      ).success,
    ).toBe(true);
    expect(
      companyConstructionStages.safeParse([
        ...defaultCompanyConstructionStages,
        defaultCompanyConstructionStages[0]!,
      ]).success,
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

  it('accepts design items as a distinct saved workflow type', () => {
    const workflow = structuredClone(defaultCompanyConstructionStages);
    workflow[1]!.items.push({
      id: 'design-interior-elevation',
      kind: 'design',
      title: 'Prepare 3D elevation and owner approval',
      days: 3,
    });
    const result = companyConstructionStages.safeParse(workflow);
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data[1]?.items.at(-1)?.kind).toBe('design');
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
