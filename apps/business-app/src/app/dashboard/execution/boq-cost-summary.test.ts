import { describe, expect, it } from 'vitest';
import { costSummaryByHead } from './boq-cost-summary';
import { costHead, effectiveRates, rateForOutput } from './boq-pricing';

describe('material-wise BOQ cost', () => {
  it('totals each material with its purchase quantity, steel in kg', () => {
    const rows = costSummaryByHead([
      {
        head: 'Steel',
        quantity: 100,
        unit: 'rod',
        rate: 725,
        weightKg: 1065.6,
      },
      { head: 'Steel', quantity: 50, unit: 'rod', rate: 1289, weightKg: 947.2 },
      { head: 'Cement', quantity: 300, unit: 'bag', rate: 390 },
      { head: 'Cement', quantity: 120, unit: 'bag', rate: 330 },
      { head: 'Sand', quantity: 40, unit: 't', rate: 1750 },
      { head: 'Electrical', quantity: 10, unit: 'coil', rate: 1900 },
      { head: 'Bricks', quantity: 1000, unit: 'nos', rate: 0 },
    ]);
    expect(rows.map((row) => row.head)).toEqual([
      'Cement',
      'Sand',
      'Steel',
      'Electrical',
    ]);
    expect(rows.find((row) => row.head === 'Steel')).toMatchObject({
      quantity: 2012.8,
      unit: 'kg',
      amount: 100 * 725 + 50 * 1289,
    });
    expect(rows.find((row) => row.head === 'Cement')).toMatchObject({
      quantity: 420,
      unit: 'bag',
    });
    expect(rows.find((row) => row.head === 'Electrical')?.quantity).toBeNull();
  });

  it('prices scaffolding for external plaster under its own head', () => {
    expect(costHead('scaffolding')).toBe('Scaffolding');
    expect(
      rateForOutput(
        {
          name: 'Scaffolding (external plaster)',
          unit: 'sqft',
          material: 'scaffolding',
        },
        effectiveRates([]),
      ),
    ).toBe(10);
  });
});
