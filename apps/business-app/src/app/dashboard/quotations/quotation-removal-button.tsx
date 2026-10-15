'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { quotationCommand } from './actions';

export function QuotationRemovalButton({
  id, number, version,
}: { id: string; number: string; version: number }) {
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
        title="Cancel this draft quotation; keep its revision history"
        onClick={async () => {
          if (!window.confirm('Delete draft ' + number + '? The draft will be cancelled, not permanently erased. Issued quotes, projects and client history are preserved.')) return;
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
        {pending ? 'Removing…' : 'Delete'}
      </button>
      {message && <small role="alert" style={{ color: '#b42318', maxWidth: 160 }}>{message}</small>}
    </span>
  );
}
