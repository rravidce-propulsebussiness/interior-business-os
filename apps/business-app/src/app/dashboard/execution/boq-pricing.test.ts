import { describe, expect, it } from 'vitest';
import {
  brandSelectionsFromQuote,
  costHead,
  effectiveRates,
  MATERIAL_GROUPS,
  rateForOutput,
  isBoqCostUnpriced,
  materialForOutput,
  starterRate,
  type Rate,
} from './boq-pricing';
import { DEFAULT_LABOUR, isEmbeddedLabourCovered } from './boq-labour';

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

  it('prices an unsaved rate card at the default prices, saved rates first', () => {
    const fresh = effectiveRates([]);
    expect(
      rateForOutput(
        { name: '16 mm main bars', unit: 'rod', diameter: 16 },
        fresh,
      ),
    ).toBe(1289);
    const saved = effectiveRates(rates);
    expect(
      rateForOutput({ name: 'Bricks', unit: 'nos', material: 'bricks' }, saved),
    ).toBe(9.5);
  });

  it('uses internal supplier rates instead of customer quotation allowances', () => {
    expect(
      rateForOutput(
        { name: 'Windows', unit: 'sqft', material: 'window', quotedRate: 1200 },
        effectiveRates([]),
      ),
    ).toBe(450);
    expect(
      rateForOutput(
        { name: 'Windows', unit: 'sqft', quotedRate: 1200, rate: 400 },
        [],
      ),
    ).toBe(400);
    expect(
      rateForOutput(
        { name: 'Custom extra', unit: 'LS', quotedRate: 25000 },
        [],
      ),
    ).toBe(0);
  });

  it('flags missing prices without treating reference volumes or zero quantities as costs', () => {
    const price = (output: Parameters<typeof rateForOutput>[0]) =>
      rateForOutput(output, []);
    expect(
      isBoqCostUnpriced(
        { name: 'Building permission', unit: 'LS', quantity: 1 },
        price,
      ),
    ).toBe(true);
    expect(
      isBoqCostUnpriced(
        { name: 'Quoted extra', unit: 'LS', quantity: 1, quotedRate: 10000 },
        price,
      ),
    ).toBe(true);
    expect(
      isBoqCostUnpriced(
        {
          name: 'PCC concrete volume (reference only)',
          unit: 'm³',
          quantity: 3,
          rate: 0,
        },
        price,
      ),
    ).toBe(false);
    expect(
      isBoqCostUnpriced(
        { name: 'Zero scope', unit: 'each', quantity: 0 },
        price,
      ),
    ).toBe(false);
    expect(
      isBoqCostUnpriced(
        { name: 'Paid item', unit: 'each', quantity: 1, rate: 123 },
        price,
      ),
    ).toBe(false);
  });

  it('defaults M20 at ₹5,000 / m³ and structural labour at ₹400 / sq ft', () => {
    const fresh = effectiveRates([]);
    expect(
      rateForOutput(
        { name: 'Slab concrete', unit: 'm³', material: 'concrete_m20' },
        fresh,
      ),
    ).toBe(5000);
    expect(
      rateForOutput(
        { name: 'Structural labour', unit: 'sqft', material: 'labour_civil' },
        fresh,
      ),
    ).toBe(400);
    expect(costHead('concrete_m20')).toBe('Concrete (M20)');
    expect(costHead('shuttering')).toBe('Structural labour');
    expect(costHead('cpvc_half')).toBe('Plumbing');
    expect(costHead('sanitary_cp')).toBe('Sanitary & CP fittings');
    expect(costHead('wire_15')).toBe('Electrical');
    expect(costHead('wall_tiles')).toBe('Bathroom tiles');
    expect(costHead('steel_16')).toBe('Steel');
  });
});

describe('shuttering covered by composite labour', () => {
  it('recognises generated centering & shuttering lines', () => {
    for (const name of [
      'Centering & shuttering',
      'Beam centering & shuttering',
      'Slab centering & shuttering',
    ])
      expect(materialForOutput({ name, unit: 'sqft' })).toBe('shuttering');
  });

  it('is not unpriced when the composite labour covers shuttering', () => {
    const output = {
      name: 'Slab centering & shuttering',
      unit: 'sqft',
      quantity: 1300,
      rate: 0,
    };
    expect(
      isEmbeddedLabourCovered(materialForOutput(output), {
        ...DEFAULT_LABOUR,
        coveredWorks: ['shuttering'],
      }),
    ).toBe(true);
  });
});

describe('wall and plaster labour covered by composite labour', () => {
  it('recognises measured wall and plaster lines', () => {
    expect(
      materialForOutput({
        name: '9 in W1 external 9in (external)',
        unit: 'sqft',
      }),
    ).toBe('labour_brickwork_9');
    expect(
      materialForOutput({
        name: '4.5 in W2 internal 4.5in (internal)',
        unit: 'sqft',
      }),
    ).toBe('labour_brickwork_4');
    expect(materialForOutput({ name: 'Internal plaster', unit: 'sqft' })).toBe(
      'plaster_labour',
    );
    expect(materialForOutput({ name: 'External plaster', unit: 'sqft' })).toBe(
      'plaster_labour',
    );
  });

  it('leaves unrelated sqft lines alone', () => {
    expect(materialForOutput({ name: 'Floor tiles', unit: 'sqft' })).toBe(
      undefined,
    );
  });
});
