import { brochureServices, prepareBrochure, publishedPdf } from '../../service';
import { brochureHtml } from '@business-os/brochure-builder/render';
import { resolveSnapshot } from '@business-os/brochure-builder';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  try {
    const { id, format } = await params;
    if (!['pdf', 'preview'].includes(format))
      return new Response('Not found', { status: 404 });
    const s = await brochureServices(
      format === 'pdf' ? 'brochure.export' : 'brochure.view',
    );
    const versionId =
      new URL(request.url).searchParams.get('version') ?? undefined;
    const b = await s.brochure.read(id, versionId);
    const headers = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (format === 'preview') {
      const context = versionId ? null : await s.brochure.list();
      const document = context
        ? resolveSnapshot(
            b.document,
            context.kit,
            String(context.business.name),
          )
        : b.document;
      return new Response(
        brochureHtml(document, {
          assetUrl: (aid) =>
            `/dashboard/brochures/${id}/assets/${aid}${versionId ? '?version=' + encodeURIComponent(versionId) : ''}`,
          print: true,
          watermark: versionId ? '' : 'Draft',
          businessName: b.businessName,
        }),
        {
          headers: {
            ...headers,
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy':
              "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
          },
        },
      );
    }
    const pdf = versionId
      ? Buffer.from(
          String((await publishedPdf(s, id, versionId)).data),
          'base64',
        )
      : (await prepareBrochure(s, b.document, 'Draft')).pdf;
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...headers,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="brochure${versionId ? '-published' : '-draft'}.pdf"`,
      },
    });
  } catch {
    return Response.json(
      {
        message:
          'Brochure document unavailable. Check access and print layout.',
      },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
