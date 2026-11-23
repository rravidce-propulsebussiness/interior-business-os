import { describe, expect, it } from 'vitest';
import {
  clearDerivedPlasterQuantityOverrides,
  isAutoPlasterQuantity,
} from './boq-plaster-guards';

describe('wall-based plaster quantities', () => {
  it('locks only generated plaster cement and sand, not brickwork or tile materials', () => {
    expect(isAutoPlasterQuantity('quote-masonry', 'Cement (plaster)')).toBe(
      true,
    );
    expect(isAutoPlasterQuantity('quote-masonry', 'Sand (plaster)')).toBe(true);
    expect(isAutoPlasterQuantity('quote-masonry', 'Cement (brickwork)')).toBe(
      false,
    );
    expect(
      isAutoPlasterQuantity('quote-flooring', 'Cement (tile bedding)'),
    ).toBe(false);
  });

  it('clears zeroed or manually adjusted plaster quantities while retaining their rates', () => {
    const lines = [
      {
        section: 'Third Floor',
        kind: 'quote-masonry',
        outputs: [
          { name: 'Cement (plaster)', unit: 'bag' },
          { name: 'Sand (plaster)', unit: 't' },
          { name: 'Cement (brickwork)', unit: 'bag' },
        ],
      },
    ];
    const input = {
      'Third Floor|quote-masonry|Cement (plaster)|bag': {
        quantity: 0,
        rate: 360,
      },
      'Third Floor|quote-masonry|Sand (plaster)|t': { quantity: 2 },
      'Third Floor|quote-masonry|Cement (brickwork)|bag': {
        quantity: 12,
        rate: 350,
      },
    };
    const cleaned = clearDerivedPlasterQuantityOverrides(lines, input);
    expect(cleaned['Third Floor|quote-masonry|Cement (plaster)|bag']).toEqual({
      rate: 360,
    });
    expect(
      cleaned['Third Floor|quote-masonry|Sand (plaster)|t'],
    ).toBeUndefined();
    expect(cleaned['Third Floor|quote-masonry|Cement (brickwork)|bag']).toEqual(
      { quantity: 12, rate: 350 },
    );
    expect(cleaned).not.toBe(input);
    expect(clearDerivedPlasterQuantityOverrides(lines, cleaned)).toBe(cleaned);
  });
});
