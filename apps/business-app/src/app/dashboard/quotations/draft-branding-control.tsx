'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshDraftQuotationBranding } from './branding-actions';

export function DraftBrandingControl({
  revisionId,
  version,
  editable,
}: {
  revisionId: string;
  version: number;
  editable: boolean;
}) {
  const [busy, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  const router = useRouter();

  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/65 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-orange-600">
            Company quotation branding
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-slate-950">
            Your logo, address &amp; contact details
          </h2>
        </div>
        <Link
          className="rounded-xl border border-orange-300 bg-white px-4 py-2 text-xs font-extrabold text-orange-700"
          href="/dashboard/quotations/settings"
        >
          Edit Company Branding ↗
        </Link>
      </div>
      {editable ? (
        <>
          <button
            type="button"
            disabled={busy}
            className="mt-3 min-h-10 rounded-xl bg-orange-600 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-60"
            onClick={() =>
              start(async () => {
                const result = await refreshDraftQuotationBranding(
                  revisionId,
                  version,
                );
                setFeedback(result.message);
                if (result.ok) router.refresh();
              })
            }
          >
            {busy ? 'Updating branding…' : 'Apply Saved Branding to This Draft'}
          </button>
        </>
      ) : null}
      {feedback && (
        <p role="status" className="mt-3 text-xs font-semibold text-slate-800">
          {feedback}
        </p>
      )}
    </section>
  );
}
