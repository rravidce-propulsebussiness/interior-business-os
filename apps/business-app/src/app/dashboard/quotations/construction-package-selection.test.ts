import { describe, expect, it } from 'vitest';
import {
  initialConstructionPackageSelection,
  SAVED_PACKAGE_OPTION,
} from './construction-package-selection';

const packages = [
  { id: 'standard-id', code: 'STANDARD' },
  { id: 'premium-id', code: 'PREMIUM' },
];

describe('quotation studio saved-package recovery', () => {
  it('reopens an existing quotation with its saved active package', () => {
    expect(
      initialConstructionPackageSelection(
        packages,
        { package: { id: 'premium-id', code: 'PREMIUM' } },
        false,
        'sft',
        'standard-id',
      ),
    ).toBe('premium-id');
  });

  it('keeps existing floor data visible when the source package was deleted', () => {
    expect(
      initialConstructionPackageSelection(
        packages,
        { package: { id: 'deleted-package', code: 'TEST-BASIC-1800' } },
        false,
        'sft',
      ),
    ).toBe(SAVED_PACKAGE_OPTION);
  });

  it('does not silently replace an archived package with another package using the same code', () => {
    expect(
      initialConstructionPackageSelection(
        packages,
        { package: { id: 'retired-premium-id', code: 'PREMIUM' } },
        false,
        'sft',
      ),
    ).toBe(SAVED_PACKAGE_OPTION);
  });

  it('does not hide an older saved quote without package metadata', () => {
    expect(
      initialConstructionPackageSelection(packages, {}, false, 'sft'),
    ).toBe(SAVED_PACKAGE_OPTION);
  });

  it('respects requested packages only for genuinely new quotations', () => {
    expect(
      initialConstructionPackageSelection(
        packages,
        null,
        false,
        'sft',
        'standard-id',
      ),
    ).toBe('standard-id');
    expect(
      initialConstructionPackageSelection(packages, null, false, 'sft'),
    ).toBe('');
  });

  it('retains saved custom quotations in custom mode', () => {
    expect(
      initialConstructionPackageSelection(packages, null, true, 'sft'),
    ).toBe('custom');
    expect(
      initialConstructionPackageSelection(packages, null, false, 'custom'),
    ).toBe('custom');
  });
});
