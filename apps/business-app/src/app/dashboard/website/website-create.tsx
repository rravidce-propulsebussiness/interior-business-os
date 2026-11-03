'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWebsite } from './actions';

type Template = { id: string; name: string; description: string };

export function WebsiteCreate({
  templates,
  open,
  onClose,
  initialTemplate = '',
}: {
  templates: Template[];
  canCode?: boolean;
  open: boolean;
  onClose: () => void;
  initialTemplate?: string;
}) {
  const [message, setMessage] = useState('');
  const [template, setTemplate] = useState(initialTemplate || templates[0]?.id || '');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugChanged, setSlugChanged] = useState(false);
  const [pending, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    nameRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEscape);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = scroll;
      document.removeEventListener('keydown', onEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  const updateName = (value: string) => {
    setName(value);
    if (!slugChanged)
      setSlug(
        value
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 63),
      );
  };
  return (
    <div className="website-modal-screen">
      <button
        type="button"
        className="website-modal-overlay"
        aria-label="Close create website"
        onClick={onClose}
      />
      <section
        className="website-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="website-create-title"
      >
        <div className="website-dialog-heading">
          <div>
            <p>NEW WEBSITE</p>
            <h2 id="website-create-title">Create your website</h2>
            <span>
              Choose a fixed template and enter your business name. You can replace text and photos without changing the design.
            </span>
          </div>
          <button
            type="button"
            className="website-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form
          className="website-create-form"
          action={(form) =>
            start(async () => {
              const chosenTemplate = String(form.get('template') ?? '');
              if (!chosenTemplate || chosenTemplate === 'custom') {
                setMessage('Choose one of the available fixed templates.');
                return;
              }
              const result = await createWebsite(
                String(form.get('name') ?? '').trim(),
                String(form.get('slug') ?? '').trim(),
                chosenTemplate,
              );
              setMessage(result.message);
              if (result.id) {
                onClose();
                router.push(`/dashboard/website/${result.id}/layout`);
              }
            })
          }
        >
          <label htmlFor="website-template">Website template</label>
          <select
            id="website-template"
            name="template"
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
          >
            {templates.map(entry => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
</select>
          <p className="website-form-hint">
            {templates.length
              ? 'You can change the template's text, photos and logos. Layout, colors and sections remain fixed.'
              : 'Choose an available starter template.'}
          </p>
          <label htmlFor="website-name">Website name</label>
          <input
            ref={nameRef}
            id="website-name"
            name="name"
            required
            maxLength={160}
            value={name}
            onChange={(event) => updateName(event.target.value)}
            placeholder="e.g. My Construction Company"
          />
          <label htmlFor="website-slug">Website subdomain slug</label>
          <input
            id="website-slug"
            name="slug"
            required
            minLength={3}
            maxLength={63}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={slug}
            onChange={(event) => {
              setSlugChanged(true);
              setSlug(event.target.value.toLowerCase());
            }}
            placeholder="my-construction-company"
          />
          <p className="website-form-hint">
            Use lowercase letters, numbers and hyphens. You can connect your own
            domain after creating the website.
          </p>
          {!!message && (
            <p className="website-form-message" role="status">
              {message}
            </p>
          )}
          <div className="website-dialog-actions">
            <button
              type="button"
              className="website-dialog-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="website-primary"
              disabled={pending || !template}
            >
              {pending ? 'Creating…' : 'Create Website →'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
