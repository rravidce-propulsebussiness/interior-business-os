import { appendQuotationAnnexures } from '@business-os/shared/pdf';
import {
  QUOTATION_PDF_BUCKET,
  quotationAttachmentContext,
} from '../../quotation-storage';
import { quotationDocument } from '../../document';
import { renderQuotationPdf } from '../../pdf';
import { DomainError, safeFailure } from '@business-os/shared';
import { PdfServiceError } from '@business-os/shared/pdf';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let stage = 'document';
  try {
    const { id } = await params;
    const { html, document } = await quotationDocument(id);
    stage = 'render';
    const base = await renderQuotationPdf(html, document);
    stage = 'annexures';

    // Basic PDF generation must not depend on optional privileged storage
    // credentials. The private annexure upload facility cannot operate without
    // these credentials either. When configured, all saved annexures remain
    // mandatory and any missing attachment fails explicitly (never silently).
    const additional: Uint8Array[] = [];
    const privilegedStorageConfigured = Boolean(
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (privilegedStorageConfigured) {
      const ctx = await quotationAttachmentContext(id);
      const { data: attachments, error: filesError } = await ctx.admin
        .from('quotation_studio_attachments')
        .select('storage_path,byte_size')
        .eq('organization_id', ctx.organizationId)
        .eq('revision_id', ctx.revisionId)
        .order('created_at')
        .order('id');
      if (filesError) throw new Error('Quotation annexures unavailable');
      for (const file of attachments ?? []) {
        const { data, error } = await ctx.admin.storage
          .from(QUOTATION_PDF_BUCKET)
          .download(file.storage_path);
        if (error || !data || data.size > 15 * 1024 * 1024)
          throw new Error('Quotation attachment unavailable');
        additional.push(new Uint8Array(await data.arrayBuffer()));
      }
    }
    stage = 'merge';
    const bytes = await appendQuotationAnnexures(base, additional);
    stage = 'response';
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'X-Quotation-PDF-Template': 'premium-html-v1',
        'Content-Disposition': `${new URL(request.url).searchParams.get('view') === '1' ? 'inline' : 'attachment'}; filename="${document.number.replaceAll(/[^A-Za-z0-9-]/g, '_')}-R${document.revision}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const denied = error instanceof DomainError &&
      (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND');
    const requestId = crypto.randomUUID();
    // Log only failure stage and allowlisted error code. Never log customer
    // content, private PDF bytes, Supabase secrets or share-token values.
    console.error('quotation.pdf.failed', {
      requestId,
      stage,
      code: denied ? error.code :
        error instanceof PdfServiceError ? error.code : 'PDF_INTERNAL_ERROR',
    });
    // 403 is reserved for actual authentication/authorization failures.
    // Unexpected server PDF failures are 500, with sanitized error text.
    // Never leak quotation details or storage credentials in responses.
    const failure = safeFailure(error);
    return new Response(
      denied ? failure.message :
        error instanceof PdfServiceError
          ? 'Premium quotation PDF renderer unavailable. Install Chromium or configure Cloudflare Browser Rendering. Reference ' + requestId.slice(0, 8) + '.'
          : 'Quotation PDF unavailable (' + stage + '). Reference ' + requestId.slice(0, 8) + '.',
      {
        status: denied ? 403 : error instanceof PdfServiceError ? error.status : 500,
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Quotation-PDF-Stage': stage,
          'X-Quotation-PDF-Request': requestId,
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }
}
