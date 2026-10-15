'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setProjectArchived } from './project-removal-actions';

export function ProjectRemovalButton({
  id, name, archived,
}: { id: string; name: string; archived: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        disabled={pending}
        title={archived ? 'Restore project' : 'Archive project without losing history'}
        className="proj-open"
        style={{ cursor: 'pointer', color: archived ? 'inherit' : '#b42318' }}
        onClick={async () => {
          if (!window.confirm(archived
            ? 'Restore ' + name + ' to active projects?'
            : 'Delete ' + name + ' from the active list? This archives the project. Signed agreements, payments, photos and site history will be preserved.')) return;
          setPending(true);
          setMessage('');
          try {
            const result = await setProjectArchived(id, !archived);
            if (!result.ok) setMessage(result.message);
            else {
              router.push('/dashboard/projects?status=active');
              router.refresh();
            }
          } catch {
            setMessage('Unable to update project. Please retry.');
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? 'Saving…' : archived ? 'Restore' : 'Delete'}
      </button>
      {message && <small role="alert" style={{ color: '#b42318', maxWidth: 220 }}>{message}</small>}
    </span>
  );
}
