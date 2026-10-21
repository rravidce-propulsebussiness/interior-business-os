import { describe, expect, it } from 'vitest';
import { nextPaymentClaimStatus, validatePaymentClaim } from './payment-claims';

describe('payment claim lifecycle', () => {
  it('requires confirmed bank credit before verification', () => {
    expect(() => nextPaymentClaimStatus('submitted', 'verify', false)).toThrow();
    expect(nextPaymentClaimStatus('submitted', 'verify', true)).toBe('verified');
    expect(nextPaymentClaimStatus('submitted', 'reject', false)).toBe('rejected');
  });
  it('prevents changing a reviewed claim', () => {
    expect(() => nextPaymentClaimStatus('verified', 'reject', true)).toThrow();
    expect(() => nextPaymentClaimStatus('rejected', 'verify', true)).toThrow();
  });
  it('validates UTR and caps claims at outstanding amount', () => {
    expect(validatePaymentClaim(2000, ' UTR123456 ', 5000))
      .toEqual({ amountPaise: 2000, utr: 'UTR123456' });
    expect(() => validatePaymentClaim(6000, 'UTR123456', 5000)).toThrow();
    expect(() => validatePaymentClaim(2000, 'bad ref!', 5000)).toThrow();
    expect(() => validatePaymentClaim(0, 'UTR123456', 5000)).toThrow();
  });
});
