import { createHash } from 'node:crypto';
import { safeFailure } from '@business-os/shared';
import { prepareMarketingImage } from '@business-os/shared/media';
import { websiteServices, signWebsite } from '../../../service';
import { isAllowedWebsiteUploadOrigin } from '../../../upload-origin';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isAllowedWebsiteUploadOrigin(request))
      return Response.json({ message: 'Unavailable upload' }, { status: 403 });
    const s = await websiteServices('website.media.manage');
    await s.website.read(id);
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json({ message: 'File required' }, { status: 400 });
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.byteLength;
      if (size > 11000000) {
        await reader.cancel();
        return Response.json(
          { message: 'Maximum upload size is 10 MB' },
          { status: 413 },
        );
      }
      chunks.push(r.value);
    }
    const body = Buffer.concat(chunks);
    const form = await new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
      body,
    }).formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size > 10485760)
      throw new Error('Choose a file up to 10 MB');
    let data = Buffer.from(await file.arrayBuffer()),
      mime = 'image/webp',
      width: number | null = null,
      height: number | null = null;
    if (data.subarray(0, 5).toString() === '%PDF-') {
      mime = 'application/pdf';
      if (!data.subarray(-2048).includes(Buffer.from('%%EOF')))
        throw new Error('Invalid PDF');
    } else if (data.subarray(4, 8).toString() === 'ftyp') {
      mime = 'video/mp4';
      if (
        !['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(
          data.subarray(8, 12).toString(),
        )
      )
        throw new Error('Unsupported video container');
    } else {
      const result = await prepareMarketingImage(data);
      data = result.data;
      mime = result.mime;
      width = result.width;
      height = result.height;
    }
    const proof = signWebsite({
      purpose: 'website.asset',
      organizationId: s.context.organizationId,
      websiteId: id,
      name: file.name.replace(/[^\w. ()-]/g, '_').slice(0, 200),
      mime,
      width,
      height,
      alt: String(form.get('alt') ?? '').slice(0, 500),
      digest: createHash('sha256').update(data).digest('hex'),
    });
    const r = await s.client.rpc('website_asset_save', {
      p_organization_id: s.context.organizationId,
      p_website_id: id,
      p_proof: proof.body,
      p_signature: proof.signature,
      p_data: data.toString('base64'),
    });
    if (r.error) {
      // Database-side upload validation uses the same signing proof as publish.
      // Return a useful actionable category without exposing proof material.
      const reason = r.error.message;
      if (reason === 'Invalid or expired build proof')
        return Response.json({
          code:'WEBSITE_BUILD_SIGNATURE_MISMATCH',
          message:'Image upload is blocked by an app/database signing-key mismatch. An administrator must align the Hostinger website signing key with Supabase. No image was saved.',
        },{status:503,headers:{'Cache-Control':'no-store'}});
      if (reason === 'Media storage limit reached')
        return Response.json({
          code:'WEBSITE_MEDIA_QUOTA',
          message:'Your website storage allowance is full. Remove unused media or increase the storage limit.',
        },{status:413,headers:{'Cache-Control':'no-store'}});
      console.error('website.media.save.failed', {
        code: r.error.code ?? 'unknown', category: 'database_rejected',
      });
      return Response.json({
        code:'WEBSITE_MEDIA_REJECTED',
        message:'The media service rejected this upload. Check website media permissions, storage limits, and server signing configuration.',
      },{status:400,headers:{'Cache-Control':'no-store'}});
    }
    return Response.json(
      { id: r.data, width, height, alt: String(form.get('alt') ?? '').slice(0, 500), message: 'Media uploaded' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const failure = safeFailure(e);
    const validation = e instanceof Error ? e.message : '';
    const known = [
      'Choose a file up to 10 MB', 'Invalid PDF',
      'Unsupported video container', 'Website signing is not configured',
    ];
    const message = known.includes(validation) ? validation :
      'Upload could not be processed. Use a JPEG, PNG, WebP or AVIF image under 10 MB. If this persists, contact the administrator with the reference ID.';
    console.error('website.media.upload.failed', {
      requestId: failure.requestId,
      category: validation === 'Website signing is not configured'
        ? 'website_signing_not_configured' : 'image_processing_or_upload',
    });
    return Response.json({message, requestId:failure.requestId}, {
      status: validation === 'Website signing is not configured' ? 503 : 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
