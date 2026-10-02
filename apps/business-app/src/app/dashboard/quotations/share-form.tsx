'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { manageShare } from './sharing-actions';
export function ShareForm({
  revisionId,
  shareId,
  action = 'create',
}: {
  revisionId: string;
  shareId?: string;
  action?: 'create' | 'revoke' | 'rotate';
}) {
  const [message, setMessage] = useState(''),
    [url, setUrl] = useState(''),
    router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm({ defaultValues: { expires_at: '', pdf_enabled: true } });
  return (
    <form
      className="my-4 grid max-w-xl gap-3"
      onSubmit={handleSubmit(async (values) => {
        const command =
          action === 'revoke'
            ? { action, id: shareId }
            : {
                action,
                ...(action === 'create'
                  ? { revision_id: revisionId }
                  : { id: shareId }),
                pdf_enabled: values.pdf_enabled,
                expires_at: values.expires_at
                  ? new Date(values.expires_at).toISOString()
                  : null,
              };
        const r = await manageShare(command);
        setMessage(r.message);
        if (r.token) setUrl(window.location.origin + '/q/' + r.token);
        router.refresh();
      })}
    >
      {action !== 'revoke' && (
        <>
          <label>
            Link expiry (optional, your local time)
            <input
              className="block min-h-11 rounded border p-2"
              type="datetime-local"
              {...register('expires_at')}
            />
          </label>
          <label>
            <input type="checkbox" {...register('pdf_enabled')} /> Allow PDF
            download
          </label>
        </>
      )}
      <button disabled={isSubmitting} className="min-h-11 rounded border p-2">
        {isSubmitting
          ? 'Working…'
          : action === 'create'
            ? 'Create secure link'
            : action === 'rotate'
              ? 'Rotate link'
              : 'Revoke link'}
      </button>
      <p role="status">{message}</p>
      {url && (
        <div className="grid gap-3">
          <label>
            New secure link (shown only now)
            <input className="w-full rounded border p-2" readOnly value={url} />
          </label>
          <button
            type="button"
            className="min-h-11 rounded border p-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setMessage('Link copied.');
              } catch {
                setMessage('Select and copy the link above.');
              }
            }}
          >
            Copy link
          </button>
          <a href={url} rel="noreferrer" target="_blank" className="underline">
            Preview as customer
          </a>
        </div>
      )}
    </form>
  );
}
