import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createGstRepository } from '@business-os/database/gst';
import { invoicePdf } from '../../../../invoice-pdf';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response('Not found', { status: 404 });
  const context = await activeOrganization();
  if (!context) return new Response('Unauthorized', { status: 401 });
  try {
    const { authorization, client } = await pageServices();
    await authorization.requirePermission(
      context.organizationId,
      'invoice.view',
    );
    const doc = await createGstRepository(client).document(
      context.organizationId,
      id,
    );
    if (!doc.isOwner || doc.kind !== 'sales_invoice' || doc.status !== 'issued')
      return new Response('Not found', { status: 404 });
    const bytes = await invoicePdf(doc);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="invoice-' +
          doc.number?.replace(/[^a-z0-9-]/gi, '-') +
          '.pdf"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Invoice PDF unavailable', { status: 503 });
  }
}
