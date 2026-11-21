import { describe, expect, it } from 'vitest';
import { calculateBoq } from './boq-calculations';

describe('manual construction BOQ takeoff', () => {
  it('calculates column concrete and reports reinforcing steel in rods and kg', () => {
    const outputs = calculateBoq('column', {
      count: '5',
      length: '0.23',
      width: '0.23',
      height: '3',
      main16: '4',
      main12: '2',
      main10: '0',
      ringDiameter: '6',
      ringSpacing: '150',
      cover: '0.04',
      rodLength: '12',
    });
    expect(outputs[0]).toEqual({
      name: 'RCC concrete volume',
      quantity: 0.794,
      unit: 'm³',
    });
    expect(
      outputs.find((item) => item.name === '16 mm main bars'),
    ).toMatchObject({
      quantity: 6,
      unit: 'rod',
      source: '72 m · 113.8 kg',
    });
    expect(
      outputs.find((item) => item.name === '12 mm main bars'),
    ).toMatchObject({
      quantity: 3,
      unit: 'rod',
      source: '36 m · 32 kg',
    });
    expect(
      outputs.find((item) => item.name === '6 mm rings @ 150 mm'),
    ).toMatchObject({
      quantity: 7,
      source: '105 rings · 75.6 m · 16.8 kg',
    });
  });

  it('deducts openings and calculates bricks for four and nine inch walls', () => {
    const wall4 = calculateBoq('wall', {
      length: '10',
      height: '3',
      thickness: '4',
      openings: '2',
    });
    const wall9 = calculateBoq('wall', {
      length: '10',
      height: '3',
      thickness: '9',
      openings: '2',
    });
    expect(wall4[0]).toMatchObject({ quantity: 301.389, unit: 'sqft' });
    expect(wall4[1]).toMatchObject({ name: 'Bricks', quantity: 1357 });
    expect(wall9[1]).toMatchObject({ name: 'Bricks', quantity: 2713 });
  });

  it('calculates beam stirrups, footing mesh, and excavation bulking', () => {
    const beam = calculateBoq('beam', {
      count: '1',
      length: '4',
      width: '0.23',
      height: '0.45',
      main16: '2',
      main12: '2',
      main10: '0',
      ringDiameter: '8',
      ringSpacing: '150',
      cover: '0.04',
      rodLength: '12',
    });
    const footing = calculateBoq('footing', {
      count: '2',
      length: '1.5',
      width: '1.5',
      depth: '0.45',
      barDiameter: '12',
      barSpacing: '150',
      cover: '0.05',
      rodLength: '12',
    });
    const excavation = calculateBoq('excavation', {
      count: '5',
      length: '1.5',
      width: '1.5',
      depth: '1.5',
      bulking: '20',
    });
    expect(beam[0]).toMatchObject({ quantity: 0.414, unit: 'm³' });
    expect(
      beam.some((item) => item.name === '8 mm beam stirrups @ 150 mm'),
    ).toBe(true);
    expect(footing[0]).toMatchObject({ quantity: 2.025, unit: 'm³' });
    expect(
      footing.some(
        (item) => item.name === 'Footing bars 12 mm' && item.unit === 'rod',
      ),
    ).toBe(true);
    expect(excavation).toEqual([
      { name: 'Excavation volume', quantity: 16.875, unit: 'm³' },
      { name: 'Loose soil for disposal', quantity: 20.25, unit: 'm³' },
    ]);
  });

  it('applies internal and external paint coats to net surface area', () => {
    const outputs = calculateBoq('surface', {
      length: '10',
      height: '3',
      openings: '2',
      surfaceType: 'Internal paint',
      waste: '0',
      coats: '2',
    });
    expect(outputs[0]).toMatchObject({
      name: 'Internal paint',
      quantity: 301.389,
      unit: 'sqft',
    });
    expect(
      outputs.find((item) => item.name === 'Paint (2 coats)'),
    ).toMatchObject({
      quantity: 6.028,
      unit: 'litre',
    });
  });
});

describe('manual reinforcement diameter coverage', () => {
  it('supports 20 mm beam bars and optional 8 mm column bars from the structural schedule', () => {
    const beam = calculateBoq('beam', {
      count: 1,
      length: 4,
      width: 0.23,
      height: 0.38,
      main20: 4,
      main16: 0,
      main12: 0,
      main10: 0,
      main8: 0,
      ringDiameter: 8,
      ringSpacing: 150,
    });
    expect(
      beam.find((output) => output.name === '20 mm main bars'),
    ).toMatchObject({
      unit: 'rod',
      quantity: 2,
    });
    const column = calculateBoq('column', {
      count: 2,
      length: 0.23,
      width: 0.23,
      height: 3,
      main20: 0,
      main16: 0,
      main12: 4,
      main10: 0,
      main8: 2,
      ringDiameter: 8,
      ringSpacing: 150,
    });
    expect(column.some((output) => output.name === '8 mm main bars')).toBe(
      true,
    );
  });
});
