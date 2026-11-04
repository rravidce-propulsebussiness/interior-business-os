import { describe, expect, it } from 'vitest';
import { calculateRevisionCost } from './revision-cost';

const lines = [{ id: 'a' }, { id: 'b' }];
const prices = [
  { line_id: 'a', estimated_cost: '3000.25', currency: 'INR' },
  { line_id: 'b', estimated_cost: '1999.75', currency: 'INR' },
];

describe('real BOQ revision financial completeness', () => {
  it('totals only fully priced, verified loaded lines', () => {
    expect(calculateRevisionCost(lines, prices, 'INR', true)).toEqual({
      total: 5000, priced: 2, unpriced: 0, currency: 'INR', complete: true,
    });
  });
  it('never reports missing or paginated prices as a complete budget', () => {
    expect(calculateRevisionCost(lines, prices.slice(0, 1), 'INR', true)).toMatchObject({
      total: null, priced: 1, unpriced: 1, complete: false,
    });
    expect(calculateRevisionCost(lines, prices, 'INR', false).total).toBeNull();
  });
  it('never mixes currencies, invalid numbers or missing lines', () => {
    expect(calculateRevisionCost(lines, [prices[0]!, { ...prices[1]!, currency: 'USD' }], 'INR', true).total).toBeNull();
    expect(calculateRevisionCost(lines, [prices[0]!, { ...prices[1]!, estimated_cost: 'bad' }], 'INR', true).total).toBeNull();
    expect(calculateRevisionCost([], [], 'INR', true).total).toBeNull();
  });
});
