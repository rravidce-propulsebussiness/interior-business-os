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

const createTemplateSchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    name: z.string().regex(/^[a-z0-9_]{3,512}$/),
    category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']),
    language: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/),
    body: z.string().min(1).max(1024),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const { organizationId } = await whatsappContext();
    const connectionId =
      new URL(request.url).searchParams.get('connectionId') ?? undefined;
    const connection = await getConnection(organizationId, connectionId);
    const result = await graphRequest<{
      data?: Array<{
        id: string;
        name: string;
        status: string;
        category?: string;
        language: string;
        components?: Array<{ type: string; text?: string }>;
      }>;
    }>(
      `${connection.waba_id}/message_templates?fields=id,name,status,category,language,components&limit=100`,
      connection.accessToken,
    );
    return Response.json(
      { templates: result.data ?? [], connectionId: connection.id },
      { headers: privateHeaders },
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
    const body = createTemplateSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!body.success)
      return Response.json(
        { message: 'Enter a valid WhatsApp template.' },
        { status: 400, headers: privateHeaders },
      );
    const { organizationId } = await whatsappContext();
    const connection = await getConnection(
      organizationId,
      body.data.connectionId,
    );
    const result = await graphRequest<{ id?: string; success?: boolean }>(
      `${connection.waba_id}/message_templates`,
      connection.accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: body.data.name,
          category: body.data.category,
          language: body.data.language,
          components: [{ type: 'BODY', text: body.data.body }],
        }),
      },
    );
    return Response.json(
      { created: true, id: result.id ?? null },
      { status: 201, headers: privateHeaders },
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
