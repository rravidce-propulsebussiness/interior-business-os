import { publicHeaders, publicResponse } from '../../service';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    if (
      request.headers.get('origin') !== new URL(request.url).origin ||
      !request.headers
        .get('content-type')
        ?.startsWith('application/x-www-form-urlencoded')
    )
      return new Response('Invalid request.', {
        status: 403,
        headers: publicHeaders,
      });
    const reader = request.body?.getReader();
    if (!reader)
      return new Response('Invalid request.', {
        status: 400,
        headers: publicHeaders,
      });
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16000) {
        await reader.cancel();
        return new Response('Request too large.', {
          status: 413,
          headers: publicHeaders,
        });
      }
      chunks.push(value);
    }
    const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const input = {
      ...Object.fromEntries(form),
      acknowledged: form.get('acknowledged') === 'true',
    };
    const { token } = await params;
    await publicResponse(token, input);
    return new Response(null, {
      status: 303,
      headers: { ...publicHeaders, Location: '/q/' + token },
    });
  } catch {
    return new Response(
      'Unable to record this response. The quotation may have changed, expired, or already received a response. Return to the quotation and review its current state.',
      { status: 409, headers: publicHeaders },
    );
  }
}
