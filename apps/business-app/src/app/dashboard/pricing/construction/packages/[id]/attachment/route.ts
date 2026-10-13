import { randomUUID } from 'node:crypto';
import { validateQuotationAnnexure } from '@business-os/shared/pdf';
import {
  packageAttachmentContext,
  ensureQuotationPdfBucket,
  QUOTATION_PDF_BUCKET,
  MAX_QUOTATION_PDF_BYTES,
} from '../../../package-attachment-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };
const fail = (message: string, status: number) =>
  Response.json(
    { message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
const sameOrigin = (request: Request) =>
  request.headers.get('origin') === new URL(request.url).origin;

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await packageAttachmentContext(id);
    const { data, error } = await ctx.admin
      .from('construction_package_spec_attachments')
      .select('id,filename,byte_size,created_at,storage_path')
      .eq('organization_id', ctx.orgId)
      .eq('package_id', ctx.packageId)
      .maybeSingle();
    if (error) return fail('Package PDF unavailable', 503);
    if (!data) return Response.json({ attachment: null });
    if (new URL(request.url).searchParams.get('download') === '1') {
      const { data: file, error: storageError } = await ctx.admin.storage
        .from(QUOTATION_PDF_BUCKET)
        .download(data.storage_path);
      if (storageError || !file) return fail('PDF is unavailable', 503);
      return new Response(new Uint8Array(await file.arrayBuffer()), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition':
            'inline; filename="Package-Specifications.pdf"',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    return Response.json(
      {
        attachment: {
          id: data.id,
          filename: data.filename,
          byte_size: data.byte_size,
          created_at: data.created_at,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return fail('You cannot access this package', 403);
  }
}

export async function POST(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail('Invalid upload origin', 403);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data'))
    return fail('A PDF upload is required', 415);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_QUOTATION_PDF_BYTES + 10000)
    return fail('Maximum PDF size is 15 MB', 413);
  try {
    const { id } = await params;
    const ctx = await packageAttachmentContext(id, true);
    const reader = request.body?.getReader();
    if (!reader) return fail('Choose a PDF', 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_QUOTATION_PDF_BYTES + 10000) {
        await reader.cancel();
        return fail('Maximum PDF size is 15 MB', 413);
      }
      chunks.push(part.value);
    }
    const multipart = await new Request(request.url, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') ?? '',
      },
      body: Buffer.concat(chunks),
    }).formData();
    const upload = multipart.get('file');
    if (!(upload instanceof File)) return fail('Choose a PDF', 400);
    const filename = upload.name
      .replace(/[^A-Za-z0-9.() _-]/g, '_')
      .slice(0, 120);
    if (
      upload.type !== 'application/pdf' ||
      !/\.pdf$/i.test(filename) ||
      upload.size < 10 ||
      upload.size > MAX_QUOTATION_PDF_BYTES
    )
      return fail('Only PDF documents up to 15 MB are supported', 415);
    const bytes = Buffer.from(await upload.arrayBuffer());
    try {
      await validateQuotationAnnexure(bytes);
    } catch {
      return fail('PDF is invalid, encrypted, or longer than 60 pages', 415);
    }
    await ensureQuotationPdfBucket(ctx.admin);
    const path = [
      ctx.orgId,
      'packages',
      ctx.packageId,
      randomUUID() + '.pdf',
    ].join('/');
    const { error: storageError } = await ctx.admin.storage
      .from(QUOTATION_PDF_BUCKET)
      .upload(path, bytes, {
        contentType: 'application/pdf',
        upsert: false,
        cacheControl: '0',
      });
    if (storageError) return fail('Cannot save PDF to private storage', 503);
    const { data: previous, error: existingError } = await ctx.admin
      .from('construction_package_spec_attachments')
      .select('storage_path')
      .eq('organization_id', ctx.orgId)
      .eq('package_id', ctx.packageId)
      .maybeSingle();
    if (existingError) {
      await ctx.admin.storage.from(QUOTATION_PDF_BUCKET).remove([path]);
      return fail('Cannot replace the prior PDF', 503);
    }
    const { error: rowError } = await ctx.admin
      .from('construction_package_spec_attachments')
      .upsert(
        {
          organization_id: ctx.orgId,
          package_id: ctx.packageId,
          storage_path: path,
          filename,
          byte_size: bytes.byteLength,
          created_by: ctx.userId,
        },
        { onConflict: 'organization_id,package_id' },
      );
    if (rowError) {
      await ctx.admin.storage.from(QUOTATION_PDF_BUCKET).remove([path]);
      return fail('Cannot save package PDF metadata', 503);
    }
    if (previous?.storage_path)
      await ctx.admin.storage
        .from(QUOTATION_PDF_BUCKET)
        .remove([previous.storage_path])
        .catch(() => undefined);
    return Response.json({ message: 'Package specification PDF attached.' });
  } catch {
    return fail('Could not upload package PDF', 403);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail('Invalid request origin', 403);
  try {
    const { id } = await params;
    const ctx = await packageAttachmentContext(id, true);
    const { data, error } = await ctx.admin
      .from('construction_package_spec_attachments')
      .select('id,storage_path')
      .eq('organization_id', ctx.orgId)
      .eq('package_id', ctx.packageId)
      .maybeSingle();
    if (error || !data) return fail('Package PDF not found', 404);
    const { error: deleted } = await ctx.admin
      .from('construction_package_spec_attachments')
      .delete()
      .eq('id', data.id)
      .eq('organization_id', ctx.orgId)
      .eq('package_id', ctx.packageId);
    if (deleted) return fail('Cannot remove package PDF', 503);
    await ctx.admin.storage
      .from(QUOTATION_PDF_BUCKET)
      .remove([data.storage_path])
      .catch(() => undefined);
    return Response.json({ message: 'Package PDF removed.' });
  } catch {
    return fail('You cannot remove this PDF', 403);
  }
}
