'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshDraftQuotationBranding } from './branding-actions';

export type BrandingDraft = {
  id: string;
  version: number;
  quotationNumber: string;
};

export function ApplyBrandingToDrafts({ drafts }: { drafts: BrandingDraft[] }) {
  const [selected, setSelected] = useState(drafts[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const router = useRouter();
  const draft = drafts.find((row) => row.id === selected);

  return (
    <details className="mt-7 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-sm font-extrabold text-slate-900">
        Update branding on an existing draft quotation
      </summary>
      <p className="mt-3 max-w-2xl text-xs leading-6 text-slate-600">
        Save the company branding above first, then apply it to a draft
        quotation. Only its company letterhead and PDF appearance change;
        client, materials, pricing and payment schedule stay intact. Already
        issued PDFs cannot be changed.
      </p>
      {drafts.length ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid min-w-52 flex-1 gap-2 text-xs font-bold text-slate-700">
            Select draft quotation
            <select
              className="min-h-11 rounded-xl border border-slate-200 bg-white p-3"
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setMessage('');
              }}
            >
              {drafts.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.quotationNumber}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!draft || pending}
            className="min-h-11 rounded-xl bg-orange-600 px-5 py-3 text-xs font-extrabold text-white disabled:opacity-50"
            onClick={() => {
              if (!draft) return;
              startTransition(async () => {
                try {
                  const result = await refreshDraftQuotationBranding(
                    draft.id,
                    draft.version,
                  );
                  setMessage(result.message);
                  if (result.ok) router.refresh();
                } catch {
                  setMessage(
                    'Unable to update the draft branding. Please try again.',
                  );
                }
              });
            }}
          >
            {pending ? 'Applying branding…' : 'Apply Saved Branding'}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-600">
          No editable draft quotations found. New quotations use these settings
          automatically.
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-xs font-bold text-slate-800">
          {message}
        </p>
      )}
    </details>
  );
}
