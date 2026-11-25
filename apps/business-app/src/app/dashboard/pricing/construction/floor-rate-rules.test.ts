import { describe, expect, it } from 'vitest';
import {
  FLOOR_RATE_TITLE,
  readFloorRateDefaults,
  readPackageFloorHeight,
  writeFloorRateDefaults,
} from './floor-rate-rules';

type Spec = {
  title: string;
  description: string;
  brand: string;
  grade: string;
  allowancePerSqft: string;
  unit?: string | undefined;
  pricingTreatment?: string | undefined;
  allowanceValue?: string | undefined;
};
const steel: Spec = {
  title: 'Steel',
  description: 'TMT specification',
  brand: 'JSW',
  grade: 'Fe 550',
  allowancePerSqft: '',
};

describe('company floor pricing defaults', () => {
  it('roundtrips parking and penthouse rates without changing the base package', () => {
    const updated = writeFloorRateDefaults<Spec>([steel], {
      parking: '800',
      penthouse: '1350.5',
    });
    expect(updated).toHaveLength(2);
    expect(updated[0]).toEqual(steel);
    expect(updated[1]?.title).toBe(FLOOR_RATE_TITLE);
    expect(readFloorRateDefaults(updated)).toEqual({
      parking: '800',
      penthouse: '1350.5',
    });
    expect(
      writeFloorRateDefaults(updated, { parking: '850', penthouse: '1400' }),
    ).toHaveLength(2);
    expect(
      readFloorRateDefaults(
        writeFloorRateDefaults(updated, { parking: '', penthouse: '' }),
      ),
    ).toEqual({ parking: '', penthouse: '' });
  });
  it('rejects invalid values and a full 18-spec package instead of losing a brand', () => {
    expect(() =>
      writeFloorRateDefaults([steel], { parking: 'abc', penthouse: '1200' }),
    ).toThrow(/valid positive/);
    expect(() =>
      writeFloorRateDefaults(
        Array.from({ length: 18 }, (_, i) => ({
          ...steel,
          title: 'Item ' + i,
        })),
        { parking: '900', penthouse: '' },
      ),
    ).toThrow(/full/);
  });
  it('allows 31 brochure items plus one parking rate metadata section at capacity 32', () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({
      ...steel,
      title: 'Brochure item ' + i,
    }));
    const saved = writeFloorRateDefaults(
      rows,
      { parking: '900', penthouse: '' },
      32,
    );
    expect(saved).toHaveLength(32);
    expect(saved[31]?.title).toBe(FLOOR_RATE_TITLE);
    expect(readFloorRateDefaults(saved).parking).toBe('900');
    expect(() =>
      writeFloorRateDefaults(
        [...rows, { ...steel, title: 'One too many' }],
        { parking: '900', penthouse: '' },
        32,
      ),
    ).toThrow(/full/);
  });
});

describe('package floor height', () => {
  it('persists a height even without separate parking rates and retains it during rate edits', () => {
    const saved = writeFloorRateDefaults(
      [steel],
      { parking: '', penthouse: '' },
      32,
      '11',
    );
    expect(readPackageFloorHeight(saved)).toBe('11');
    expect(readFloorRateDefaults(saved)).toEqual({
      parking: '',
      penthouse: '',
    });
    const updated = writeFloorRateDefaults(
      saved,
      { parking: '800', penthouse: '' },
      32,
    );
    expect(readPackageFloorHeight(updated)).toBe('11');
    expect(
      readPackageFloorHeight(
        writeFloorRateDefaults(updated, { parking: '', penthouse: '' }, 32, ''),
      ),
    ).toBe('');
  });
  it('rejects an invalid height and never assumes one for old packages', () => {
    expect(readPackageFloorHeight([steel])).toBe('');
    expect(() =>
      writeFloorRateDefaults(
        [steel],
        { parking: '', penthouse: '' },
        32,
        '-10',
      ),
    ).toThrow(/height/);
  });
});
