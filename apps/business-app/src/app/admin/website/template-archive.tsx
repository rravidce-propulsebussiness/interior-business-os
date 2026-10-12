'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archiveTemplate } from './template-actions';
export function TemplateArchive({
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
    <div className="text-sm">
      <button
        className="rounded border px-3 py-2"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await archiveTemplate(id, version);
            setMessage(result.message);
            router.refresh();
          })
        }
      >
        Archive template
      </button>
      <p role="status" className="mt-2">
        {message}
      </p>
    </div>
  );
}
