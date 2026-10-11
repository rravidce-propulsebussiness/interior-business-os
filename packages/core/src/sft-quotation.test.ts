import { describe, expect, it } from 'vitest';
import {
  calculateSftEstimate,
  encodeSftEstimate,
  parseSftEstimate,
} from './sft-quotation';
const schedule = {
  rows: [
    {
      name: 'Parking Area',
      lengthFeet: '20',
      widthFeet: '8',
      ratePerSqft: '900',
    },
    {
      name: 'Ground Commercial',
      lengthFeet: '20',
      widthFeet: '72',
      ratePerSqft: '1380',
    },
    {
      name: 'First Commercial',
      lengthFeet: '20',
      widthFeet: '72',
      ratePerSqft: '1380',
    },
    {
      name: 'Second Commercial',
      lengthFeet: '20',
      widthFeet: '72',
      ratePerSqft: '1380',
    },
    {
      name: 'Penthouse',
      lengthFeet: '20',
      widthFeet: '52',
      ratePerSqft: '1780',
    },
  ],
  materialIds: [],
};
describe('floor-wise per-SFT construction estimates', () => {
  it('reproduces the work-row totals of the example without seeding a customer', () => {
    const result = calculateSftEstimate(schedule);
    expect(result.rows.map((row) => row.areaSqft)).toEqual([
      '160.00',
      '1440.00',
      '1440.00',
      '1440.00',
      '1040.00',
    ]);
    expect(result.totalAreaSqft).toBe('5520.00');
    expect(result.total).toBe('7956800.00');
  });
  it('snapshots every rate and later decodes without external lookups', () => {
    const result = calculateSftEstimate(schedule);
    expect(parseSftEstimate(encodeSftEstimate(result))).toEqual(result);
  });
  it('prevents invalid dimensions and mismatched material counts', () => {
    expect(() =>
      calculateSftEstimate({
        ...schedule,
        rows: [
          {
            name: 'Invalid',
            lengthFeet: '0',
            widthFeet: '8',
            ratePerSqft: '800',
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      calculateSftEstimate({
        ...schedule,
        materialIds: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).toThrow();
  });
});
