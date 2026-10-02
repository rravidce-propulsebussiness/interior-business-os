'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyInteriorStarter } from './actions';
export function InteriorStarter({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <aside className="border-b bg-background px-5 py-4">
      <p className="text-sm">
        Start with a blank canvas or eight fully editable interior studio pages.
        The example uses a labelled concept image and stays in draft.
      </p>
      <button
        className="mt-2 rounded border px-3 py-2 text-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await applyInteriorStarter(id, version);
            setMessage(r.message);
            router.refresh();
          })
        }
      >
        Use interior studio starter
      </button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </aside>
  );
}
