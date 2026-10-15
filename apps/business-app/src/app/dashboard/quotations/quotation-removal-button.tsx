'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { quotationCommand } from './actions';

export function QuotationRemovalButton({
  id, number, version, issued,
}: { id: string; number: string; version: number; issued: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'end', gap: 3 }}>
      <button
        type="button"
        disabled={pending}
        className="qs-btn"
        style={{ color: '#b42318', cursor: 'pointer', whiteSpace: 'nowrap' }}
        title={issued
          ? 'Cancel issued quotation while retaining the customer and audit history'
          : 'Remove draft quotation from the active list while keeping history'}
        onClick={async () => {
          if (!window.confirm(
            (issued ? 'Cancel issued ' : 'Delete draft ') + number +
              '? This removes the quotation from the active list but keeps the document history, related projects and customer records.',
          )) return;
          setPending(true);
          setMessage('');
          try {
            const result = await quotationCommand({
              action: 'cancel',
              revision_id: id,
              version,
            });
            if (result.id) router.refresh();
            else setMessage(result.message);
          } catch {
            setMessage('Unable to cancel this draft.');
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? 'Saving…' : issued ? 'Cancel' : 'Delete'}
      </button>
      {message && <small role="alert" style={{ color: '#b42318', maxWidth: 160 }}>{message}</small>}
    </span>
  );
}
