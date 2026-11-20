import { describe, expect, it } from 'vitest';
import { rateForOutput, type Rate } from './boq-pricing';

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
