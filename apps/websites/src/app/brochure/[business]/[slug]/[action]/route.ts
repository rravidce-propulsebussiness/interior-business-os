import {
  createPublicDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ business: string; slug: string; action: string }> },
) {
  try {
    const { business, slug, action } = await params;
    if (action !== 'pdf' || !isSupabaseConfigured())
      return new Response('Not found', { status: 404, headers });
    const r = await createPublicDatabase().rpc('brochure_public', {
      p_business: business,
      p_slug: slug,
      p_action: 'pdf',
    });
    if (
      r.error ||
      !r.data ||
      typeof r.data !== 'object' ||
      Array.isArray(r.data)
    )
      return new Response('Brochure PDF unavailable', { status: 404, headers });
    return new Response(
      new Uint8Array(Buffer.from(String(r.data.data), 'base64')),
      {
        headers: {
          ...headers,
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="brochure.pdf"',
        },
      },
    );
  } catch {
    return new Response('Brochure PDF unavailable', { status: 503, headers });
  }
}
export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ business: string; slug: string; action: string }> },
) {
  try {
    const { business, slug, action } = await params;
    if (!isSupabaseConfigured() || !['enquiry', 'metrics'].includes(action))
      return Response.json(
        { message: 'Unavailable' },
        { status: 404, headers },
      );
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return Response.json(
        { message: 'Unavailable' },
        { status: 403, headers },
      );
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 14000) {
        await reader.cancel();
        return Response.json(
          { message: 'Request too large' },
          { status: 413, headers },
        );
      }
      chunks.push(r.value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('Invalid body');
    const client = createPublicDatabase();
    if (action === 'metrics') {
      if (!('kind' in body) || !['view', 'cta'].includes(String(body.kind)))
        throw new Error('Invalid metric');
      const metric = await client.rpc('brochure_public', {
        p_business: business,
        p_slug: slug,
        p_action: String(body.kind),
      });
      if (metric.error)
        return Response.json(
          { message: 'Analytics unavailable' },
          { status: 503, headers },
        );
      return Response.json({ accepted: true }, { headers });
    }
    if (
      !('page' in body) ||
      typeof body.page !== 'string' ||
      !('values' in body) ||
      !body.values ||
      typeof body.values !== 'object' ||
      Array.isArray(body.values)
    )
      throw new Error('Invalid fields');
    const r = await client.rpc('brochure_submit_lead', {
      p_business: business,
      p_slug: slug,
      p_page: body.page,
      p_values: JSON.parse(JSON.stringify(body.values)),
      p_honeypot: 'honeypot' in body ? String(body.honeypot) : '',
    });
    if (r.error) throw new Error('Unavailable form');
    return Response.json(r.data, { headers });
  } catch {
    return Response.json(
      {
        message:
          'Unable to send enquiry. Check your details or try again later.',
      },
      { status: 400, headers },
    );
  }
}
