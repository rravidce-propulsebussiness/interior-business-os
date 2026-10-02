import Link from 'next/link';
export function SearchList({
  title,
  path,
  query,
  page,
  total,
  rows,
  status,
  navigation = [],
}: {
  title: string;
  path: string;
  query: string;
  page: number;
  total: number;
  rows: { id: string; label: string; detail?: string }[];
  status?: string;
  navigation?: { href: string; label: string }[];
}) {
  const href = (p: number) =>
    `${path}?q=${encodeURIComponent(query)}&page=${p}&status=${encodeURIComponent(status ?? '')}`;
  return (
    <section>
      <nav className="flex flex-wrap gap-4">
        <Link href="/dashboard">Dashboard</Link>
        {navigation.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <h1 className="my-6 text-3xl font-semibold">{title}</h1>
      <form className="flex gap-3">
        <label className="grid gap-1">
          {status === undefined
            ? 'Search by name prefix'
            : 'Search quotation number prefix'}
          <input
            name="q"
            defaultValue={query}
            maxLength={100}
            className="rounded border bg-background p-2"
          />
        </label>
        {status !== undefined && (
          <label className="grid gap-1">
            Revision status
            <select
              name="status"
              defaultValue={status}
              className="rounded border bg-background p-2"
            >
              {['', 'draft', 'issued', 'superseded', 'cancelled'].map(
                (value) => (
                  <option key={value} value={value}>
                    {value || 'All'}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        <button className="self-end rounded border p-2" type="submit">
          Search
        </button>
      </form>
      {!rows.length ? (
        <p className="my-6">No matching records.</p>
      ) : (
        <ul className="my-6 grid gap-3">
          {rows.map((row) => (
            <li className="rounded border p-4" key={row.id}>
              <Link
                className="font-semibold underline"
                href={`${path}/${row.id}`}
              >
                {row.label}
              </Link>
              {row.detail && <p>{row.detail}</p>}
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Pagination" className="flex gap-4">
        {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
        <span>
          Page {page} · {total} records
        </span>
        {page * 25 < total && <Link href={href(page + 1)}>Next</Link>}
      </nav>
    </section>
  );
}
