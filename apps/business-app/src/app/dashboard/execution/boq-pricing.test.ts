import { describe, expect, it } from 'vitest';
import {
  brandSelectionsFromQuote,
  MATERIAL_GROUPS,
  rateForOutput,
  starterRate,
  type Rate,
} from './boq-pricing';

const rates: Rate[] = [
  {
    key: 'bricks::local',
    label: 'Local',
    unit: 'each',
    rate: 7,
    category: 'material',
    material: 'bricks',
    variant: 'Local',
  },
  {
    key: 'bricks::karimnagar',
    label: 'Karimnagar',
    unit: 'each',
    rate: 9.5,
    category: 'material',
    material: 'bricks',
    variant: 'Karimnagar',
    isDefault: true,
  },
  {
    key: 'steel_16::jsw',
    label: 'JSW',
    unit: 'rod',
    rate: 1250,
    category: 'material',
    material: 'steel_16',
    variant: 'JSW',
    isDefault: true,
  },
  {
    key: 'steel_16::vizag',
    label: 'Vizag',
    unit: 'rod',
    rate: 1180,
    category: 'material',
    material: 'steel_16',
    variant: 'Vizag',
  },
  {
    key: 'steel_12::vizag',
    label: 'Vizag',
    unit: 'rod',
    rate: 660,
    category: 'material',
    material: 'steel_12',
    variant: 'Vizag',
  },
  {
    key: 'internal plaster::sqft',
    label: 'Internal plaster',
    unit: 'sqft',
    rate: 22,
    category: 'labour',
  },
];

describe('BOQ rate resolution', () => {
  it('uses the brand / source chosen on the BOQ', () => {
    const bricks = { name: 'Bricks', unit: 'each', material: 'bricks' };
    expect(rateForOutput(bricks, rates, { bricks: 'Local' })).toBe(7);
    expect(rateForOutput(bricks, rates, { bricks: 'Karimnagar' })).toBe(9.5);
  });

  it('falls back to the default variant', () => {
    expect(
      rateForOutput(
        { name: 'Bricks', unit: 'each', material: 'bricks' },
        rates,
      ),
    ).toBe(9.5);
    expect(
      rateForOutput(
        { name: '16 mm TMT', unit: 'rod', material: 'steel', diameter: 16 },
        rates,
      ),
    ).toBe(1250);
  });

  it('prices steel per rod by diameter for the brand chosen on the BOQ', () => {
    const choice = { steel: 'Vizag' };
    expect(
      rateForOutput(
        { name: '16 mm TMT', unit: 'rod', material: 'steel', diameter: 16 },
        rates,
        choice,
      ),
    ).toBe(1180);
    expect(
      rateForOutput(
        { name: '12 mm TMT', unit: 'rod', material: 'steel', diameter: 12 },
        rates,
        choice,
      ),
    ).toBe(660);
    // Manual takeoff bars carry the diameter in their name.
    expect(
      rateForOutput({ name: '12 mm main bars', unit: 'rod' }, rates, choice),
    ).toBe(660);
  });

  it('prices manual takeoff bricks through the material group', () => {
    expect(
      rateForOutput({ name: 'Bricks', unit: 'each' }, rates, {
        bricks: 'Local',
      }),
    ).toBe(7);
  });

  it('keeps fixed quoted allowance rates and plain rate lines', () => {
    expect(
      rateForOutput(
        { name: 'Internal doors', unit: 'door', rate: 10000 },
        rates,
      ),
    ).toBe(10000);
    expect(
      rateForOutput({ name: 'Internal plaster', unit: 'sqft' }, rates),
    ).toBe(22);
  });
});

describe('BOQ default prices and quoted brands', () => {
  it('prices a steel rod from the brand price per kg', () => {
    const steel16 = MATERIAL_GROUPS.find((group) => group.key === 'steel_16')!;
    // 16 mm: 16² / 162 × 12 m = 18.96 kg; Vizag ₹68/kg.
    expect(starterRate(steel16, 'Vizag (RINL)')).toBe(1289);
    expect(starterRate(steel16, 'JSW')).toBe(1365);
    const labour = MATERIAL_GROUPS.find(
      (group) => group.key === 'labour_brickwork_9',
    )!;
    expect(starterRate(labour, 'Contract')).toBe(30);
  });

  it('picks the brands named in the quotation specifications', () => {
    const withVizag: Rate[] = [
      ...rates,
      {
        key: 'steel_16::vizag-(rinl)',
        label: 'Vizag (RINL)',
        unit: 'rod',
        rate: 1289,
        category: 'material',
        material: 'steel_16',
        variant: 'Vizag (RINL)',
      },
    ];
    expect(
      brandSelectionsFromQuote(
        [
          { title: 'Steel / TMT', brand: 'Visakha or JSW', description: '' },
          { title: 'Bricks / blocks', description: 'Local red bricks 9 in' },
          { title: 'Flooring tiles', brand: 'Kajaria' },
        ],
        withVizag,
      ),
    ).toEqual({ steel: 'Vizag (RINL)', bricks: 'Local' });
  });
});
