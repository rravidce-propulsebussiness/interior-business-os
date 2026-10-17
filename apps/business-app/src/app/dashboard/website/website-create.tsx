'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWebsite } from './actions';

type Template = { id: string; name: string; description: string };

export function WebsiteCreate({
  templates,
  canCode,
  open,
  onClose,
  initialTemplate = '',
}: {
  templates: Template[];
  canCode: boolean;
  open: boolean;
  onClose: () => void;
  initialTemplate?: string;
}) {
  const [message, setMessage] = useState('');
  const [template, setTemplate] = useState(initialTemplate);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugChanged, setSlugChanged] = useState(false);
  const [pending, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setTemplate(initialTemplate);
    setMessage('');
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
  }, [open, initialTemplate, onClose]);

  if (!open) return null;

  const updateName = (value: string) => {
    setName(value);
    if (!slugChanged) setSlug(
      value.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63),
    );
  };
  return (
    <div className="website-modal-screen">
      <button type="button" className="website-modal-overlay" aria-label="Close create website" onClick={onClose} />
      <section className="website-create-dialog" role="dialog" aria-modal="true" aria-labelledby="website-create-title">
        <div className="website-dialog-heading">
          <div><p>NEW WEBSITE</p><h2 id="website-create-title">Create your website</h2>
            <span>Choose a starting point and give your new website a name.</span></div>
          <button type="button" className="website-dialog-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <form className="website-create-form" action={(form) => start(async () => {
          const result = await createWebsite(
            String(form.get('name') ?? '').trim(),
            String(form.get('slug') ?? '').trim(),
            String(form.get('template') ?? '') === 'custom'
              ? '' : String(form.get('template') ?? ''),
          );
          setMessage(result.message);
          if (result.id) {
            onClose();
            router.push(
              `/dashboard/website/${result.id}${template === 'custom' ? '/developer' : ''}`,
            );
          }
        })}>
          <label htmlFor="website-template">Starting point</label>
          <select id="website-template" name="template" value={template}
            onChange={(event) => setTemplate(event.target.value)}>
            <option value="">Blank visual canvas</option>
            {templates.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
            {canCode && <option value="custom">Custom HTML, CSS and JavaScript</option>}
          </select>
          <label htmlFor="website-name">Website name</label>
          <input ref={nameRef} id="website-name" name="name" required maxLength={160}
            value={name} onChange={(event) => updateName(event.target.value)}
            placeholder="e.g. My Construction Company" />
          <label htmlFor="website-slug">Website subdomain slug</label>
          <input id="website-slug" name="slug" required minLength={3} maxLength={63}
            pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug}
            onChange={(event) => { setSlugChanged(true); setSlug(event.target.value.toLowerCase()); }}
            placeholder="my-construction-company" />
          <p className="website-form-hint">Use lowercase letters, numbers and hyphens. You can connect your own domain after creating the website.</p>
          {!!message && <p className="website-form-message" role="status">{message}</p>}
          <div className="website-dialog-actions">
            <button type="button" className="website-dialog-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="website-primary" disabled={pending}>
              {pending ? 'Creating…' : 'Create Website →'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
