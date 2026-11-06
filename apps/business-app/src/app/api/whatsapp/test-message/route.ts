import { z } from 'zod';
import { DomainError, safeFailure } from '@business-os/shared';
import { serverServices } from '@business-os/auth/server';
import { logMetaError, metaApiErrorFrom, metaErrorMessage } from '@/lib/whatsapp-meta-error';

export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'private, no-store' };
const bodySchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{7,14}$/),
  confirmTestRecipient: z.literal(true),
}).strict();

function approvedRecipients() {
  return new Set(
    (process.env.WHATSAPP_TEST_RECIPIENTS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^\+[1-9]\d{7,14}$/.test(value)),
  );
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin)
      return Response.json({ message: 'Request origin was not accepted.' }, { status: 403, headers: privateHeaders });
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 2048)
      return Response.json({ message: 'Request is too large.' }, { status: 413, headers: privateHeaders });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return Response.json({ message: 'Enter a valid test recipient and confirm it is approved in Meta.' }, { status: 400, headers: privateHeaders });

    const { authorization } = await serverServices();
    await authorization.requirePlatformRole('platform_super_admin');

    const phoneNumberId = process.env.WHATSAPP_TEST_PHONE_NUMBER_ID ?? '';
    const accessToken = process.env.WHATSAPP_TEST_ACCESS_TOKEN ?? '';
    const version = process.env.META_GRAPH_API_VERSION ?? '';
    if (!/^\d{5,32}$/.test(phoneNumberId) || accessToken.length < 20 || !/^v\d+\.0$/.test(version) || !approvedRecipients().size)
      return Response.json({ message: 'Meta test sender settings are incomplete on the server.' }, { status: 503, headers: privateHeaders });
    if (!approvedRecipients().has(parsed.data.to))
      return Response.json({ message: 'This number is not on the server allowlist for Meta test recipients.' }, { status: 403, headers: privateHeaders });

    const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: parsed.data.to.slice(1),
        type: 'template',
        template: { name: 'hello_world', language: { code: 'en_US' } },
      }),
    });
    const result = await response.json().catch(() => null) as { messages?: Array<{ id?: string }> } | null;
    const messageId = result?.messages?.[0]?.id;
    if (!response.ok || !messageId) {
      const metaError = metaApiErrorFrom(response.status, result);
      logMetaError(metaError);
      return Response.json(
        {
          message: metaError.code === null
            ? 'Meta did not accept the test message. Check the token, test sender, and Meta recipient list.'
            : metaErrorMessage(metaError.code),
          ...(metaError.code === null ? {} : { metaCode: metaError.code }),
        },
        { status: 502, headers: privateHeaders },
      );
    }
    return Response.json({ sent: true, messageId, template: 'hello_world', environment: 'meta_test' }, { status: 202, headers: privateHeaders });
  } catch (error) {
    const failure = safeFailure(error);
    return Response.json(failure, {
      status: error instanceof DomainError
        ? error.code === 'UNAUTHENTICATED' ? 401 : 403
        : 502,
      headers: privateHeaders,
    });
  }
}
