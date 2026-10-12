'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWebsite } from './actions';
export function WebsiteCreate({
  templates,
  canCode,
}: {
  templates: { id: string; name: string; description: string }[];
  canCode: boolean;
}) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex max-w-2xl flex-wrap items-end gap-4 rounded-xl border p-5"
      action={(form) =>
        start(async () => {
          const r = await createWebsite(
            String(form.get('name')),
            String(form.get('slug')),
            form.get('template') === 'custom'
              ? ''
              : String(form.get('template') ?? ''),
          );
          setMessage(r.message);
          if (r.id)
            router.push(
              `/dashboard/website/${r.id}${form.get('template') === 'custom' ? '/developer' : ''}`,
            );
        })
      }
    >
      <label className="w-full text-sm">
        Starting point
        <select
          name="template"
          className="mt-1 block w-full rounded border p-2"
        >
          <option value="">Blank visual canvas</option>
          {canCode && (
            <option value="custom">
              My own custom HTML, CSS and JavaScript
            </option>
          )}
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Website name
        <input
          className="mt-1 block rounded border p-2"
          name="name"
          required
          maxLength={160}
        />
      </label>
      <label className="text-sm">
        Website subdomain slug
        <input
          className="mt-1 block rounded border p-2"
          name="slug"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          required
          maxLength={63}
        />
      </label>
      <button
        disabled={pending}
        className="rounded bg-primary px-4 py-2 text-primary-foreground"
      >
        Create website
      </button>
      <p role="status" className="w-full text-sm">
        {message}
      </p>
    </form>
  );
}
