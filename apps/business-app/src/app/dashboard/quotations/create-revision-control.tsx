'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { quotationCommand } from './actions';

export function CreateRevisionControl({
  revisionId, version,
}: { revisionId: string; version: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  return <div className="qs-card" role="region" aria-label="Edit previously shared quotation">
    <h2>Need to change a saved quotation?</h2>
    <p className="qs-muted">
      Edit individual material brands, specifications, quantities or prices in
      a new revision. The version already shared with the customer remains unchanged.
    </p>
    <button type="button" className="qs-btn primary mt-3"
      disabled={pending} onClick={() => start(async () => {
        setMessage('');
        try {
          const result = await quotationCommand({
            revision_id: revisionId, version, action: 'clone',
          });
          if (result.id) {
            router.push('/dashboard/quotations/' + result.id + '/studio?step=quote');
          } else {
            setMessage(result.message || 'Unable to create the new revision.');
          }
        } catch {
          setMessage('Unable to open a new revision. Try again.');
        }
      })}>
      {pending ? 'Preparing editable version…' : 'Edit Quote (New Revision)'}
    </button>
    {message && <p className="qs-message mt-3" role="alert">{message}</p>}
  </div>;
}
