import { describe, expect, it } from 'vitest';
import { calculateSftEstimate, encodeSftEstimate } from './sft-quotation';
import { constructionPlanFromQuotedDescriptions } from './quote-construction-handoff';

function acceptedDescription(
  rows = [
    { name: 'Ground Floor', kind: 'floor' as const },
    { name: 'First Floor', kind: 'floor' as const },
    { name: 'Second Floor', kind: 'floor' as const },
    { name: 'Compound Wall', kind: 'additional' as const },
  ],
) {
  const quoted = calculateSftEstimate({
    rows: rows.map((row) => ({
      ...row,
      lengthFeet: '35',
      widthFeet: '40',
      ratePerSqft: '1750',
    })),
    materialIds: [],
    sections: [
      {
        title: 'Tiles',
        description: 'Vitrified floor tiles as described in the package',
        brand: 'Customer-selected brand',
      },
    ],
  });
  return encodeSftEstimate(quoted);
}

describe('approved quotation to construction-stage snapshot', () => {
  it('uses only accepted floor rows, retaining the additional work and quoted specifications', () => {
    const plan = constructionPlanFromQuotedDescriptions([
      'ordinary quotation line',
      acceptedDescription(),
    ]);
    expect(plan?.floors.map((row) => row.code)).toEqual([
      'GROUND_FLOOR',
      'FIRST_FLOOR',
      'SECOND_FLOOR',
    ]);
    expect(
      plan?.stages.filter((stage) => stage.templateCode === 'RCC'),
    ).toHaveLength(3);
    const scope = plan?.stages.find(
      (stage) => stage.templateCode === 'QUOTED_SCOPE',
    );
    expect(scope?.activities.join(' ')).toContain('Compound Wall');
    expect(scope?.activities.join(' ')).toContain('Customer-selected brand');
    expect(scope?.activities.join(' ')).not.toContain('1750');
    expect(
      plan?.stages.find((stage) => stage.templateCode === 'PRECONSTRUCTION')
        ?.dependsOn,
    ).toEqual(['QUOTED_SCOPE']);
  });

  it('accepts common numeric floor labels from the issued quotation', () => {
    const result = constructionPlanFromQuotedDescriptions([
      acceptedDescription([
        { name: 'G+1', kind: 'floor' },
        { name: '1st Floor', kind: 'floor' },
      ]),
    ]);
    expect(result?.floors.map((floor) => floor.code)).toEqual([
      'G_1',
      'F_1ST_FLOOR',
    ]);
    expect(
      result?.stages.find((stage) => stage.instanceCode === 'RCC/F_1ST_FLOOR'),
    ).toBeDefined();
  });

  it('does not fabricate stages if the approved quote lacks a floor-wise schedule', () => {
    expect(
      constructionPlanFromQuotedDescriptions(['Normal interior quote']),
    ).toBeNull();
    expect(constructionPlanFromQuotedDescriptions([])).toBeNull();
  });

  it('rejects duplicate floor names and multiple conflicting schedules', () => {
    const duplicate = acceptedDescription([
      { name: 'Ground Floor', kind: 'floor' },
      { name: 'Ground Floor', kind: 'floor' },
    ]);
    expect(() => constructionPlanFromQuotedDescriptions([duplicate])).toThrow(
      'duplicate or invalid',
    );
    const description = acceptedDescription();
    expect(() =>
      constructionPlanFromQuotedDescriptions([description, description]),
    ).toThrow('multiple floor-wise');
  });

  it('keeps all physical stages planned and never generates financial transactions', () => {
    const plan = constructionPlanFromQuotedDescriptions([
      acceptedDescription(),
    ]);
    expect(plan?.stages.every((stage) => !('paid' in stage))).toBe(true);
    expect(JSON.stringify(plan?.stages)).not.toContain('payment_request_id');
  });
});
