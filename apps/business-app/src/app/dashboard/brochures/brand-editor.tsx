'use client';
import { useState, useTransition } from 'react';
import {
  contentSchema,
  type MarketingKit,
} from '@business-os/brochure-builder';
import {
  brochureSources,
  saveMarketingKit,
  grantBrochureDesigner,
} from './actions';
export function BrandEditor({
  initial,
  initialVersion,
  assets,
}: {
  initial: MarketingKit;
  initialVersion: number;
  assets: { id: string; name: string }[];
}) {
  const [kit, setKit] = useState(initial);
  const [version, setVersion] = useState(initialVersion);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const [query, setQuery] = useState('');
  const [sourceKind, setSourceKind] = useState('projects');
  const [sourcePage, setSourcePage] = useState(1);
  const [choices, setChoices] = useState<
    { id: string; title: string; description: string }[]
  >([]);
  const control = 'w-full rounded border p-2';
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          ['tagline', 'about', 'phone', 'email', 'website', 'address'] as const
        ).map((k) => (
          <label key={k} className="grid gap-2 text-sm">
            {k}
            <textarea
              className={control}
              rows={k === 'about' ? 4 : 2}
              value={kit.brand[k]}
              onChange={(e) =>
                setKit({ ...kit, brand: { ...kit.brand, [k]: e.target.value } })
              }
            />
          </label>
        ))}
        {(['logo', 'secondaryLogo'] as const).map((k) => (
          <label key={k} className="grid gap-2 text-sm">
            {k}
            <select
              className={control}
              value={kit.brand[k] ?? ''}
              onChange={(e) => {
                const brand = { ...kit.brand };
                if (e.target.value) brand[k] = e.target.value;
                else delete brand[k];
                setKit({ ...kit, brand });
              }}
            >
              <option value="">None</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="grid gap-2 text-sm">
          Brochure types (one per line)
          <textarea
            className={control}
            value={kit.types.join('\n')}
            onChange={(e) =>
              setKit({
                ...kit,
                types: e.target.value.split('\n').filter(Boolean),
              })
            }
          />
        </label>
        <label className="grid gap-2 text-sm">
          Social links (label | HTTPS URL)
          <textarea
            className={control}
            value={kit.brand.social
              .map((s) => `${s.label} | ${s.url}`)
              .join('\n')}
            onChange={(e) =>
              setKit({
                ...kit,
                brand: {
                  ...kit.brand,
                  social: e.target.value
                    .split('\n')
                    .filter(Boolean)
                    .map((row) => {
                      const [label, url] = row.split('|');
                      return {
                        label: label?.trim() ?? '',
                        url: url?.trim() ?? '',
                      };
                    }),
                },
              })
            }
          />
        </label>
        {(
          [
            'primary',
            'secondary',
            'accent',
            'background',
            'surface',
            'text',
            'muted',
            'border',
          ] as const
        ).map((k) => (
          <label key={k} className="flex items-center gap-3 text-sm">
            {k}
            <input
              type="color"
              value={kit.brand.theme[k]}
              onChange={(e) =>
                setKit({
                  ...kit,
                  brand: {
                    ...kit.brand,
                    theme: { ...kit.brand.theme, [k]: e.target.value },
                  },
                })
              }
            />
          </label>
        ))}
      </div>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Public content library</h2>
        <p className="text-sm">
          Imports include only safe titles and catalog descriptions. Customer
          names, addresses, costs and project notes are never imported.
        </p>
        <div className="flex flex-wrap gap-3">
          <select
            className="rounded border p-2"
            value={sourceKind}
            onChange={(e) => {
              setSourceKind(e.target.value);
              setSourcePage(1);
            }}
          >
            <option value="projects">Project titles</option>
            <option value="catalog_items">Catalog services/materials</option>
          </select>
          <input
            aria-label="Search source"
            className="rounded border p-2"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSourcePage(1);
            }}
          />
          <button
            disabled={pending}
            className="underline"
            onClick={() =>
              start(async () => {
                try {
                  const rows = await brochureSources(
                    sourceKind,
                    query,
                    sourcePage,
                  );
                  setChoices(
                    rows.map((r) => ({
                      id: String(r.id),
                      title: String(r.title),
                      description: String(r.description ?? ''),
                    })),
                  );
                } catch {
                  setMessage('Source access unavailable');
                }
              })
            }
          >
            Search page {sourcePage}
          </button>
          <button
            disabled={sourcePage === 1}
            onClick={() => setSourcePage((p) => p - 1)}
          >
            Previous
          </button>
          <button onClick={() => setSourcePage((p) => p + 1)}>Next</button>
        </div>
        {choices.map((c) => (
          <button
            className="mr-3 rounded border p-2 text-sm"
            key={c.id}
            onClick={() =>
              setKit({
                ...kit,
                content: [
                  ...kit.content,
                  contentSchema.parse({
                    id: 'content' + crypto.randomUUID().replaceAll('-', ''),
                    kind: sourceKind === 'projects' ? 'project' : 'service',
                    title: c.title,
                    description: c.description,
                    public: false,
                    source: { kind: sourceKind, id: c.id },
                  }),
                ],
              })
            }
          >
            Import {c.title} for review
          </button>
        ))}
        {kit.content.map((c, index) => (
          <article
            key={c.id}
            className="grid gap-3 rounded border p-4 sm:grid-cols-2"
          >
            <label className="grid gap-2 text-sm">
              Kind
              <select
                className={control}
                value={c.kind}
                onChange={(e) =>
                  setKit({
                    ...kit,
                    content: kit.content.map((n, i) =>
                      i === index
                        ? { ...n, kind: e.target.value as typeof c.kind }
                        : n,
                    ),
                  })
                }
              >
                {[
                  'profile',
                  'service',
                  'project',
                  'material',
                  'testimonial',
                  'team',
                  'faq',
                  'contact',
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            {(
              [
                'title',
                'description',
                'publicPrice',
                'location',
                'link',
              ] as const
            ).map((k) => (
              <label key={k} className="grid gap-2 text-sm">
                {k}
                <textarea
                  className={control}
                  value={c[k]}
                  onChange={(e) =>
                    setKit({
                      ...kit,
                      content: kit.content.map((n, i) =>
                        i === index ? { ...n, [k]: e.target.value } : n,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <label className="grid gap-2 text-sm">
              Approved image
              <select
                className={control}
                value={c.asset ?? ''}
                onChange={(e) =>
                  setKit({
                    ...kit,
                    content: kit.content.map((n, i) => {
                      if (i !== index) return n;
                      const next = { ...n };
                      if (e.target.value) next.asset = e.target.value;
                      else delete next.asset;
                      return next;
                    }),
                  })
                }
              >
                <option value="">None</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={c.public}
                onChange={(e) =>
                  setKit({
                    ...kit,
                    content: kit.content.map((n, i) =>
                      i === index ? { ...n, public: e.target.checked } : n,
                    ),
                  })
                }
              />
              Approved for public display
            </label>
            <button
              className="text-left text-sm underline"
              onClick={() =>
                setKit({
                  ...kit,
                  content: kit.content.filter((_, i) => i !== index),
                })
              }
            >
              Remove content entry
            </button>
          </article>
        ))}
        <button
          className="rounded border px-4 py-2"
          onClick={() =>
            setKit({
              ...kit,
              content: [
                ...kit.content,
                contentSchema.parse({
                  id: 'content' + crypto.randomUUID().replaceAll('-', ''),
                  kind: 'service',
                  title: 'New content',
                }),
              ],
            })
          }
        >
          + Add content
        </button>
      </section>
      <button
        className="rounded bg-primary px-5 py-2 text-primary-foreground"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveMarketingKit(version, kit);
            setMessage(r.message);
            if (r.ok) setVersion(r.version);
          })
        }
      >
        Save brand and content
      </button>
      <p role="status">{message}</p>
      <form
        className="flex flex-wrap items-end gap-4 border-t pt-5"
        action={(f) =>
          start(async () =>
            setMessage(
              (await grantBrochureDesigner(String(f.get('user')))).message,
            ),
          )
        }
      >
        <label className="grid gap-2 text-sm">
          Assign Brochure Designer to an existing member
          <input
            className={control}
            name="user"
            required
            placeholder="Member UUID"
          />
        </label>
        <button className="rounded border px-4 py-2" disabled={pending}>
          Assign role
        </button>
      </form>
    </div>
  );
}
