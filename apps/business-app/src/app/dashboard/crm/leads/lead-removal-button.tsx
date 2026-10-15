'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCrmCommand } from '../actions';

/** Permission-gated server command. Archiving never deletes related quotations. */
export function LeadRemovalButton({
  id,
  name,
  version,
}: {
  id: string;
  name: string;
  version: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'start', gap: 4 }}>
      <button
        type="button"
        className="crm-lead-delete-btn"
        aria-label={'Delete lead ' + name}
        title="Archive this lead and keep its quotations, client and project history"
        disabled={pending}
        onClick={async () => {
          if (!window.confirm(
            'Delete lead ' + name + '? The lead will move to Archived. Its quotations, customer, project and activity history will be kept.',
          )) return;
          setPending(true);
          setError('');
          try {
            const result = await runCrmCommand({
              action: 'archive',
              id,
              version,
            });
            if (result.id) {
              router.refresh();
            } else {
              setError(result.message || 'Unable to remove lead.');
            }
          } catch {
            setError('Unable to remove lead. Please retry.');
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? 'Removing…' : 'Delete'}
      </button>
      {error && <span role="alert" className="crm-lead-delete-error">{error}</span>}
    </span>
  );
}
