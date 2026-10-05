import { reportCsv } from '@business-os/core/automation';
import { reportHtml } from '@business-os/core/report-document';
import { renderPdf } from '@business-os/shared/pdf';
import { safeFailure } from '@business-os/shared';
import { reportingServices } from '../../../service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    const format = new URL(request.url).searchParams.get('format');
    if (format !== 'csv' && format !== 'pdf')
      return new Response('Choose CSV or PDF.', { status: 400, headers });
    const { id } = await params,
      s = await reportingServices('snapshot'),
      snapshot = await s.reports.snapshot(id);
    const columns = [
      ...new Set(snapshot.data.rows.flatMap((row) => Object.keys(row))),
    ];
    const body =
      format === 'csv'
        ? reportCsv(
            columns,
            snapshot.data.rows.map((row) =>
              Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                  key,
                  typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : value,
                ]),
              ),
            ),
          )
        : new Uint8Array(
            await renderPdf(reportHtml(snapshot.data, snapshot.id)),
          );
    return new Response(body, {
      headers: {
        ...headers,
        'Content-Type':
          format === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf',
        'Content-Disposition': `attachment; filename="${snapshot.kind}-${snapshot.id}.${format}"`,
      },
    });
  } catch (error) {
    return new Response(safeFailure(error).message, { status: 403, headers });
  }
}
