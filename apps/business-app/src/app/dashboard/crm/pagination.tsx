import Link from 'next/link';
export function Pagination({
  path,
  params,
  page,
  total,
  pageKey = 'page',
}: {
  path: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  pageKey?: string;
}) {
  const href = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (v && k !== pageKey) p.set(k, v);
    p.set(pageKey, String(n));
    return path + '?' + p;
  };
  return (
    <nav aria-label="Pagination" className="my-6 flex gap-6">
      <span>
        {total} records · Page {page}
      </span>
      {page > 1 && (
        <Link className="underline" href={href(page - 1)}>
          Previous
        </Link>
      )}
      {page * 25 < total && (
        <Link className="underline" href={href(page + 1)}>
          Next
        </Link>
      )}
    </nav>
  );
}
