import { describe, expect, it } from 'vitest';
import { normalisePhone, parseContactSheet } from './whatsapp-contact-sheet';

describe('broadcast contact sheet', () => {
  it('normalises Indian and international numbers', () => {
    expect(normalisePhone('98765 43210')).toBe('919876543210');
    expect(normalisePhone('+91-98765-43210')).toBe('919876543210');
    expect(normalisePhone('09876543210')).toBe('919876543210');
    expect(normalisePhone('0044 7911 123456')).toBe('447911123456');
    expect(normalisePhone('12345')).toBeNull();
  });

  it('reads a sheet with headers in any column order', () => {
    const sheet =
      'Name,Mobile Number,City\n"Ravi, K",9876543210,Hyd\nSita,+91 91234 56789,Pune\nBad row,123,x\nRavi again,9876543210,Hyd';
    const result = parseContactSheet(sheet);
    expect(result.contacts).toEqual([
      { phone: '919876543210', name: 'Ravi, K' },
      { phone: '919123456789', name: 'Sita' },
    ]);
    expect(result.invalid).toHaveLength(1);
  });

  it('reads a sheet without headers', () => {
    expect(parseContactSheet('9876543210,Ravi\n9123456789').contacts).toEqual(
      [
        { phone: '919876543210', name: 'Ravi' },
        { phone: '919123456789', name: '' },
      ],
    );
  });
});
