import { z } from 'zod';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import {
  getConnection,
  graphRequest,
  privateHeaders,
  validSameOrigin,
  whatsappContext,
} from '@/lib/whatsapp-cloud';
import { whatsappFailure } from '@/lib/whatsapp-meta-error';

export const dynamic = 'force-dynamic';

const receiptSchema = z
  .object({
    connectionId: z.string().uuid(),
    waId: z.string().regex(/^[0-9]{5,32}$/),
    typing: z.boolean().default(false),
  })
  .strict();

/**
 * WhatsApp-style receipts: marks the customer's latest message as read (blue
 * ticks on their phone) and, when `typing` is true, shows "typing…" to them
 * for up to 25 seconds or until the next reply is sent.
 */
export async function POST(request: Request) {
  try {
    if (!validSameOrigin(request))
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers: privateHeaders },
      );
    const parsed = receiptSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return Response.json(
        { message: 'Choose a valid conversation.' },
        { status: 400, headers: privateHeaders },
      );
    const { organizationId } = await whatsappContext();
    const connection = await getConnection(
      organizationId,
      parsed.data.connectionId,
    );
    const database = createOwnerProvisioningDatabase();
    const contact = await database
      .from('whatsapp_contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('connection_id', connection.id)
      .eq('wa_id', parsed.data.waId)
      .maybeSingle();
    if (contact.error || !contact.data)
      return Response.json(
        { sent: false },
        { status: 200, headers: privateHeaders },
      );
    const latest = await database
      .from('whatsapp_messages')
      .select('provider_message_id,occurred_at')
      .eq('organization_id', organizationId)
      .eq('connection_id', connection.id)
      .eq('contact_id', contact.data.id)
      .eq('direction', 'inbound')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const messageId = latest.data?.provider_message_id;
    // Meta accepts receipts only for messages from the last 30 days.
    const recent =
      latest.data &&
      Date.now() - new Date(latest.data.occurred_at).valueOf() <
        30 * 24 * 60 * 60 * 1000;
    if (!messageId || !recent)
      return Response.json(
        { sent: false },
        { status: 200, headers: privateHeaders },
      );
    await graphRequest(
      `${connection.phone_number_id}/messages`,
      connection.accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
          ...(parsed.data.typing ? { typing_indicator: { type: 'text' } } : {}),
        }),
      },
    );
    return Response.json(
      { sent: true },
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
