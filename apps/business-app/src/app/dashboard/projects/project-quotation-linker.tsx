'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { linkSavedQuotationToProject } from './project-quotation-link-action';

export type LinkableProjectQuotation = {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  sourceProjectName: string;
};

export function ProjectQuotationLinker({
  projectId,
  quotes,
}: {
  projectId: string;
  quotes: LinkableProjectQuotation[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  if (!quotes.length) return null;

  const link = (quotationId: string) => {
    setMessage('');
    startTransition(async () => {
      const result = await linkSavedQuotationToProject({
        projectId,
        quotationId,
      });
      setMessage(result.message);
      if (result.saved) router.refresh();
    });
  };

  return (
    <details className="pv2-secondary-more pv2-link-existing-quote">
      <summary>Link an existing customer quotation</summary>
      <p className="pv2-muted">
        Choose the quotation for this project. Linking reuses the saved
        quotation and its existing grouped payment schedule; it does not issue
        the quote, send it, or record customer approval or payment.
      </p>
      <ul>
        {quotes.map((quote) => (
          <li key={quote.id}>
            <div>
              <strong>{quote.number}</strong>
              <small>
                {quote.status === 'draft' ? 'Saved · editable' : quote.status} ·{' '}
                {quote.sourceProjectName}
              </small>
            </div>
            <button
              type="button"
              className="pv2-button pv2-outline"
              disabled={pending}
              onClick={() => link(quote.id)}
            >
              {pending ? 'Linking…' : 'Link to this project'}
            </button>
          </li>
        ))}
      </ul>
      {message && (
        <p className="pv2-form-feedback" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
