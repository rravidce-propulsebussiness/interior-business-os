import { describe, expect, it } from 'vitest';
import {
  normalizePenthouseFloors,
  selectPenthouseFloor,
  selectNormalFloor,
  type PenthouseFloor,
} from './penthouse-floor-selection';
import { calculateSftEstimate } from '@business-os/core/sft-quotation';

const floor = (name: string, area: string, rate = '1850'): PenthouseFloor => ({
  kind: 'floor',
  name,
  lengthFeet: area,
  widthFeet: '1',
  ratePerSqft: rate,
});
const starting = [
  floor('Ground Floor', '1200'),
  floor('First Floor', '1200'),
  floor('Second Floor', '1200'),
  floor('Third Floor', '1200'),
];

describe('exclusive penthouse floor', () => {
  it('converts the Third Floor instead of adding another billed 1200 SFT', () => {
    const selected = selectPenthouseFloor(starting, 3);
    expect(selected).toHaveLength(4);
    expect(selected.map((row) => row.name)).toEqual([
      'Ground Floor',
      'First Floor',
      'Second Floor',
      'Third Floor — Penthouse',
    ]);
    expect(selected[3]).toMatchObject({
      lengthFeet: '1200',
      widthFeet: '1',
      ratePerSqft: '1850',
    });
    const pricing = calculateSftEstimate({ rows: selected, materialIds: [] });
    expect(pricing.totalAreaSqft).toBe('4800.00');
    expect(pricing.total).toBe('8880000.00');
    expect(selectPenthouseFloor(selected, 3)).toEqual(selected);
    expect(selectNormalFloor(selected, 3).at(-1)?.name).toBe('Third Floor');
  });

  it('fixes existing legacy saved quotations with a normal Third Floor and penthouse duplicate', () => {
    const bad = [...starting, floor('Third Floor — Penthouse', '1200')];
    const normalized = normalizePenthouseFloors(bad);
    expect(normalized).toHaveLength(4);
    expect(normalized[3]?.name).toBe('Third Floor — Penthouse');
    expect(
      calculateSftEstimate({ rows: normalized, materialIds: [] }).total,
    ).toBe('8880000.00');
  });

  it('does not mutate parking on separate levels, other work or the saved input', () => {
    const parking = floor('Ground Floor — Parking', '200', '850');
    const extra = {
      ...floor('Staircase', '100', '500'),
      kind: 'additional' as const,
    };
    const input = [...starting, parking, extra];
    const selected = selectPenthouseFloor(input, 3);
    expect(selected).toHaveLength(input.length);
    expect(
      selected.find((row) => row.name === 'Ground Floor — Parking'),
    ).toEqual(parking);
    expect(selected.find((row) => row.name === 'Staircase')).toEqual(extra);
    expect(input.at(3)?.name).toBe('Third Floor');
  });
});
