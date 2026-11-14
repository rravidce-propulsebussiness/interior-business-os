'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { removeProjectKeepQuotations } from './project-removal-actions';

export function ProjectRemovalControl({
  projectId,
  version,
}: {
  projectId: string;
  version: number;
}) {
  const router = useRouter();
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [succeeded, setSucceeded] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typedConfirmation.trim() !== 'DELETE' || pending) return;

    startTransition(async () => {
      const result = await removeProjectKeepQuotations(
        projectId,
        version,
        typedConfirmation.trim(),
      );
      setMessage(result.message);
      setSucceeded(result.ok);
      if (result.ok) {
        router.replace('/dashboard/projects');
        router.refresh();
      }
    });
  }

  return (
    <details className="pv2-header-drawer">
      <summary className="pv2-button pv2-outline">Remove demo project</summary>
      <div className="pv2-header-drawer-body">
        <p>
          Temporary demo cleanup. Linked quotation history is preserved when
          possible. Project work, site evidence, QC, curing and other protected
          records can prevent removal.
        </p>
        <form className="pv2-form" onSubmit={submit}>
          <label>
            Type DELETE to confirm
            <input
              autoComplete="off"
              value={typedConfirmation}
              onChange={(event) => setTypedConfirmation(event.target.value)}
            />
          </label>
          <button
            className="pv2-button pv2-danger"
            type="submit"
            disabled={pending || typedConfirmation.trim() !== 'DELETE'}
          >
            {pending ? 'Removing…' : 'Permanently remove project'}
          </button>
          {message && (
            <div
              className={'pv2-form-feedback ' + (succeeded ? 'good' : 'bad')}
              role="status"
              aria-live="polite"
            >
              {message}
            </div>
          )}
        </form>
      </div>
    </details>
  );
}
