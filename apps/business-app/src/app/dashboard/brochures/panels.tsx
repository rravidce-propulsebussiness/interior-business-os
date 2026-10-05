'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { templateCatalog } from '@business-os/brochure-builder/templates';
import {
  createBrochure,
  changeBrochureStatus,
  publishBrochure,
  archiveBrochureAsset,
} from './actions';
export function BrochureCreate({ copyId }: { copyId?: string }) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-4 rounded-lg border p-5"
      action={(f) =>
        start(async () => {
          const r = await createBrochure(
            String(f.get('name')),
            String(f.get('slug')),
            String(f.get('template') ?? ''),
            copyId,
          );
          setMessage(r.message);
          if (r.ok) router.push(`/dashboard/brochures/${r.id}/editor`);
        })
      }
    >
      <h2 className="text-lg font-semibold">
        {copyId ? 'Duplicate brochure' : 'Create brochure'}
      </h2>
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-2 text-sm">
          Name
          <input
            name="name"
            required
            maxLength={160}
            className="rounded border p-2"
          />
        </label>
        <label className="grid gap-2 text-sm">
          Public slug
          <input
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={80}
            className="rounded border p-2"
          />
        </label>
        {!copyId && (
          <label className="grid gap-2 text-sm">
            Start from
            <select name="template" className="rounded border p-2">
              <option value="">Blank page</option>
              {templateCatalog.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          {pending ? 'Creating…' : 'Create'}
        </button>
      </div>
      <p role="status" className="text-sm">
        {message}
      </p>
    </form>
  );
}
export function BrochureStatus({
  id,
  version,
  status,
  canManage,
  canPublish,
}: {
  id: string;
  version: number;
  status: string;
  canManage: boolean;
  canPublish: boolean;
}) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link className="underline" href={`/dashboard/brochures/${id}/editor`}>
        Edit
      </Link>
      {canPublish && status === 'published' && (
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await changeBrochureStatus(id, version, 'unpublished');
              setMessage(r.message);
              if (r.ok) router.refresh();
            })
          }
        >
          Unpublish
        </button>
      )}
      {canManage && status !== 'suspended' && (
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await changeBrochureStatus(
                id,
                version,
                status === 'archived' ? 'draft' : 'archived',
              );
              setMessage(r.message);
              if (r.ok) router.refresh();
            })
          }
        >
          {status === 'archived' ? 'Restore draft' : 'Archive'}
        </button>
      )}
      <span role="status">{message}</span>
    </div>
  );
}
export function RestoreBrochure({
  id,
  version,
  restoreId,
}: {
  id: string;
  version: number;
  restoreId: string;
}) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span>
      <button
        className="underline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await publishBrochure(
              id,
              version,
              'Restored historical publication',
              restoreId,
            );
            setMessage(r.message);
            if (r.ok) router.refresh();
          })
        }
      >
        Restore as new version
      </button>
      <span role="status"> {message}</span>
    </span>
  );
}
export function MediaLibrary({
  assets,
}: {
  assets: {
    id: string;
    name: string;
    width: number | null;
    height: number | null;
  }[];
}) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap items-end gap-4"
        action={(f) =>
          start(async () => {
            try {
              const r = await fetch('/dashboard/brochures/media/upload', {
                method: 'POST',
                body: f,
              });
              const data = await r.json();
              setMessage(data.message);
              if (r.ok) router.refresh();
            } catch {
              setMessage('Upload unavailable');
            }
          })
        }
      >
        <label className="grid gap-2">
          Image
          <input
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            required
          />
        </label>
        <label className="grid gap-2">
          Alt text
          <input
            name="alt"
            required
            maxLength={500}
            className="rounded border p-2"
          />
        </label>
        <button
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          Upload
        </button>
      </form>
      <p role="status">{message}</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {assets.map((a) => (
          <article className="rounded border p-3" key={a.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/dashboard/brochures/media/${a.id}?thumbnail=1`}
              alt={a.name}
              className="h-36 w-full object-contain"
              loading="lazy"
            />
            <h2 className="mt-3 text-sm font-semibold">{a.name}</h2>
            <p className="text-xs text-muted-foreground">
              {a.width} × {a.height} px
            </p>
            <button
              className="mt-2 text-xs underline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await archiveBrochureAsset(a.id);
                  setMessage(r.message);
                  if (r.ok) router.refresh();
                })
              }
            >
              Archive if unused
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
