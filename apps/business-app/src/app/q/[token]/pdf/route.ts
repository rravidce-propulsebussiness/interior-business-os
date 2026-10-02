import { renderQuotationDocument } from '@business-os/core/quotation-document';
import { publicHeaders, publicQuotation, unavailable } from '../../service';
import { renderQuotationPdf } from '../../../dashboard/quotations/pdf';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params,
      q = await publicQuotation(token, 'pdf');
    const bytes = await renderQuotationPdf(renderQuotationDocument(q.document));
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...publicHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="quotation.pdf"',
      },
    });
  } catch {
    return unavailable();
  }
}
