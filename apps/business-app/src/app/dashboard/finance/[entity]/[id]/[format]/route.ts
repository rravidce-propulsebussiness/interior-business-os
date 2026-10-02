import {
  financePermissions,
  financeEntitySchema,
} from '@business-os/core/finance';
import {
  financeDocumentSchema,
  renderFinanceDocument,
} from '@business-os/core/finance-document';
import { safeFailure } from '@business-os/shared';
import { financeServices } from '../../../service';
import { renderQuotationPdf } from '../../../../quotations/pdf-renderer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ entity: string; id: string; format: string }> },
) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  };
  try {
    const { entity: raw, id, format } = await params;
    if (!['preview', 'pdf'].includes(format))
      return new Response('Not found', { status: 404, headers });
    const entity = financeEntitySchema.parse(raw),
      s = await financeServices(financePermissions[entity]);
    const document = financeDocumentSchema.parse(
        await s.finance.document(entity, id),
      ),
      html = renderFinanceDocument(document);
    if (format === 'preview')
      return new Response(html, {
        headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
      });
    const pdf = await renderQuotationPdf(html);
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...headers,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${document.number.replaceAll(/[^A-Za-z0-9-]/g, '_')}.pdf"`,
      },
    });
  } catch (error) {
    const failure = safeFailure(error);
    return new Response(failure.message, { status: 403, headers });
  }
}
