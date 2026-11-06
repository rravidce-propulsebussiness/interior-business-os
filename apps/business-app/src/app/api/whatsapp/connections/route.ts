import { z } from 'zod';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import {
  privateHeaders,
  validSameOrigin,
  whatsappContext,
  getConnection,
  graphRequest,
} from '@/lib/whatsapp-cloud';
import { whatsappFailure } from '@/lib/whatsapp-meta-error';

export const dynamic = 'force-dynamic';

const disconnectSchema = z
  .object({ connectionId: z.string().uuid() })
  .strict();
const registerSchema = z
  .object({ connectionId: z.string().uuid(), pin: z.string().regex(/^\d{6}$/) })
  .strict();

export async function DELETE(request: Request) {
  try {
    if (!validSameOrigin(request))
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers: privateHeaders },
      );

    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 2000)
      return Response.json(
        { message: 'Request is too large.' },
        { status: 413, headers: privateHeaders },
      );

    const parsed = disconnectSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return Response.json(
        { message: 'Select a valid WhatsApp connection.' },
        { status: 400, headers: privateHeaders },
      );

    const { organizationId } = await whatsappContext('automation.manage');
    const database = createOwnerProvisioningDatabase();
    const { data, error } = await database
      .from('whatsapp_business_connections')
      .update({
        status: 'disconnected',
        token_ciphertext: '',
        token_iv: '',
        token_tag: '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.connectionId)
      .eq('organization_id', organizationId)
      .eq('status', 'connected')
      .select('id')
      .maybeSingle();

    if (error) throw new Error('WHATSAPP_DISCONNECT_FAILED');
    if (!data)
      return Response.json(
        { message: 'This WhatsApp connection is no longer connected.' },
        { status: 404, headers: privateHeaders },
      );

    return Response.json(
      { disconnected: true },
      { status: 200, headers: privateHeaders },
    );
  } catch (error) {
    const failure = whatsappFailure(error);
    return Response.json(failure.body, {
      status: failure.status,
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
    if (length > 4096)
      return Response.json(
        { message: 'Request is too large.' },
        { status: 413, headers: privateHeaders },
      );

    const parsed = registerSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return Response.json(
        { message: 'Enter a valid six-digit WhatsApp two-step verification PIN.' },
        { status: 400, headers: privateHeaders },
      );

    const { organizationId } = await whatsappContext('automation.manage');
    const connection = await getConnection(
      organizationId,
      parsed.data.connectionId,
    );
    const result = await graphRequest<{ success?: boolean }>(
      `${connection.phone_number_id}/register`,
      connection.accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          pin: parsed.data.pin,
        }),
      },
    );

    if (!result.success) throw new Error('WHATSAPP_PHONE_REGISTRATION_FAILED');
    return Response.json(
      { registered: true },
      { status: 200, headers: privateHeaders },
    );
  } catch (error) {
    const failure = whatsappFailure(error);
    return Response.json(failure.body, {
      status: failure.status,
      headers: privateHeaders,
    });
  }
}
