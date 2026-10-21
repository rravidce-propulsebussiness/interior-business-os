'use client';
import { useActionState } from 'react';
import { saveInvoiceBankPayee } from '../direct-bank-actions';

export function BankPayeeForm({ initial }: { initial: {
  beneficiaryName: string; bankName: string; accountNumber: string; ifsc: string; upiId: string;
} | null }) {
  const [state, action, pending] = useActionState(saveInvoiceBankPayee, { ok: false, message: '' });
  return <form action={action} className="space-y-4 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-semibold">Direct bank and UPI payment details</h2>
    <p className="text-sm text-slate-600">Clients pay your company directly. A submitted UTR does not confirm payment until your office verifies the bank credit.</p>
    {([
      ['beneficiaryName', 'Account holder / company name', true],
      ['bankName', 'Bank name', false],
      ['accountNumber', 'Bank account number', false],
      ['ifsc', 'IFSC', false],
      ['upiId', 'Company UPI ID', false],
    ] as const).map(([name, label, required]) => <label key={name} className="block text-sm font-medium">
      {label}<input name={name} defaultValue={initial?.[name] ?? ''} required={required}
        maxLength={name === 'beneficiaryName' || name === 'bankName' ? 150 : name === 'upiId' ? 192 : 25}
        autoComplete="off" className="mt-1 block w-full rounded-lg border border-slate-300 p-3" />
    </label>)}
    <button disabled={pending} className="rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save bank details'}</button>
    {state.message && <p role="status" className={state.ok ? 'text-green-700' : 'text-red-700'}>{state.message}</p>}
  </form>;
}
