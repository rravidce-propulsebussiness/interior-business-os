'use client';

import { useState } from 'react';

// Preserve the existing server-side slug pattern while accepting natural
// mobile input: uppercase letters, spaces, punctuation and pasted names.
function normalizeSlug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 80);
}

function completeSlug(value: string) {
  return normalizeSlug(value).replace(/-+$/, '');
}

export function CompanyIdentityFields() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [customSlug, setCustomSlug] = useState(false);

  return (
    <>
      <label className="grid gap-2 text-sm font-medium">
        Company name
        <input
          name="name"
          value={name}
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            if (!customSlug) setSlug(completeSlug(next));
          }}
          required
          minLength={2}
          maxLength={200}
          autoComplete="organization"
          placeholder="Your registered business name"
          className="rounded-lg border border-slate-300 px-4 py-3"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Workspace slug
        <input
          name="slug"
          value={slug}
          onChange={(event) => {
            setSlug(normalizeSlug(event.target.value));
            setCustomSlug(true);
          }}
          onBlur={() => setSlug((current) => completeSlug(current))}
          required
          maxLength={80}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="my-company"
          aria-describedby="company-slug-help"
          className="rounded-lg border border-slate-300 px-4 py-3"
        />
        <span
          id="company-slug-help"
          className="text-xs font-normal text-slate-600"
        >
          {customSlug
            ? 'Use lowercase letters, numbers and hyphens (e.g. sghomes).'
            : 'Automatically created from your company name. You can edit it.'}
        </span>
      </label>
    </>
  );
}
