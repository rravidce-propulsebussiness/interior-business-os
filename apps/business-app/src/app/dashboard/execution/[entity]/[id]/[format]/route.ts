import { PdfServiceError } from '@business-os/shared/pdf';
import {
  executionDocumentSchema,
  renderExecutionDocument,
} from '@business-os/core/execution-document';
import { safeFailure } from '@business-os/shared';
import { executionServices } from '../../../service';
import { renderQuotationPdf } from '../../../../quotations/pdf-renderer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ entity: string; id: string; format: string }> },
) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'",
  };
  try {
    const { entity, id, format } = await params;
    const permission = (
      {
        execution_estimate_revisions: 'estimate.view_cost',
        rfqs: 'rfq.view',
        purchase_orders: 'purchase_order.view_cost',
        goods_receipts: 'goods_receipt.view',
      } as Record<string, string>
    )[entity];
    if (!permission || !['preview', 'pdf'].includes(format))
      return new Response('Not found', { status: 404, headers });
    const s = await executionServices(permission),
      vendor = new URL(request.url).searchParams.get('vendor') ?? undefined;
    const document = executionDocumentSchema.parse(
        await s.execution.document(entity, id, vendor),
      ),
      html = renderExecutionDocument(document);
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
    if (error instanceof PdfServiceError)
      return new Response('PDF rendering service is unavailable', {
        status: error.status, headers,
      });
    return new Response(safeFailure(error).message, { status: 403, headers });
  }
}
