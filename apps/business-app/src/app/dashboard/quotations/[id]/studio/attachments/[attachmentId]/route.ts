import { z } from 'zod';
import {
  QUOTATION_PDF_BUCKET,
  MAX_QUOTATION_PDF_BYTES,
  quotationAttachmentContext,
} from '../../../../quotation-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const { id, attachmentId } = await params;
    const parsedAttachmentId = z.uuid().parse(attachmentId);
    const ctx = await quotationAttachmentContext(id);
    const { data: meta, error } = await ctx.admin
      .from('quotation_studio_attachments')
      .select('filename,storage_path,byte_size')
      .eq('organization_id', ctx.organizationId)
      .eq('revision_id', ctx.revisionId)
      .eq('id', parsedAttachmentId)
      .maybeSingle();
    if (error || !meta)
      return new Response('PDF unavailable', { status: 404 });
    const { data: blob, error: storageError } = await ctx.admin.storage
      .from(QUOTATION_PDF_BUCKET)
      .download(meta.storage_path);
    if (storageError || !blob || blob.size > MAX_QUOTATION_PDF_BYTES)
      return new Response('PDF unavailable', { status: 404 });
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.toString('ascii', 0, 5) !== '%PDF-')
      return new Response('Invalid PDF', { status: 415 });
    const filename = meta.filename.replace(/[^A-Za-z0-9.() _-]/g, '_').slice(0, 120);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('PDF unavailable', { status: 403 });
  }
}
