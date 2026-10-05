import { prepareMarketingImage } from '@business-os/shared/media';
import { brochureServices, signBrochure, digest } from '../../service';
import { brochureResult } from '@business-os/database/brochure';
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return Response.json({ message: 'Upload unavailable' }, { status: 403 });
    const s = await brochureServices('brochure.media.manage');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.byteLength;
      if (size > 11000000) {
        await reader.cancel();
        return Response.json(
          { message: 'Choose an image up to 10 MB' },
          { status: 413 },
        );
      }
      chunks.push(r.value);
    }
    const form = await new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
      body: Buffer.concat(chunks),
    }).formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Missing image');
    const image = await prepareMarketingImage(
      Buffer.from(await file.arrayBuffer()),
      true,
    );
    const proof = signBrochure({
      purpose: 'brochure.asset',
      organizationId: s.context.organizationId,
      name: file.name.replace(/[^\w. ()-]/g, '_').slice(0, 200),
      alt: String(form.get('alt') ?? '').slice(0, 500),
      mime: image.mime,
      width: image.width,
      height: image.height,
      digest: digest(image.data),
    });
    brochureResult(
      await s.client.rpc('brochure_media', {
        p_organization_id: s.context.organizationId,
        p_action: 'upload',
        p_proof: proof.body,
        p_signature: proof.signature,
        p_data: image.data.toString('base64'),
      }),
    );
    return Response.json(
      { message: 'Image uploaded' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        message:
          'Upload unavailable. Check image format, size, permissions and storage limit.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
