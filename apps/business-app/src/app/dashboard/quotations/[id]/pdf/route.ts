import { quotationDocument } from '../../document';
import { renderQuotationPdf } from '../../pdf';
import { safeFailure } from '@business-os/shared';
import { PdfServiceError } from '@business-os/shared/pdf';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params,
      { html, document } = await quotationDocument(id),
      bytes = await renderQuotationPdf(html);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${document.number.replaceAll(/[^A-Za-z0-9-]/g, '_')}-R${document.revision}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof PdfServiceError) {
      return new Response('PDF rendering service is unavailable', {
        status: error.status,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    const failure = safeFailure(error);
    return new Response(failure.message, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
