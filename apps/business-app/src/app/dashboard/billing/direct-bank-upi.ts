/**
 * Direct-to-company UPI payment instructions. This module never initiates,
 * confirms, or records a payment. Bank reconciliation remains authoritative.
 */
export type DirectBankPayee = {
  upiId: string;
  displayName: string;
};
const UPI_ID = /^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9._-]{2,64}$/;
export function createUpiPaymentUri(
  payee: DirectBankPayee,
  amountRupees: number,
  reference: string,
): string {
  const upiId = payee.upiId.trim();
  const displayName = payee.displayName.trim();
  const invoiceReference = reference.trim();
  if (!UPI_ID.test(upiId) || !displayName || displayName.length > 100 ||
      !invoiceReference || invoiceReference.length > 80 ||
      !Number.isFinite(amountRupees) || amountRupees <= 0 ||
      amountRupees > 100000000 ||
      Math.round(amountRupees * 100) !== amountRupees * 100) {
    throw new Error('Invalid direct-bank payment instruction');
  }
  const params = new URLSearchParams({
    pa: upiId,
    pn: displayName,
    am: amountRupees.toFixed(2),
    cu: 'INR',
    tn: invoiceReference,
  });
  return 'upi://pay?' + params.toString();
}
