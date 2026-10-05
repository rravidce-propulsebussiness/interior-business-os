export function displayValue(value: unknown): string {
  return value === null || value === undefined
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
}
export function ReportBreakdown({ rows }: { rows: Record<string, unknown>[] }) {
  const stages = rows.filter((row) => row.dimension === 'Lead stage');
  const maximum = Math.max(1, ...stages.map((row) => Number(row.count)));
  return (
    <>
      {stages.length > 0 && (
        <figure className="my-4 space-y-2 rounded border p-4">
          <figcaption className="font-semibold">
            Lead pipeline by current stage
          </figcaption>
          {stages.map((row) => (
            <div
              key={String(row.label)}
              className="grid grid-cols-[minmax(100px,1fr)_2fr_50px] items-center gap-3"
            >
              <span>{String(row.label)}</span>
              <meter
                className="h-5 w-full"
                min={0}
                max={maximum}
                value={Number(row.count)}
                aria-label={`${row.label}: ${row.count} leads`}
              />
              <span>{String(row.count)}</span>
            </div>
          ))}
        </figure>
      )}
      <ReportTable rows={rows} />
    </>
  );
}
export function ReportTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(
    (key) =>
      ![
        'id',
        'project_id',
        'customer_id',
        'assignee_id',
        'industry_id',
      ].includes(key) &&
      rows.some(
        (row) => row[key] !== null && row[key] !== undefined && row[key] !== '',
      ),
  );
  if (!rows.length)
    return (
      <p className="rounded border p-6">No records match these filters.</p>
    );
  return (
    <div className="overflow-auto rounded border">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100">
          <tr>
            {columns.map((column) => (
              <th className="whitespace-nowrap p-3 capitalize" key={column}>
                {column.replaceAll('_', ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr className="border-t" key={String(row.id ?? index)}>
              {columns.map((column) => (
                <td
                  className="min-w-28 max-w-md break-words p-3 align-top"
                  key={column}
                >
                  {displayValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
