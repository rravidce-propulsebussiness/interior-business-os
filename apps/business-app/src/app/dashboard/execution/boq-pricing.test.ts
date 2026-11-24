import { describe, expect, it } from 'vitest';
import {
  brandSelectionsFromQuote,
  quotedRateVariants,
  QUOTED_ALLOWANCE,
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

  describe('quotation brands and allowances price the BOQ', () => {
    // Sections as written on the live Premium quotation.
    const sections = [
      {
        title: 'Steel / TMT',
        brand: 'JAIRAJ 550 TMT or equivalent',
        description: 'Reinforcement; JAIRAJ 550 TMT or equivalent.',
      },
      {
        title: 'Cement',
        brand: 'UltraTech',
        description: 'UltraTech 53 RCC; Birla Shakti 43 brickwork/plaster',
      },
      {
        title: 'Electrical wiring',
        brand: 'Havells',
        description: 'Havells fireproof wire',
      },
      {
        title: 'Switches & sockets',
        brand: 'Anchor Penta',
        description: 'Anchor Penta',
      },
      {
        title: 'Electrical conduits',
        brand: 'Sudhakar',
        description: 'Sudhakar pipes',
      },
      {
        title: 'Room flooring tiles',
        description: 'Tile ceiling',
        unit: 'sqft',
        pricingTreatment: 'allowance',
        allowanceValue: '60',
      },
      {
        title: 'Main door',
        description: 'Teak',
        unit: 'door',
        pricingTreatment: 'allowance',
        allowanceValue: '30000',
      },
      {
        title: 'Kitchen wall tiles',
        description: 'Backsplash',
        unit: 'sqft',
        pricingTreatment: 'allowance',
        allowanceValue: '50',
      },
      {
        title: 'Bathroom sanitary & CP fittings',
        description: 'Hindware',
        unit: 'bathroom',
        pricingTreatment: 'allowance',
        allowanceValue: '30000',
      },
      {
        title: 'Kitchen sink',
        description: 'SS',
        unit: 'piece',
        pricingTreatment: 'allowance',
        allowanceValue: '3000',
      },
    ];
    const base = effectiveRates([]);
    const rates = [...base, ...quotedRateVariants(sections, base)];
    const picks = brandSelectionsFromQuote(sections, rates);

    it('uses the quoted purchase allowance as the material rate', () => {
      expect(picks.floor_tiles).toBe(QUOTED_ALLOWANCE);
      expect(
        rateForOutput(
          { name: 'Floor tiles', unit: 'sqft', material: 'floor_tiles' },
          rates,
          picks,
        ),
      ).toBe(60);
      expect(
        rateForOutput(
          { name: 'Main door', unit: 'door', material: 'door_main' },
          rates,
          picks,
        ),
      ).toBe(30000);
      expect(
        rateForOutput(
          {
            name: 'Kitchen wall tiles',
            unit: 'sqft',
            material: 'kitchen_wall_tiles',
          },
          rates,
          picks,
        ),
      ).toBe(50);
      expect(
        rateForOutput(
          { name: 'Sanitary', unit: 'bathroom', material: 'sanitary_cp' },
          rates,
          picks,
        ),
      ).toBe(30000);
      expect(
        rateForOutput(
          { name: 'Sink', unit: 'each', material: 'kitchen_sink' },
          rates,
          picks,
        ),
      ).toBe(3000);
    });

    it('adds brands the rate card does not list and selects them', () => {
      expect(picks.steel).toBe('JAIRAJ 550');
      expect(picks.wire_15).toBe('Havells FR');
      expect(picks.switch_6a).toBe('Anchor Penta');
      expect(picks.conduit).toBe('Sudhakar');
      expect(
        rates.filter(
          (rate) => rate.variant === 'Sudhakar' && rate.material === 'conduit',
        ),
      ).toHaveLength(1);
      expect(
        rates.some(
          (rate) => rate.variant === 'Havells' && rate.material === 'switch_6a',
        ),
      ).toBe(false);
      expect(
        rateForOutput(
          { name: '16 mm main bars', unit: 'rod', diameter: 16 },
          rates,
          picks,
        ),
      ).toBeGreaterThan(0);
    });

    it('reads RCC and masonry cement from their graded parts', () => {
      expect(picks.cement).toBe('UltraTech 53');
      expect(picks.cement_masonry).toBe('Birla 43');
    });
  });

  describe('each construction package prices its own brands', () => {
    // Brand lines as written in the company's four live packages.
    const pkg = (b: {
      steel: string;
      cement: string;
      wire: string;
      switches: string;
      conduit: string;
      plumbing: string;
      interior: string;
      exterior: string;
      tiles: string;
      parking: string;
    }) => [
      { title: 'Steel / TMT', brand: b.steel, description: '' },
      { title: 'Cement', brand: b.cement.split(' ')[0], description: b.cement },
      {
        title: 'Electrical wiring',
        brand: b.wire,
        description: b.wire + ' fireproof wire',
      },
      {
        title: 'Switches & sockets',
        brand: b.switches,
        description: b.switches,
      },
      {
        title: 'Electrical conduits',
        brand: b.conduit,
        description: b.conduit + ' pipes',
      },
      {
        title: 'Plumbing pipes & waterproofing',
        brand: b.plumbing,
        description: b.plumbing + ' CPVC/PVC',
      },
      { title: 'Interior painting', brand: '', description: b.interior },
      { title: 'Exterior painting', brand: '', description: b.exterior },
      {
        title: 'Room flooring tiles',
        description: 'Tiles',
        unit: 'sqft',
        pricingTreatment: 'allowance',
        allowanceValue: b.tiles,
      },
      {
        title: 'Parking area tiles',
        description: 'Anti-skid',
        unit: 'sqft',
        pricingTreatment: 'allowance',
        allowanceValue: b.parking,
      },
    ];
    const priced = (sections: ReturnType<typeof pkg>) => {
      const base = effectiveRates([]);
      const added = quotedRateVariants(sections, base);
      const rates = [...base, ...added];
      return { added, rates, picks: brandSelectionsFromQuote(sections, rates) };
    };
    const cases = [
      {
        name: 'Standard',
        sections: pkg({
          steel: 'SHREE 550 TMT or equivalent',
          cement: 'Nagarjuna 53 RCC; Priya 43 for masonry/internal works',
          wire: 'Finolex',
          switches: 'MARU Basic',
          conduit: 'Sudhakar',
          plumbing: 'Prince',
          interior:
            'Asian putty 2; Asian Tractor Emulsion 2 coats; primer 1 coat',
          exterior:
            'Putty/texture elevation 2; Asian primer 1; ACE exterior emulsion 2 coats',
          tiles: '45',
          parking: '45',
        }),
        expect: {
          steel: 'SHREE 550',
          cement: 'Nagarjuna 53',
          cement_masonry: 'Priya 43',
          wire_15: 'Finolex FR',
          switch_6a: 'Maru',
          conduit: 'Sudhakar',
          cpvc_half: 'Prince',
          swr_110: 'Prince',
          paint_interior: 'Asian putty + Tractor emulsion',
          paint_exterior: 'Asian primer + Ace emulsion',
        },
        tiles: 45,
      },
      {
        name: 'Premium',
        sections: pkg({
          steel: 'JAIRAJ 550 TMT or equivalent',
          cement: 'UltraTech 53 RCC; Birla Shakti 43 brickwork/plaster',
          wire: 'Havells',
          switches: 'Anchor Penta',
          conduit: 'Sudhakar',
          plumbing: 'Astral',
          interior:
            'Birla putty 2; Asian Premium Emulsion 2 coats; primer 1 coat',
          exterior:
            'Putty/texture elevation 2; Asian primer 1; ACE exterior emulsion 2 coats',
          tiles: '60',
          parking: '50',
        }),
        expect: {
          steel: 'JAIRAJ 550',
          cement: 'UltraTech 53',
          cement_masonry: 'Birla 43',
          wire_15: 'Havells FR',
          switch_6a: 'Anchor Penta',
          cpvc_half: 'Astral',
          swr_110: 'Astral',
          paint_interior: 'Asian Premium Emulsion',
          paint_exterior: 'Asian primer + Ace emulsion',
        },
        tiles: 60,
      },
      {
        name: 'Luxury',
        sections: pkg({
          steel: 'Vizag TMT',
          cement: 'UltraTech 53 RCC; Bangur 43 brickwork/internal works',
          wire: 'Polycab',
          switches: 'Gold Medal',
          conduit: 'Sudhakar',
          plumbing: 'Ashirwad',
          interior:
            'Birla putty 2; Asian Royale Emulsion 2 coats; primer 1 coat',
          exterior:
            'Putty/texture elevation 2; Asian primer 1; APEX exterior emulsion 2 coats',
          tiles: '70',
          parking: '60',
        }),
        expect: {
          steel: 'Vizag (RINL)',
          cement_masonry: 'Bangur 43',
          wire_15: 'Polycab FR',
          switch_6a: 'Gold Medal',
          cpvc_half: 'Ashirvad',
          swr_110: 'Ashirvad',
          paint_interior: 'Asian Royale',
          paint_exterior: 'Asian Apex',
        },
        tiles: 70,
      },
      {
        name: 'Royal',
        sections: pkg({
          steel: 'TATA 550 TMT',
          cement: 'UltraTech 53 for complete construction',
          wire: 'Polycab',
          switches: 'Gold Medal Air',
          conduit: 'Polycab',
          plumbing: 'Ashirwad',
          interior: 'Birla putty 2; Royal Emulsion 3 coats; primer 1 coat',
          exterior:
            'Putty/texture elevation + 3 sides 2; Asian primer 1; APEX Ultima weatherproof paint',
          tiles: '85',
          parking: '70',
        }),
        expect: {
          steel: 'TATA Tiscon 550',
          cement: 'UltraTech 53',
          cement_masonry: 'UltraTech 53',
          conduit: 'Polycab',
          switch_6a: 'Gold Medal Air',
          paint_interior: 'Asian Royale (3 coats)',
          paint_exterior: 'Asian Apex Ultima',
        },
        tiles: 85,
      },
    ];
    for (const item of cases)
      it(item.name + ' package', () => {
        const { added, rates, picks } = priced(item.sections);
        expect(picks).toMatchObject(item.expect);
        // Every quoted brand has a built-in price: only allowances are added.
        expect(added.every((rate) => rate.variant === QUOTED_ALLOWANCE)).toBe(
          true,
        );
        expect(
          rateForOutput(
            { name: 'Floor tiles', unit: 'sqft', material: 'floor_tiles' },
            rates,
            picks,
          ),
        ).toBe(item.tiles);
        expect(
          rateForOutput(
            { name: '12 mm bars', unit: 'rod', diameter: 12 },
            rates,
            picks,
          ),
        ).toBeGreaterThan(0);
      });

    it('prices each brand from the built-in list', () => {
      const rates = effectiveRates([]);
      const rod = (brand: string) =>
        rateForOutput(
          { name: '16 mm bars', unit: 'rod', diameter: 16 },
          rates,
          { steel: brand },
        );
      expect(rod('TATA Tiscon 550')).toBeGreaterThan(rod('JSW'));
      expect(rod('SHREE 550')).toBeLessThan(rod('Vizag (RINL)'));
      expect(
        rateForOutput(
          { name: 'Paint', unit: 'sqft', material: 'paint_interior' },
          rates,
          { paint_interior: 'Asian Royale' },
        ),
      ).toBe(26);
    });
  });
});
