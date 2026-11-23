import { describe, expect, it } from 'vitest';
import { sftEstimateInputSchema } from '@business-os/core/sft-quotation';
import { workUnitChange } from './work-unit-change';

describe('quotation work item unit change', () => {
  it('lets a running-foot item become a saveable lump sum (Borewell)', () => {
    const borewell = {
      kind: 'additional' as const,
      name: 'Borewell',
      unit: 'running_ft' as const,
      lengthFeet: '',
      widthFeet: '1',
      heightFeet: '',
      ratePerSqft: '200000',
    };
    const lumpSum = { ...borewell, ...workUnitChange(borewell, 'lumpsum') };
    expect(lumpSum).toMatchObject({ lengthFeet: '1', widthFeet: '1' });
    const parsed = sftEstimateInputSchema.safeParse({
      rows: [
        {
          kind: 'floor',
          name: 'Ground Floor',
          lengthFeet: '20',
          widthFeet: '30',
          ratePerSqft: '1850',
        },
        lumpSum,
      ],
      materialIds: [],
      packageId: null,
      sections: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('does not carry a counted placeholder into measured units', () => {
    const lift = { unit: 'piece' as const, lengthFeet: '1', widthFeet: '1' };
    expect(workUnitChange(lift, 'running_ft')).toMatchObject({
      lengthFeet: '',
      widthFeet: '1',
    });
    expect(workUnitChange(lift, 'sqft')).toMatchObject({
      lengthFeet: '',
      widthFeet: '',
    });
  });

  it('keeps measured dimensions between measured units', () => {
    const wall = {
      unit: 'wall_sqft' as const,
      lengthFeet: '60',
      widthFeet: '1',
    };
    expect(workUnitChange(wall, 'running_ft')).toMatchObject({
      lengthFeet: '60',
    });
  });
});
