import { validateQuotationAnnexure } from '@business-os/shared/pdf';
import { randomUUID } from 'node:crypto';
import {
  MAX_QUOTATION_PDF_BYTES,
  QUOTATION_PDF_BUCKET,
  ensureQuotationPdfBucket,
  quotationAttachmentContext,
} from '../../../quotation-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };
const fail = (message: string, status: number) =>
  Response.json(
    { message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );

function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const context = await quotationAttachmentContext(id);
    const { data, error } = await context.admin
      .from('quotation_studio_attachments')
      .select('id,filename,byte_size,created_at')
      .eq('organization_id', context.organizationId)
      .eq('revision_id', context.revisionId)
      .order('created_at')
      .order('id');
    if (error) return fail('Could not load quotation PDFs', 503);
    return Response.json(
      { attachments: data ?? [] },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return fail('Quotation files unavailable', 403);
  }
}

export async function POST(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail('Upload unavailable', 403);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data'))
    return fail('Expected a PDF upload', 415);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_QUOTATION_PDF_BYTES + 10000)
    return fail('PDF must be 15 MB or smaller', 413);

  try {
    const { id } = await params;
    const ctx = await quotationAttachmentContext(id, true);
    const { data: existing, error: countError } = await ctx.admin
      .from('quotation_studio_attachments')
      .select('id,byte_size')
      .eq('organization_id', ctx.organizationId)
      .eq('revision_id', ctx.revisionId);
    if (countError) return fail('Could not check quotation file limit', 503);
    if ((existing?.length ?? 0) >= 6)
      return fail('Only six PDFs per quotation', 400);

    // Refuse unbounded multipart uploads even if content-length was absent.
    const reader = request.body?.getReader();
    if (!reader) return fail('Choose a PDF file', 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_QUOTATION_PDF_BYTES + 10000) {
        await reader.cancel();
        return fail('PDF must be 15 MB or smaller', 413);
      }
      chunks.push(part.value);
    }
    const form = await new Request(request.url, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') ?? '',
      },
      body: Buffer.concat(chunks),
    }).formData();
    const upload = form.get('file');
    if (!(upload instanceof File)) return fail('Choose a PDF file', 400);
    const filename = upload.name
      .replace(/[^A-Za-z0-9.() _-]/g, '_')
      .slice(0, 120);
    if (
      upload.type !== 'application/pdf' ||
      !/\.pdf$/i.test(filename) ||
      upload.size < 10 ||
      upload.size > MAX_QUOTATION_PDF_BYTES
    )
      return fail('Only genuine PDF files up to 15 MB are supported', 415);
    const bytes = Buffer.from(await upload.arrayBuffer());
    if (
      (existing ?? []).reduce(
        (sum, file) => sum + file.byte_size,
        bytes.length,
      ) >
      30 * 1024 * 1024
    )
      return fail('Combined PDF annexures cannot exceed 30 MB', 413);
    try {
      await validateQuotationAnnexure(bytes);
    } catch {
      return fail(
        'PDF file is invalid, encrypted, or longer than 60 pages',
        415,
      );
    }

    await ensureQuotationPdfBucket(ctx.admin);
    const path = [
      ctx.organizationId,
      ctx.revisionId,
      randomUUID() + '.pdf',
    ].join('/');
    const { error: uploadError } = await ctx.admin.storage
      .from(QUOTATION_PDF_BUCKET)
      .upload(path, bytes, {
        contentType: 'application/pdf',
        upsert: false,
        cacheControl: '0',
      });
    if (uploadError)
      return fail('Could not upload PDF to private storage', 503);
    const { error: dbError } = await ctx.admin
      .from('quotation_studio_attachments')
      .insert({
        organization_id: ctx.organizationId,
        revision_id: ctx.revisionId,
        storage_path: path,
        filename,
        byte_size: bytes.length,
        created_by: ctx.userId,
      });
    if (dbError) {
      await ctx.admin.storage.from(QUOTATION_PDF_BUCKET).remove([path]);
      return fail('Unable to save PDF attachment record', 503);
    }
    return Response.json(
      { message: 'PDF attached to quotation.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return fail(
      'Could not attach PDF. Check permissions and storage settings.',
      403,
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail('Removal unavailable', 403);
  try {
    const { id } = await params;
    const ctx = await quotationAttachmentContext(id, true);
    const raw: unknown = await request.json();
    const attachmentId =
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      'id' in raw &&
      typeof raw.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(raw.id)
        ? raw.id
        : null;
    if (!attachmentId) return fail('Invalid PDF attachment', 400);
    const { data: attachment, error: selectError } = await ctx.admin
      .from('quotation_studio_attachments')
      .select('id,storage_path')
      .eq('organization_id', ctx.organizationId)
      .eq('revision_id', ctx.revisionId)
      .eq('id', attachmentId)
      .maybeSingle();
    if (selectError || !attachment) return fail('PDF not found', 404);
    const { error: dbError } = await ctx.admin
      .from('quotation_studio_attachments')
      .delete()
      .eq('organization_id', ctx.organizationId)
      .eq('revision_id', ctx.revisionId)
      .eq('id', attachment.id);
    if (dbError) return fail('Could not remove PDF', 503);
    await ctx.admin.storage
      .from(QUOTATION_PDF_BUCKET)
      .remove([attachment.storage_path])
      .catch(() => undefined);
    return Response.json({ message: 'PDF removed from quotation.' });
  } catch {
    return fail('Removal unavailable', 403);
  }
}
