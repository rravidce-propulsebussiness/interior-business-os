import { describe, expect, it } from 'vitest';
import { readNumber } from './boq-number-field';

describe('BOQ number boxes', () => {
  it('reads drawing sizes in feet boxes and refuses what it cannot read', () => {
    expect(readNumber(`7'0"`, true)).toBe(7);
    expect(readNumber(`11'3"`, true)).toBe(11.25);
    expect(readNumber('11.25', true)).toBe(11.25);
    expect(readNumber('', true)).toBe(0);
    expect(readNumber('seven', true)).toBeNull();
  });

  it('reads plain numbers without guessing at feet-inches', () => {
    expect(readNumber('04')).toBe(4);
    expect(readNumber('1,537.5')).toBe(1537.5);
    expect(readNumber(`7'0"`)).toBeNull();
    expect(readNumber('')).toBe(0);
  });
});
