import { describe, expect, it } from 'vitest';
import {
  calculateSftEstimate,
  encodeSftEstimate,
  parseSftEstimate,
} from './sft-quotation';

describe('editable drawings and extra package specification fields', () => {
  const make = (section: Record<string, unknown>) =>
    calculateSftEstimate({
      rows: [
        {
          kind: 'floor',
          name: 'Ground Floor',
          lengthFeet: '20',
          widthFeet: '30',
          ratePerSqft: '1950',
        },
      ],
      materialIds: [],
      sections: [section],
    });

  it('stores plan deliverables without brand or price fields', () => {
    const result = make({
      title: 'Planning & Drawings',
      kind: 'plans',
      description: '2 revisions included',
      deliverables: [
        'Electrical layout',
        'Plumbing layout',
        '3D elevation / views',
      ],
      customFields: [{ label: 'Drawing format', value: 'PDF and DWG' }],
    });
    expect(result.sections?.[0]?.deliverables).toContain('Plumbing layout');
    expect(parseSftEstimate(encodeSftEstimate(result))).toEqual(result);
    expect(result.total).toBe('1170000.00');
  });

  it('supports extra material fields while validating bounds', () => {
    const result = make({
      title: 'Steel / TMT',
      kind: 'material',
      description: '',
      brand: 'Tata',
      grade: 'Fe 550D',
      allowancePerSqft: '',
      customFields: [{ label: 'Quantity allowance', value: '4 kg / sq ft' }],
    });
    expect(result.sections?.[0]?.customFields?.[0]?.value).toBe('4 kg / sq ft');
    expect(() =>
      make({
        title: 'Planning & Drawings',
        description: '',
        kind: 'plans',
        deliverables: Array.from({ length: 21 }, (_, i) => 'Plan ' + i),
      }),
    ).toThrow();
    expect(() =>
      make({
        title: 'Tiles',
        description: '',
        customFields: [{ label: '<'.repeat(75), value: 'invalid' }],
      }),
    ).toThrow();
  });
});