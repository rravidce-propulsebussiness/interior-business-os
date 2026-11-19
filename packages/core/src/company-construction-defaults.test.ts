import { describe, expect, it } from 'vitest';
import {
  companyConstructionStages,
  defaultCompanyConstructionStages,
} from './company-construction-defaults';

describe('company construction stage templates', () => {
  it('has one-time pre-construction and foundation plus reusable floor stages', () => {
    expect(
      companyConstructionStages.parse(defaultCompanyConstructionStages),
    ).toHaveLength(10);
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
      defaultCompanyConstructionStages.every((stage) =>
        stage.items.some((item) => item.kind === 'payment'),
      ),
    ).toBe(true);
    expect(
      defaultCompanyConstructionStages.every((stage) => stage.percent == null),
    ).toBe(true);
  });

  it('includes both plastering stages after rough-in, with per-floor internal and one-time exterior work', () => {
    const stages = defaultCompanyConstructionStages;
    const electric = stages.findIndex(
      (stage) => stage.id === 'electrical-plumbing',
    );
    expect(
      stages.slice(electric + 1, electric + 3).map((stage) => stage.id),
    ).toEqual(['internal-plastering-shelves', 'external-plastering-elevation']);
    const internal = stages[electric + 1]!;
    const external = stages[electric + 2]!;
    expect(internal.name).toBe('Internal Plastering & Shelves');
    expect(external.name).toBe('External Plastering & Elevation');
    expect(internal.repeatsPerFloor).toBe(true);
    expect(external.repeatsPerFloor).toBe(false);
    expect(internal.days).toBe(0);
    expect(external.days).toBe(12);
    expect(internal.items[0]?.kind).toBe('payment');
    expect(external.items[0]?.kind).toBe('payment');
    expect(internal.items[0]?.days).toBe(0);
    expect(external.items[0]?.days).toBe(0);
    expect(external.items.some((item) => item.kind === 'material')).toBe(true);
    expect(external.items.some((item) => item.kind === 'work')).toBe(true);
    expect(external.items.some((item) => item.kind === 'check')).toBe(true);
    expect(external.items.some((item) => item.kind === 'qc')).toBe(true);
    expect(stages[electric + 3]?.id).toBe('tiles');
    expect(companyConstructionStages.safeParse(stages).success).toBe(true);
  });

  it('provides complete per-floor tile and painting work, materials, checks and QC', () => {
    const tiles = defaultCompanyConstructionStages.find(
      (stage) => stage.id === 'tiles',
    )!;
    const painting = defaultCompanyConstructionStages.find(
      (stage) => stage.id === 'painting',
    )!;

    for (const stage of [tiles, painting]) {
      expect(stage.repeatsPerFloor).toBe(true);
      expect(stage.items[0]?.kind).toBe('payment');
      expect(stage.items.some((item) => item.kind === 'material')).toBe(true);
      expect(stage.items.some((item) => item.kind === 'work')).toBe(true);
      expect(stage.items.some((item) => item.kind === 'check')).toBe(true);
      expect(stage.items.at(-1)?.kind).toBe('qc');
      expect(
        stage.items.reduce(
          (total, item) => total + (item.kind === 'payment' ? 0 : item.days),
          0,
        ),
      ).toBe(stage.days);
    }

    expect(tiles.items.some((item) => item.kind === 'test')).toBe(true);
    expect(
      tiles.items.find((item) => item.id === 'tiles-qc-waterproofing')?.title,
    ).toContain('before tile covering');
    expect(painting.items.some((item) => item.title.includes('exterior'))).toBe(
      true,
    );
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
    expect(stage?.days).toBe(15);
    expect(stage?.items.reduce((total, item) => total + item.days, 0)).toBe(
      stage?.days,
    );
    expect(
      companyConstructionStages.safeParse(defaultCompanyConstructionStages)
        .success,
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

  it('supports a detailed programme with up to 400 work and inspection items', () => {
    const makeStages = (total: number) =>
      Array.from({ length: Math.ceil(total / 100) }, (_, stageIndex) => {
        const count = Math.min(100, total - stageIndex * 100);
        return {
          id: `load-stage-${stageIndex}`,
          name: `Load stage ${stageIndex}`,
          repeatsPerFloor: false,
          days: 1,
          items: Array.from({ length: count }, (_, itemIndex) => {
            const index = stageIndex * 100 + itemIndex;
            return {
              id: `load-item-${index}`,
              kind: 'work' as const,
              title: `Work item ${index}`,
              days: 1,
            };
          }),
        };
      });

    expect(companyConstructionStages.safeParse(makeStages(400)).success).toBe(
      true,
    );
    expect(companyConstructionStages.safeParse(makeStages(401)).success).toBe(
      false,
    );
  });
});
