'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { quotationCommand } from './actions';

/** Shared/issued quotations remain immutable. Editing safely forks a draft
 * revision using the existing versioned, permission-checked quotation command. */
export function QuotationReviseButton({
  revisionId, version, number,
}: {
  revisionId: string;
  version: number;
  number: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <span className="qs-quote-revise-wrap">
      <button
        type="button"
        className="qs-quote-edit"
        title="Edit as a new draft revision. The quotation already shared with the customer stays unchanged."
        aria-label={'Edit ' + number + ' as a new draft revision'}
        disabled={pending}
        onClick={async () => {
          if (pending) return;
          setPending(true);
          setMessage('');
          try {
            const result = await quotationCommand({
              action: 'clone',
              revision_id: revisionId,
              version,
            });
            if (result.id) {
              router.push('/dashboard/quotations/' + encodeURIComponent(result.id) + '/studio?step=quote');
              router.refresh();
            } else {
              setMessage(result.message || 'Could not create an editable revision.');
            }
          } catch {
            setMessage('Unable to create an editable revision. Please retry.');
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? 'Creating…' : '✎ Edit'}
      </button>
      {message && <small role="alert" className="qs-quote-revise-error">{message}</small>}
    </span>
  );
}
