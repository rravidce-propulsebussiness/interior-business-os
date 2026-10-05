'use client';
import { useActionState } from 'react';
import { configureAutomation } from '../actions';
export function ConfigurationForm({
  section,
  version,
  children,
}: {
  section: 'settings' | 'template' | 'consent';
  version: number;
  children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(configureAutomation, {
    message: '',
  });
  return (
    <form action={action} className="space-y-4 rounded border p-5">
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="version" value={version} />
      {children}
      <button className="rounded border px-4 py-2" disabled={pending}>
        Save {section}
      </button>
      <p role="status">{state.message}</p>
    </form>
  );
}
