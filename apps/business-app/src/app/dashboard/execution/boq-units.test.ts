import { describe, expect, it } from 'vitest';
import { calculateBoq, inputDefinitions } from './boq-calculations';
import {
  convertInputs,
  fieldKind,
  toDisplay,
  toMetric,
  unitLabel,
} from './boq-units';

describe('BOQ length units', () => {
  it('classifies fields from their metric labels', () => {
    expect(fieldKind({ key: 'length', label: 'Length (m)' })).toBe('len');
    expect(
      fieldKind({ key: 'openings', label: 'Door/window deductions (m²)' }),
    ).toBe('area');
    expect(fieldKind({ key: 'barSpacing', label: 'Bar spacing (mm)' })).toBe(
      'spacing',
    );
    // Bar diameters stay in mm.
    expect(
      fieldKind({ key: 'barDiameter', label: 'Grid mat bar diameter (mm)' }),
    ).toBeNull();
    expect(fieldKind({ key: 'count', label: 'Same footings' })).toBeNull();
  });

  it('shows feet, sq ft and inches and converts back to metric', () => {
    expect(toDisplay('3', 'len', 'ft')).toBe('9.843');
    expect(toMetric('10', 'len', 'ft')).toBe('3.048');
    expect(toDisplay('150', 'spacing', 'ft')).toBe('5.9');
    expect(toMetric('6', 'spacing', 'ft')).toBe('152.4');
    expect(toDisplay('2', 'area', 'ft')).toBe('21.53');
    expect(toDisplay('3', 'len', 'm')).toBe('3');
    expect(unitLabel('Length (m)', 'len', 'ft')).toBe('Length (ft)');
    expect(unitLabel('Bar spacing (mm)', 'spacing', 'ft')).toBe(
      'Bar spacing (in)',
    );
  });

  it('gives the same takeoff whether entered in metres or feet', () => {
    const defs = inputDefinitions.footing!;
    const metric = Object.fromEntries(defs.map((d) => [d.key, d.value]));
    const feet = convertInputs(metric, defs, 'm', 'ft');
    expect(feet.length).toBe('4.921');
    const back = convertInputs(feet, defs, 'ft', 'm');
    const a = calculateBoq('footing', metric);
    const b = calculateBoq('footing', back);
    // Within 0.1% after a metres → feet → metres round trip.
    expect(
      Math.abs(b[0]!.quantity - a[0]!.quantity) / a[0]!.quantity,
    ).toBeLessThan(0.001);
    expect(b.map((o) => o.name)).toEqual(a.map((o) => o.name));
  });
});

describe('foundation takeoff templates', () => {
  it('calculates pedestals like short columns and plinth beams like beams', () => {
    const pedestal = calculateBoq(
      'pedestal',
      Object.fromEntries(
        inputDefinitions.pedestal!.map((d) => [d.key, d.value]),
      ),
    );
    // 5 × 0.38 × 0.38 × 0.6 m
    expect(pedestal[0]).toMatchObject({
      name: 'RCC concrete volume',
      quantity: 0.433,
    });
    expect(pedestal.some((o) => o.name.startsWith('8 mm rings'))).toBe(true);
    const plinth = calculateBoq(
      'plinth_beam',
      Object.fromEntries(
        inputDefinitions.plinth_beam!.map((d) => [d.key, d.value]),
      ),
    );
    // 8 × 4 × 0.23 × 0.38 m
    expect(plinth[0]).toMatchObject({ quantity: 2.797 });
    expect(plinth.some((o) => o.name.includes('stirrups'))).toBe(true);
  });
});
