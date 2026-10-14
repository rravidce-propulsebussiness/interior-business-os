'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LeadCategory } from '../lead-category';
import { classifyLead } from './lead-category-actions';

export function LeadCategoryEditor({
  leadId,
  version,
  currentCategory,
  categories,
}: {
  leadId: string;
  version: number;
  currentCategory: LeadCategory;
  categories: LeadCategory[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState<LeadCategory>(currentCategory);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!categories.length) return null;

  return (
    <form
      className="crm-lead-category-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!category || category === currentCategory || busy) return;
        setBusy(true);
        setMessage('');
        try {
          const result = await classifyLead({ leadId, version, category });
          setMessage(result.message);
          if (result.ok) router.refresh();
        } catch {
          setMessage('Unable to update service category.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="crm-lead-category">Service category</label>
      <div className="crm-lead-category-controls">
        <select
          id="crm-lead-category"
          value={category ?? ''}
          onChange={(event) => {
            setCategory(
              event.target.value === 'construction' ||
                event.target.value === 'interior'
                ? event.target.value
                : null,
            );
            setMessage('');
          }}
        >
          <option value="">Select service</option>
          {categories.includes('construction') && (
            <option value="construction">Construction</option>
          )}
          {categories.includes('interior') && (
            <option value="interior">Interiors</option>
          )}
        </select>
        <button
          type="submit"
          disabled={busy || !category || category === currentCategory}
        >
          {busy ? 'Saving…' : 'Save category'}
        </button>
      </div>
      {!currentCategory && (
        <p>
          Confirm whether this customer needs construction or interior services.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
