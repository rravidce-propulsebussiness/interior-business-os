import { pageServices, activeOrganization } from '@business-os/auth/server';
import { createGstTemplatesRepository } from '@business-os/database/gst-templates';
import { safeFailure } from '@business-os/shared';
import { filingCsv, type WorkpaperFormat } from '../filing-csv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

const validDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(date)) &&
  new Date(date).toISOString().slice(0, 10) === date;

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    const kind = params.get('kind') ?? '';
    const format = params.get('format') ?? '';

    if (
      !validDate(from) ||
      !validDate(to) ||
      from > to ||
      Number(new Date(to)) - Number(new Date(from)) > 366 * 86400000 ||
      (kind !== 'sales_invoice' && kind !== 'purchase_bill') ||
      (format !== 'summary' && format !== 'items')
    ) {
      return new Response(
        'Choose a valid date range, document type and export.',
        {
          status: 400,
          headers,
        },
      );
    }
    const context = await activeOrganization();
    if (!context)
      return new Response('Company selection required.', {
        status: 403,
        headers,
      });
    const { authorization, client } = await pageServices();
    await authorization.requirePermission(
      context.organizationId,
      'invoice.view',
    );

    const documents = await createGstTemplatesRepository(client).filingRows(
      context.organizationId,
      from,
      to,
      kind,
    );
    const body = filingCsv(documents, format as WorkpaperFormat);
    // The content represents draft filing workpapers, not government upload JSON.
    const filename =
      'gst-' +
      (kind === 'sales_invoice' ? 'sales' : 'purchases') +
      '-' +
      format +
      '-' +
      from +
      '-to-' +
      to +
      '.csv';
    return new Response(body, {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
      },
    });
  } catch (error) {
    return new Response(safeFailure(error).message, { status: 403, headers });
  }
}
