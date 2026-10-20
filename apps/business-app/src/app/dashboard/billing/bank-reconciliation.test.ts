import { describe, expect, it } from 'vitest';
import { reconcileInvoice } from './bank-reconciliation';

describe('direct bank invoice reconciliation', () => {
  it('does not credit submitted UTRs before office verification', () => {
    expect(reconcileInvoice(100000, [{ amountPaise: 40000, status: 'submitted' }]))
      .toEqual({ verifiedPaise: 0, submittedPaise: 40000, outstandingPaise: 100000, status: 'unpaid' });
  });
  it('tracks verified partial and full settlement', () => {
    expect(reconcileInvoice(100000, [{ amountPaise: 40000, status: 'verified' }]).status)
      .toBe('partially_paid');
    expect(reconcileInvoice(100000, [
      { amountPaise: 40000, status: 'verified' },
      { amountPaise: 60000, status: 'verified' },
    ])).toEqual({ verifiedPaise: 100000, submittedPaise: 0, outstandingPaise: 0, status: 'paid' });
  });
  it('does not count rejected claims', () => {
    expect(reconcileInvoice(100000, [{ amountPaise: 100000, status: 'rejected' }]).outstandingPaise)
      .toBe(100000);
  });
  it('rejects overpayment and invalid monetary values', () => {
    expect(() => reconcileInvoice(100, [{ amountPaise: 101, status: 'verified' }])).toThrow();
    expect(() => reconcileInvoice(100.5, [])).toThrow();
    expect(() => reconcileInvoice(100, [{ amountPaise: -1, status: 'submitted' }])).toThrow();
  });
});
