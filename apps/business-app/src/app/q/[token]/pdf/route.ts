import { renderQuotationDocument } from '@business-os/core/quotation-document';
import { PdfServiceError, appendQuotationAnnexures } from '@business-os/shared/pdf';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { z } from 'zod';
import { QUOTATION_PDF_BUCKET } from '../../../dashboard/quotations/quotation-storage';
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
    const base = await renderQuotationPdf(renderQuotationDocument(q.document));
    // publicQuotation validates token, expiry, revocation and PDF permission.
    // Revalidate server-side before retrieving private company annexures.
    const admin = createOwnerProvisioningDatabase();
    const { data, error } = await admin.rpc('quotation_share_pdf_attachments', {
      p_token: token,
    });
    if (error) throw new Error('Public PDF annexures unavailable');
    const attachments = z
      .array(
        z
          .object({
            storage_path: z.string().min(15).max(260),
            byte_size: z.number().int().positive().max(15 * 1024 * 1024),
          })
          .strict(),
      )
      .max(6)
      .parse(data);
    const extra: Uint8Array[] = [];
    for (const attachment of attachments) {
      const { data: file, error: storageError } = await admin.storage
        .from(QUOTATION_PDF_BUCKET).download(attachment.storage_path);
      if (storageError || !file || file.size !== attachment.byte_size)
        throw new Error('Quotation attachment unavailable');
      extra.push(new Uint8Array(await file.arrayBuffer()));
    }
    const bytes = await appendQuotationAnnexures(base, extra);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...publicHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="quotation.pdf"',
      },
    });
  } catch (error) {
    if (error instanceof PdfServiceError)
      return new Response('PDF rendering service is unavailable', {
        status: error.status,
        headers: { ...publicHeaders, 'Cache-Control': 'no-store' },
      });
    return unavailable();
  }
}
