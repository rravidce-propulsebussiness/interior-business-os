'use client';

import { useActionState } from 'react';
import { reviewInvoicePaymentClaim } from '../direct-bank-actions';

export function ClaimReviewForm({ claimId, invoiceId }: { claimId: string; invoiceId: string }) {
  const [state, action, pending] = useActionState(reviewInvoicePaymentClaim, { ok: false, message: '' });
  return (
    <form action={action} className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3">
      <input type="hidden" name="claimId" value={claimId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <label className="block text-sm">
        Bank reconciliation notes
        <textarea name="notes" maxLength={1000} className="mt-1 block w-full rounded-lg border p-2" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="bankCreditConfirmed" className="mt-1" />
        I have independently verified the credit in the company bank account.
      </label>
      <div className="flex gap-2">
        <button type="submit" name="decision" value="approve" disabled={pending}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
          Verify bank credit
        </button>
        <button type="submit" name="decision" value="reject" disabled={pending}
          className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700">
          Reject claim
        </button>
      </div>
      {state.message && <p role="status" className="text-sm">{state.message}</p>}
    </form>
  );
}
