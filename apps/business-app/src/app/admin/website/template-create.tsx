'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTemplate } from './template-actions';
export function TemplateCreate() {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="grid gap-4 rounded-xl border bg-card p-6 sm:grid-cols-2"
      action={(form) =>
        start(async () => {
          const result = await createTemplate(form);
          setMessage(result.message);
          if (result.id) router.push(`/admin/website/templates/${result.id}`);
        })
      }
    >
      <h2 className="text-lg font-semibold sm:col-span-2">
        Create a reusable template
      </h2>
      <label>
        Template name
        <input
          name="name"
          required
          maxLength={160}
          className="mt-1 block w-full rounded border p-2"
          placeholder="Premium construction"
        />
      </label>
      <label>
        Starting point
        <select name="kind" className="mt-1 block w-full rounded border p-2">
          <option value="construction">Construction</option>
          <option value="services">Professional services</option>
          <option value="blank">Blank visual canvas</option>
          <option value="custom">Custom HTML, CSS and JavaScript</option>
        </select>
      </label>
      <label className="sm:col-span-2">
        Description
        <input
          name="description"
          maxLength={1000}
          className="mt-1 block w-full rounded border p-2"
        />
      </label>
      <button
        disabled={pending}
        className="rounded bg-primary px-4 py-3 text-primary-foreground"
      >
        {pending ? 'Creating…' : 'Create template'}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
