import { describe, expect, it } from 'vitest';
import { expandConstructionStages } from './construction-workflow';
import {
  milestoneConstructionStages,
  guidanceForConstructionStage,
} from './construction-payment-schedule';
import { constructionPlanFromQuotedDescriptions } from './quote-construction-handoff';
import { calculateSftEstimate, encodeSftEstimate } from './sft-quotation';

describe('reusable construction stage mapping', () => {
  it('allows first-floor brickwork while third-floor slab continues', () => {
    const floorNames = ['Ground', 'First', 'Second', 'Third'];
    const floors = floorNames.map((name) => ({
      code: name.toUpperCase(),
      name,
    }));
    const template = {
      industry: 'construction' as const,
      version: '1.1.0',
      stages: milestoneConstructionStages(),
    };
    const stages = expandConstructionStages(template, floors);
    const masonry = stages.find((s) => s.instanceCode === 'MASONRY/FIRST')!;
    const rcc3 = stages.find((s) => s.instanceCode === 'RCC/THIRD')!;
    expect(masonry.dependsOn).toContain('RCC/FIRST');
    expect(masonry.dependsOn).not.toContain('RCC/THIRD');
    expect(rcc3.dependsOn).toContain('RCC/SECOND');
    expect(
      stages.find((s) => s.instanceCode === 'INTERNAL_PLASTER/FIRST')
        ?.dependsOn,
    ).toEqual(['MASONRY/FIRST']);
    expect(
      stages.find((s) => s.instanceCode === 'DOORS/FIRST')?.dependsOn,
    ).toContain('TILES/FIRST');
    expect(masonry.activities).not.toContain(
      'Electrical conduits and plumbing concealed runs',
    );
    expect(
      stages
        .find((s) => s.instanceCode === 'INTERNAL_PLASTER/FIRST')
        ?.activities.join(' '),
    ).toMatch(/electrical conduit and plumbing provision/i);
  });
  it('fits final fixtures and snagging after tiles, doors and painting', () => {
    const floors = [{ code: 'FIRST', name: 'First' }];
    const stages = expandConstructionStages(
      {
        industry: 'construction' as const,
        version: '1.1.0',
        stages: milestoneConstructionStages(),
      },
      floors,
    );
    const finals = stages.find(
      (s) => s.instanceCode === 'PLUMBING_PAINT/FIRST',
    )!;
    expect(finals.dependsOn).toContain('DOORS/FIRST');
    expect(finals.dependsOn).not.toContain('INTERNAL_PLASTER/FIRST');
    const order = milestoneConstructionStages().map((s) => s.code);
    expect(order.indexOf('PLUMBING_PAINT')).toBeGreaterThan(
      order.indexOf('DOORS'),
    );
    expect(order.indexOf('DOORS')).toBeGreaterThan(order.indexOf('TILES'));
  });
  it('adds suggested QC tests, materials and report lists but no artificial results or material quantities', () => {
    const foundation = guidanceForConstructionStage('FOUNDATION');
    expect(foundation.checks.join(' ')).toMatch(/concrete|footing/i);
    expect(guidanceForConstructionStage('PLINTH').checks.join(' ')).toMatch(
      /compaction/i,
    );
    expect(
      guidanceForConstructionStage('INTERNAL_PLASTER').checks.join(' '),
    ).toMatch(/pressure/i);
    expect(guidanceForConstructionStage('TILES').checks.join(' ')).toMatch(
      /tile/i,
    );
    expect('passed' in foundation).toBe(false);
    expect('quantity' in foundation).toBe(false);
  });
  it('uses accepted quoted floors without introducing unquoted floors', () => {
    const scope = calculateSftEstimate({
      rows: [
        {
          name: 'Ground',
          kind: 'floor',
          lengthFeet: '30',
          widthFeet: '40',
          ratePerSqft: '1750',
        },
        {
          name: 'First',
          kind: 'floor',
          lengthFeet: '30',
          widthFeet: '40',
          ratePerSqft: '1750',
        },
      ],
      materialIds: [],
    });
    const plan = constructionPlanFromQuotedDescriptions([
      encodeSftEstimate(scope),
    ])!;
    expect(
      plan.stages.filter((s) => s.templateCode === 'INTERNAL_PLASTER'),
    ).toHaveLength(2);
    expect(plan.stages.filter((s) => s.templateCode === 'RCC')).toHaveLength(2);
    expect(
      plan.stages.filter((s) => s.templateCode === 'FINISHES'),
    ).toHaveLength(0);
  });
});
