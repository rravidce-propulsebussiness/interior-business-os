import { prepareMarketingImage } from '@business-os/shared/media';
import { createHash } from 'node:crypto';
import { safeFailure } from '@business-os/shared';
import { websiteServices, signWebsite } from '../../service';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (request.headers.get('origin') !== new URL(request.url).origin)
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
      const image = await prepareMarketingImage(data);
      data = image.data;
      mime = image.mime;
      width = image.width;
      height = image.height;
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
    if (r.error) throw new Error('Upload denied or storage limit reached');
    return Response.json(
      { id: r.data, message: 'Media uploaded' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const failure = safeFailure(e);
    return Response.json(failure, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
