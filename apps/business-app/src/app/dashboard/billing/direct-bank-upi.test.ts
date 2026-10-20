import { describe, expect, it } from 'vitest';
import { createUpiPaymentUri } from './direct-bank-upi';

describe('direct company UPI instructions', () => {
  const payee = { upiId: 'company@upi', displayName: 'Example Company' };
  it('encodes the exact invoice amount and reference', () => {
    const uri = createUpiPaymentUri(payee, 1250.5, 'INV-100 / Stage 1');
    expect(uri.startsWith('upi://pay?')).toBe(true);
    const params = new URLSearchParams(uri.split('?')[1]);
    expect(params.get('pa')).toBe('company@upi');
    expect(params.get('pn')).toBe('Example Company');
    expect(params.get('am')).toBe('1250.50');
    expect(params.get('cu')).toBe('INR');
    expect(params.get('tn')).toBe('INV-100 / Stage 1');
  });
  it.each([0, -1, NaN, Infinity, 1.001, 100000001])(
    'rejects invalid amount %s',
    amount => expect(() => createUpiPaymentUri(payee, amount, 'INV-1')).toThrow(),
  );
  it('rejects malformed UPI identifiers and empty references', () => {
    expect(() => createUpiPaymentUri({ ...payee, upiId: 'not-upi' }, 50, 'INV-1')).toThrow();
    expect(() => createUpiPaymentUri(payee, 50, '')).toThrow();
  });
});
