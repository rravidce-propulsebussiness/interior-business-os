'use client';
import { useActionState } from 'react';
import { createInvoicePaymentRequest } from '../direct-bank-actions';

export function RequestInvoicePayment({ invoiceId, outstanding }: {
  invoiceId: string; outstanding: number;
}) {
  const [state, action, pending] = useActionState(createInvoicePaymentRequest, {
    ok: false, message: '',
  });
  return <form action={action} className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Request direct bank payment</h2>
    <p className="text-sm text-slate-600">
      Request payment against this issued invoice. The customer pays your company bank or UPI account directly.
      Only bank-confirmed transfers can be marked paid.
    </p>
    <input type="hidden" name="invoiceId" value={invoiceId}/>
    <label className="block text-sm">Amount (INR)
      <input type="number" name="amount" min="0.01" max={outstanding}
        step="0.01" defaultValue={outstanding.toFixed(2)} required
        className="mt-1 block w-full rounded-lg border p-2"/>
    </label>
    <label className="block text-sm">Message (optional)
      <textarea name="message" maxLength={1000} rows={2}
        className="mt-1 block w-full rounded-lg border p-2"/>
    </label>
    <button type="submit" disabled={pending || outstanding <= 0}
      className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
      {pending ? 'Creating request…' : 'Create payment request'}
    </button>
    {state.message && <p role="status" className={state.ok ? 'text-green-700' : 'text-red-700'}>
      {state.message}
    </p>}
  </form>;
}
