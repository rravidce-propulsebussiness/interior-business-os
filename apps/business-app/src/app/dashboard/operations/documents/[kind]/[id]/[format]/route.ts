import {
  operationsDocumentSchema,
  renderOperationsDocument,
} from '@business-os/core/operations-document';
import { safeFailure } from '@business-os/shared';
import { operationsServices } from '../../../../service';
import { renderQuotationPdf } from '../../../../../quotations/pdf-renderer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string; format: string }> },
) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'",
  };
  try {
    const { kind, id, format } = await params;
    const permission: Record<string, string> = {
      material_issue: 'inventory.view',
      inventory_movement: 'inventory.view',
      consumption: 'inventory.view',
      movement_report: 'inventory.view',
      inspection: 'inspection.view',
      snag: 'snag.view',
      handover: 'handover.view',
      work_order: 'subcontractor.view',
      completion: 'execution.view',
    };
    if (!permission[kind] || !['pdf', 'preview'].includes(format))
      return new Response('Not found', { status: 404, headers });
    const s = await operationsServices(permission[kind]),
      filter = Object.fromEntries(
        [...new URL(request.url).searchParams].filter(
          ([, value]) => value !== '',
        ),
      ),
      document = operationsDocumentSchema.parse(
        await s.operations.document(kind, id, filter),
      ),
      html = renderOperationsDocument(document);
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
    return new Response(safeFailure(error).message, { status: 403, headers });
  }
}
