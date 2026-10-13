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

  it('prices G+1 and selected extra works once, snapshots the company package, and survives reload', () => {
    const detail = calculateSftEstimate(
      {
        rows: [
          {
            kind: 'floor',
            name: 'Ground Floor',
            lengthFeet: '20',
            widthFeet: '30',
            ratePerSqft: '1950',
          },
          {
            kind: 'floor',
            name: 'First Floor',
            lengthFeet: '20',
            widthFeet: '20',
            ratePerSqft: '1950',
          },
          {
            kind: 'additional',
            name: 'Footings / Foundation',
            lengthFeet: '10',
            widthFeet: '10',
            ratePerSqft: '900',
          },
          {
            kind: 'additional',
            name: 'Elevation Works',
            lengthFeet: '10',
            widthFeet: '15',
            ratePerSqft: '400',
          },
        ],
        packageId: '22222222-2222-4222-8222-222222222222',
        materialIds: [],
        sections: [
          {
            title: 'Steel',
            description: 'TMT steel according to structural engineer design.',
          },
          {
            title: 'Elevation',
            description: 'Included finishing design and external painting.',
          },
        ],
      },
      [],
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Royal',
        code: 'ROYAL',
        description: 'Structure and finishing',
        ratePerSqft: '1950',
      },
    );
    expect(detail.totalAreaSqft).toBe('1000.00');
    expect(detail.additionalAreaSqft).toBe('250.00');
    expect(detail.total).toBe('2100000.00');
    expect(detail.package?.name).toBe('Royal');
    expect(detail.sections?.[0]?.title).toBe('Steel');
    expect(parseSftEstimate(encodeSftEstimate(detail))).toEqual(detail);
  });

  it('keeps legacy V1 estimates readable and rejects a missing floor', () => {
    const detail = calculateSftEstimate(schedule);
    const legacy = 'SFT_ESTIMATE_V1:' + JSON.stringify(detail);
    expect(parseSftEstimate(legacy)?.total).toBe(detail.total);
    expect(() => calculateSftEstimate({
      rows: [{
        kind: 'additional',
        name: 'Footing',
        lengthFeet: '10',
        widthFeet: '10',
        ratePerSqft: '900',
      }],
      materialIds: [],
    })).toThrow();
  });
});
