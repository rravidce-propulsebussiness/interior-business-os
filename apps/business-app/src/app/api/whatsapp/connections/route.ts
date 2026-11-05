import { z } from 'zod';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { DomainError, safeFailure } from '@business-os/shared';
import {
  privateHeaders,
  validSameOrigin,
  whatsappContext,
} from '@/lib/whatsapp-cloud';

export const dynamic = 'force-dynamic';

const disconnectSchema = z
  .object({ connectionId: z.string().uuid() })
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
