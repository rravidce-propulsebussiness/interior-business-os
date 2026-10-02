'use client';
import { useState, useTransition } from 'react';
import { websiteSourceChoices } from './actions';
import type { WebsiteDocument } from '@business-os/website-builder';
export function WebsiteSourcePicker({
  id,
  onSelect,
}: {
  id: string;
  onSelect: (value: WebsiteDocument['content'][number]) => void;
}) {
  const [kind, setKind] = useState<'catalog_items' | 'projects'>(
      'catalog_items',
    ),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<
      { id: string; title: string; description?: string }[]
    >([]),
    [message, setMessage] = useState(''),
    [pending, start] = useTransition();
  const search = (number: number) =>
    start(async () => {
      try {
        setRows(await websiteSourceChoices(id, kind, query, number));
        setPage(number);
        setMessage(
          'Review the imported copy and explicitly approve it for publication.',
        );
      } catch {
        setRows([]);
        setMessage(
          'You need access to the source module to import its records.',
        );
      }
    });
  return (
    <section className="my-5 rounded border p-4">
      <h2>Import public copy from business records</h2>
      <p className="text-sm">
        Only a title and description are offered. Internal project and
        commercial details stay private.
      </p>
      <div className="my-3 flex flex-wrap gap-3">
        <select
          aria-label="Source module"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            setRows([]);
          }}
        >
          <option value="catalog_items">Catalog services</option>
          <option value="projects">Projects</option>
        </select>
        <input
          aria-label="Search source records"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded border p-2"
        />
        <button type="button" disabled={pending} onClick={() => search(1)}>
          Search
        </button>
      </div>
      {rows.map((row) => (
        <div className="flex justify-between border-t py-2" key={row.id}>
          <span>{row.title}</span>
          <button
            type="button"
            onClick={() =>
              onSelect({
                id: `source${crypto.randomUUID().replaceAll('-', '')}`,
                kind: kind === 'projects' ? 'projects' : 'services',
                title: row.title,
                text: row.description ?? '',
                published: false,
                sourceId: row.id,
                sourceType: kind,
              })
            }
          >
            Add for review
          </button>
        </div>
      ))}
      <div className="flex gap-4">
        <button
          type="button"
          disabled={pending || page === 1}
          onClick={() => search(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={pending || rows.length < 25}
          onClick={() => search(page + 1)}
        >
          Next
        </button>
      </div>
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  );
}
