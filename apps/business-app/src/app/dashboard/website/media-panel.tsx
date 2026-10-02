'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveWebsiteSection, manageWebsiteAsset } from './actions';
import type { WebsiteDocument } from '@business-os/website-builder';
export function MediaPanel({
  id,
  version,
  document,
  assets,
}: {
  id: string;
  version: number;
  document: WebsiteDocument;
  assets: {
    id: string;
    name: string;
    mime: string;
    bytes: number;
    version: number;
    width: number | null;
    height: number | null;
    alt: string;
  }[];
}) {
  const [message, setMessage] = useState(''),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-3 rounded border p-4"
        action={(form) =>
          start(async () => {
            const r = await fetch(`/dashboard/website/${id}/media`, {
              method: 'POST',
              body: form,
            });
            const data = await r.json();
            setMessage(String(data.message));
            if (r.ok) router.refresh();
          })
        }
      >
        <label className="text-sm">
          Image, PDF or MP4
          <input
            required
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,application/pdf,video/mp4"
            className="mt-2 block text-sm"
          />
        </label>
        <label className="text-sm">
          Alternative text
          <input
            name="alt"
            maxLength={500}
            className="mt-1 block rounded border p-2"
          />
        </label>
        <button
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          Upload
        </button>
      </form>
      <div className="grid gap-4 sm:grid-cols-3">
        {assets.map((a) => (
          <article key={a.id} className="rounded border p-4">
            {a.mime.startsWith('image/') && (
              <div
                className="mb-3 aspect-[4/3] rounded bg-cover bg-center"
                style={{
                  backgroundImage: `url(/dashboard/website/${id}/media/${a.id})`,
                }}
                role="img"
                aria-label={a.alt || a.name}
              />
            )}
            <h2 className="truncate text-sm font-semibold">{a.name}</h2>
            <p className="mt-1 text-xs">
              {Math.ceil(a.bytes / 1024)} KB · {a.mime}
            </p>
            {document.assets.some((x) => x.assetId === a.id) ? (
              <p className="mt-3 break-all text-xs">
                Reference: {document.assets.find((x) => x.assetId === a.id)!.id}
              </p>
            ) : (
              <button
                disabled={pending}
                className="mt-3 text-sm underline"
                onClick={() =>
                  start(async () => {
                    const next = [
                      ...document.assets,
                      {
                        id: `asset${a.id.replaceAll('-', '')}`,
                        assetId: a.id,
                        alt: a.alt,
                        width: a.width ?? 1,
                        height: a.height ?? 1,
                      },
                    ];
                    const r = await saveWebsiteSection(
                      id,
                      version,
                      'assets',
                      next,
                    );
                    setMessage(r.message);
                    if (r.version) router.refresh();
                  })
                }
              >
                Use in draft
              </button>
            )}
            <form
              className="mt-4 space-y-2"
              action={(f) =>
                start(async () => {
                  const r = await manageWebsiteAsset(
                    id,
                    a.id,
                    a.version,
                    String(f.get('name')),
                    String(f.get('alt')),
                    f.get('archive') === 'yes',
                  );
                  setMessage(r.message);
                  router.refresh();
                })
              }
            >
              <label className="block text-xs">
                File name
                <input
                  name="name"
                  defaultValue={a.name}
                  required
                  maxLength={200}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="block text-xs">
                Alternative text
                <input
                  name="alt"
                  defaultValue={a.alt}
                  maxLength={500}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <div className="flex gap-4 text-sm">
                <button disabled={pending}>Save details</button>
                <button disabled={pending} name="archive" value="yes">
                  Archive unused
                </button>
              </div>
            </form>
          </article>
        ))}
      </div>
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
