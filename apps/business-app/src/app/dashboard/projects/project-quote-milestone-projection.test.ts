import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultStageRequirements } from '@business-os/core/quotation-stage-requirements';
import { quoteMilestoneProjection } from './project-quote-milestone-projection';

const savedFlow = (rows: Record<string, unknown>) =>
  '[QUOTATION_MILESTONE_FLOW]' + JSON.stringify({ version: 1, rows }) +
  '[/QUOTATION_MILESTONE_FLOW]';

const payment = (name: string, percent: number, stageCodes: string[]) =>
  ({ name, percent, stageCodes });

describe('quotation payment steps projected into one project timeline', () => {
  it('retains the exact saved payment count, order and percentages without splitting', () => {
    const saved = savedFlow({
      '0': [
        { kind: 'work', code: 'FOUNDATION', index: 0 },
        { kind: 'check', code: 'FOUNDATION', index: 0 },
        { kind: 'qc', code: 'FOUNDATION', index: 0 },
      ],
      '1': [{ kind: 'work', code: 'RCC/GROUND_FLOOR', index: 0 }],
    });
    const result = quoteMilestoneProjection(saved, [
      payment('Foundation package', 40, ['FOUNDATION']),
      payment('Ground slab', 35, ['RCC/GROUND_FLOOR']),
      payment('Final handover', 25, ['HANDOVER']),
    ]);
    expect(result.map((row) => [row.name, row.percent])).toEqual([
      ['Foundation package', 40], ['Ground slab', 35], ['Final handover', 25],
    ]);
    const requirements = defaultStageRequirements('FOUNDATION');
    expect(result[0]?.steps).toEqual([
      { kind: 'work', code: 'FOUNDATION', index: 0, title: requirements.work[0] },
      { kind: 'check', code: 'FOUNDATION', index: 0, title: requirements.checks[0] },
      { kind: 'qc', code: 'FOUNDATION', index: 0, title: requirements.checks[0] },
    ]);
    expect(result[2]?.steps).toEqual([]);
  });

  it('keeps legacy payment rows without guessing steps, amounts or dates', () => {
    const result = quoteMilestoneProjection('', [
      payment('Advance', 2, []),
      payment('RCC completion', 98, ['RCC/GROUND_FLOOR']),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]?.steps).toEqual([]);
    expect(result[1]?.steps).toEqual([]);
    expect(Object.keys(result[0] ?? {})).toEqual([
      'name', 'percent', 'stageCodes', 'steps',
    ]);
  });

  it('never projects a work reference onto another payment group', () => {
    const result = quoteMilestoneProjection(savedFlow({
      '0': [{ kind: 'work', code: 'RCC/GROUND_FLOOR', index: 0 }],
    }), [payment('Foundation only', 100, ['FOUNDATION'])]);
    expect(result[0]?.steps).toEqual([]);
  });

  it('only changes the project read model and view, not quote or finance storage', () => {
    const source = (file: string) =>
      readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(source('./project-v2-data.ts')).toContain('quoteMilestoneProjection(');
    expect(source('./project-flow-view.tsx')).toContain('<ProjectQuotePaymentFlow d={d} />');
    expect(source('./project-quote-payment-flow.tsx')).toContain('d.stageQc.records');
    expect(source('./project-quote-payment-flow.tsx')).toContain('d.stageProgress.work');
  });
});
