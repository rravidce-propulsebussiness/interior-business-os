import { describe, expect, it } from 'vitest';
import {
  applyDiscount,
  canTransition,
  estimatedContribution,
  manualLine,
  manualLineInputSchema,
  noDiscount,
  quotationTotals,
} from './quotations';

const manual = (rate = '100', quantity = '1') =>
  manualLine(
    manualLineInputSchema.parse({
      area_id: null,
      sort_order: 0,
      optional: false,
      name: 'Installation',
      description: '',
      quantity,
      unit: 'each',
      rate,
      reason: 'Special installation',
      discount: noDiscount,
      estimated_cost_rate: '30',
    }),
  );

describe('quotation commercial arithmetic', () => {
  it('retains exact fractional arithmetic without floating point', () => {
    expect(manual('0.1', '0.2').snapshot.final_amount).toBe('0.02');
    expect(applyDiscount('0.3', { kind: 'percentage', value: '10' })).toEqual({
      discount: '0.03',
      amount: '0.27',
    });
  });
  it('applies line discounts before revision discounts and excludes options', () => {
    const snapshot = manual().snapshot;
    snapshot.discount = { kind: 'fixed', value: '10' };
    snapshot.discount_amount = '10';
    snapshot.final_amount = '90';
    expect(
      quotationTotals(
        [
          { snapshot, optional: false },
          { snapshot: manual('500').snapshot, optional: true },
        ],
        { kind: 'percentage', value: '10' },
      ),
    ).toEqual({
      line_subtotal: '100',
      line_discount: '10',
      subtotal: '90',
      revision_discount: '9',
      final_amount: '81',
      optional_amount: '500',
    });
  });
  it('rejects negative, excessive and malformed discounts', () => {
    for (const discount of [
      { kind: 'fixed', value: '101' },
      { kind: 'percentage', value: '100.01' },
      { kind: 'none', value: '1' },
      { kind: 'fixed', value: '-1' },
    ] as const)
      expect(() => applyDiscount('100', discount)).toThrow();
  });
  it('blocks revision discounts below a line minimum, including fractional boundaries', () => {
    const snapshot = manual().snapshot;
    snapshot.minimum_amount = '90';
    expect(() =>
      quotationTotals([{ snapshot, optional: false }], {
        kind: 'fixed',
        value: '10.000001',
      }),
    ).toThrow();
    expect(
      quotationTotals([{ snapshot, optional: false }], {
        kind: 'fixed',
        value: '10',
      }).final_amount,
    ).toBe('90');
  });
  it('keeps manual costs separate and rejects zero quantities', () => {
    const line = manual('100', '2');
    expect(line.cost).toEqual({ estimatedCostRate: '30', estimatedCost: '60' });
    expect(JSON.stringify(line.snapshot)).not.toContain('estimatedCost');
    expect(line.snapshot.calculation).toBeNull();
    expect(() => manual('1', '0')).toThrow();
  });
  it('handles losses and zero revenue without dividing by zero', () => {
    expect(
      estimatedContribution('100', [
        { estimatedCostRate: '120', estimatedCost: '120' },
      ]).estimatedContributionPercent,
    ).toBe('-20');
    expect(
      estimatedContribution('0', []).estimatedContributionPercent,
    ).toBeNull();
  });
  it('does not permit reissuing cancelled or superseded revisions', () => {
    expect(canTransition('draft', 'issued')).toBe(true);
    expect(canTransition('issued', 'superseded')).toBe(true);
    expect(canTransition('cancelled', 'issued')).toBe(false);
    expect(canTransition('superseded', 'draft')).toBe(false);
  });
});
