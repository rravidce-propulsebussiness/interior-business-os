import { describe, expect, it } from 'vitest';
import { contactMatches, normalizedCustomerPhone } from './customer-match';

describe('customer identity in quotation creation', () => {
  it('normalizes Indian country codes and phone punctuation', () => {
    expect(normalizedCustomerPhone('+91 90003 59865')).toBe('9000359865');
    expect(normalizedCustomerPhone('9000359865')).toBe('9000359865');
  });
  it('matches confirmed contact methods, not just names', () => {
    expect(
      contactMatches(
        { phone: '+91 90003 59865', email: 'Ravi@Example.com' },
        { phone: '9000359865', email: '' },
      ),
    ).toBe(true);
    expect(
      contactMatches(
        { phone: '', email: 'Ravi@Example.com' },
        { phone: '', email: 'ravi@example.com' },
      ),
    ).toBe(true);
    expect(
      contactMatches(
        { phone: '9011111111', email: '' },
        { phone: '9000359865', email: '' },
      ),
    ).toBe(false);
    expect(
      contactMatches({ phone: '', email: '' }, { phone: '', email: '' }),
    ).toBe(false);
  });
});
