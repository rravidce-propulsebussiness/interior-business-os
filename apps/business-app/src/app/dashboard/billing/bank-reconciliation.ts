/**
 * Pure calculations for bank-transfer reconciliation. Never infer that a
 * customer-submitted UTR or proof is a confirmed bank credit.
 */
export type BankPayment = {
  amountPaise: number;
  status: 'submitted' | 'verified' | 'rejected';
};
function validPaise(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
export function reconcileInvoice(
  invoiceTotalPaise: number,
  payments: readonly BankPayment[],
) {
  if (!validPaise(invoiceTotalPaise)) throw new Error('Invalid invoice total');
  let verifiedPaise = 0;
  let submittedPaise = 0;
  for (const payment of payments) {
    if (!validPaise(payment.amountPaise) || payment.amountPaise === 0)
      throw new Error('Invalid payment amount');
    if (payment.status === 'verified') verifiedPaise += payment.amountPaise;
    else if (payment.status === 'submitted') submittedPaise += payment.amountPaise;
    else if (payment.status !== 'rejected') throw new Error('Invalid payment status');
    if (!Number.isSafeInteger(verifiedPaise) || !Number.isSafeInteger(submittedPaise))
      throw new Error('Payment total overflow');
  }
  if (verifiedPaise > invoiceTotalPaise)
    throw new Error('Verified payments exceed invoice total');
  const outstandingPaise = invoiceTotalPaise - verifiedPaise;
  return {
    verifiedPaise,
    submittedPaise,
    outstandingPaise,
    status: outstandingPaise === 0 ? 'paid' : verifiedPaise > 0 ? 'partially_paid' : 'unpaid',
  } as const;
}
