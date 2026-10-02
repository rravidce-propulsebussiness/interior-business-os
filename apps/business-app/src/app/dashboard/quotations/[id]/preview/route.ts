import { quotationDocument } from '../../document';
import { safeFailure } from '@business-os/shared';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params,
      { html } = await quotationDocument(id);
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const failure = safeFailure(error);
    return new Response(failure.message, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
