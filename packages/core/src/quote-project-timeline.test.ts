import { describe, expect, it } from 'vitest';
import { projectTimelineFromQuote } from './quote-project-timeline';
import { calculateSftEstimate, encodeSftEstimate } from './sft-quotation';

const id = (n: number) =>
  '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const interior = [
  {
    id: id(1),
    name: 'Kitchen — Modular Kitchen Base Unit',
    description:
      'Room: Kitchen\nPlywood / core: BWP\nFinish / laminate: Matte finish',
  },
  {
    id: id(2),
    name: 'Master Bedroom — Wardrobe',
    description: 'Room: Master Bedroom\nHardware: Soft-close hinges',
  },
  {
    id: id(3),
    name: 'Living Room — TV Unit',
    description: 'Room: Living Room\nFinish / laminate: Oak',
  },
];
describe('accepted quote to industry execution plan', () => {
  it('creates an interior room-wise plan, not footing or RCC tasks', () => {
    const result = projectTimelineFromQuote('interior', interior);
    expect(result?.industry).toBe('interior');
    expect(result?.zones.map((zone) => zone.name)).toEqual([
      'Kitchen',
      'Master Bedroom',
      'Living Room',
    ]);
    expect(result?.stages.some((s) => s.templateCode === 'FABRICATION')).toBe(
      true,
    );
    expect(result?.stages.some((s) => s.title.includes('Kitchen'))).toBe(true);
    expect(result?.stages.map((s) => s.templateCode)).not.toContain(
      'FOUNDATION',
    );
    expect(result?.stages.map((s) => s.templateCode)).not.toContain('RCC');
    expect(result?.stages.map((s) => s.templateCode)).not.toContain('SERVICES');
    expect(result?.stages.map((s) => s.templateCode)).not.toContain('CEILING');
    expect(result?.stages[0]?.activities.join(' ')).toContain(
      'Soft-close hinges',
    );
    expect(result?.stages.every((s) => !('paid' in s))).toBe(true);
  });
  it('adds concealed services only when those items were accepted in the quote', () => {
    const included = projectTimelineFromQuote('interior', [
      ...interior,
      {
        id: id(4),
        name: 'Kitchen plumbing points',
        description: 'Room: Kitchen',
      },
      {
        id: id(5),
        name: 'False ceiling gypsum board',
        description: 'Room: Living Room',
      },
    ]);
    expect(included?.stages.map((s) => s.templateCode)).toContain('SERVICES');
    expect(included?.stages.map((s) => s.templateCode)).toContain('CEILING');
  });
  it('derives construction floors from the accepted square foot schedule only', () => {
    const scope = calculateSftEstimate({
      rows: [
        {
          name: 'Ground',
          kind: 'floor',
          lengthFeet: '30',
          widthFeet: '40',
          ratePerSqft: '1750',
        },
        {
          name: 'First',
          kind: 'floor',
          lengthFeet: '30',
          widthFeet: '40',
          ratePerSqft: '1750',
        },
        {
          name: 'Site Compound',
          kind: 'additional',
          lengthFeet: '10',
          widthFeet: '4',
          ratePerSqft: '1000',
        },
      ],
      materialIds: [],
    });
    const result = projectTimelineFromQuote('construction', [
      {
        id: id(8),
        name: 'Construction scope',
        description: encodeSftEstimate(scope),
      },
    ]);
    expect(result?.zones.map((x) => x.code)).toEqual(['GROUND', 'FIRST']);
    expect(result?.stages.filter((x) => x.templateCode === 'RCC')).toHaveLength(
      2,
    );
    expect(result?.stages[0]?.activities.join(' ')).toContain('Site Compound');
  });
  it('does not invent timeline information from missing or unsupported scopes', () => {
    expect(projectTimelineFromQuote('construction', interior)).toBeNull();
    expect(projectTimelineFromQuote('interior', [])).toBeNull();
    expect(projectTimelineFromQuote('real_estate', interior)).toBeNull();
  });
});
