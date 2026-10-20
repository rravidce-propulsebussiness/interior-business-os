/**
 * Payment-claim lifecycle rules. The server must additionally check tenant
 * ownership, invoice status, staff permissions and actual bank credit.
 */
export type PaymentClaimStatus = 'submitted' | 'verified' | 'rejected';
export type PaymentClaimAction = 'verify' | 'reject';
export function nextPaymentClaimStatus(
  current: PaymentClaimStatus,
  action: PaymentClaimAction,
  bankCreditConfirmed: boolean,
): PaymentClaimStatus {
  if (current !== 'submitted') throw new Error('Payment claim already reviewed');
  if (action === 'reject') return 'rejected';
  if (action === 'verify' && bankCreditConfirmed === true) return 'verified';
  throw new Error('Bank credit must be confirmed before verification');
}
export function validatePaymentClaim(
  amountPaise: number,
  utr: string,
  remainingPaise: number,
): { amountPaise: number; utr: string } {
  const reference = utr.trim();
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 ||
      !Number.isSafeInteger(remainingPaise) || remainingPaise <= 0 ||
      amountPaise > remainingPaise ||
      reference.length < 6 || reference.length > 64 ||
      !/^[a-zA-Z0-9/-]+$/.test(reference)) {
    throw new Error('Invalid bank transfer claim');
  }
  return { amountPaise, utr: reference };
}
