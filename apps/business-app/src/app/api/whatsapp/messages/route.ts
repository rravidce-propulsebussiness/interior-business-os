import { z } from 'zod';
import { DomainError, safeFailure } from '@business-os/shared';
import {
  getConnection,
  graphRequest,
  privateHeaders,
  validSameOrigin,
  whatsappContext,
} from '@/lib/whatsapp-cloud';

export const dynamic = 'force-dynamic';

const sendSchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    to: z.string().regex(/^\+[1-9]\d{7,14}$/),
    templateName: z.string().regex(/^[a-z0-9_]{3,512}$/),
    language: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/),
    parameters: z.array(z.string().max(1024)).max(20).default([]),
    recipientHasOptedIn: z.literal(true),
  })
  .strict();

export async function POST(request: Request) {
  try {
    if (!validSameOrigin(request))
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers: privateHeaders },
      );
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 12000)
      return Response.json(
        { message: 'Request is too large.' },
        { status: 413, headers: privateHeaders },
      );
    const parsed = sendSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return Response.json(
        { message: 'Enter a valid recipient and approved template.' },
        { status: 400, headers: privateHeaders },
      );
    const { organizationId } = await whatsappContext();
    const connection = await getConnection(
      organizationId,
      parsed.data.connectionId,
    );
    const templates = await graphRequest<{
      data?: Array<{ name: string; language: string; status: string }>;
    }>(
      `${connection.waba_id}/message_templates?fields=name,language,status&limit=100`,
      connection.accessToken,
    );
    const approved = templates.data?.some(
      (template) =>
        template.name === parsed.data.templateName &&
        template.language === parsed.data.language &&
        template.status === 'APPROVED',
    );
    if (!approved)
      return Response.json(
        { message: 'Only Meta-approved templates can be sent.' },
        { status: 400, headers: privateHeaders },
      );
    const result = await graphRequest<{
      messages?: Array<{ id?: string; message_status?: string }>;
    }>(`${connection.phone_number_id}/messages`, connection.accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: parsed.data.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: parsed.data.templateName,
          language: { code: parsed.data.language },
          ...(parsed.data.parameters.length
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: parsed.data.parameters.map((text) => ({
                      type: 'text',
                      text,
                    })),
                  },
                ],
              }
            : {}),
        },
      }),
    });
    const messageId = result.messages?.[0]?.id;
    if (!messageId) throw new Error('META_MESSAGE_ID_MISSING');
    return Response.json(
      {
        sent: true,
        messageId,
        status: result.messages?.[0]?.message_status ?? 'accepted',
      },
      { status: 202, headers: privateHeaders },
    );
  } catch (error) {
    const failure = safeFailure(error);
    return Response.json(failure, {
      status:
        error instanceof DomainError
          ? error.code === 'UNAUTHENTICATED'
            ? 401
            : error.code === 'NOT_FOUND'
              ? 404
              : 403
          : 502,
      headers: privateHeaders,
    });
  }
}
