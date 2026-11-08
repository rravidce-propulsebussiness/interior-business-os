import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import type { Json } from '@business-os/database';
import {
  getConnection,
  graphRequest,
  privateHeaders,
  validSameOrigin,
  whatsappContext,
} from '@/lib/whatsapp-cloud';
import { whatsappFailure } from '@/lib/whatsapp-meta-error';
import {
  canStartWhatsAppCall,
  metaCallActionAllowed,
  type MetaCallPermission,
} from '@/lib/whatsapp-calling-permission';

export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();
const waIdSchema = z.string().regex(/^[1-9][0-9]{7,14}$/);
const callIdSchema = z
  .string()
  .min(5)
  .max(256)
  .regex(/^[A-Za-z0-9._:-]+$/);
const sdpSchema = z.string().min(40).max(150000);

const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('enable'), connectionId: uuid }),
  z.object({
    action: z.literal('request_permission'),
    connectionId: uuid,
    waId: waIdSchema,
  }),
  z.object({
    action: z.literal('connect'),
    connectionId: uuid,
    waId: waIdSchema,
    sdp: sdpSchema,
  }),
  z.object({
    action: z.literal('accept'),
    connectionId: uuid,
    callId: callIdSchema,
    sdp: sdpSchema,
  }),
  z.object({
    action: z.literal('reject'),
    connectionId: uuid,
    callId: callIdSchema,
  }),
  z.object({
    action: z.literal('terminate'),
    connectionId: uuid,
    callId: callIdSchema,
  }),
]);

type CallEvent = {
  id: string;
  event: string;
  direction: string;
  from: string;
  to: string;
  session?: { sdp_type?: string; sdp?: string } | undefined;
  timestamp: number;
};

function eventForConnection(
  payload: unknown,
  phoneNumberId: string,
  connectionId: string,
): CallEvent[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;
  if (data.kind === 'outbound_call') {
    if (data.connection_id !== connectionId) return [];
    const id = String(data.call_id ?? '');
    return id
      ? [
          {
            id,
            event: 'dialing',
            direction: 'BUSINESS_INITIATED',
            from: '',
            to: String(data.to ?? ''),
            timestamp: Number(data.timestamp ?? 0),
          },
        ]
      : [];
  }
  const change = data.change as Record<string, unknown> | undefined;
  const value = change?.value as Record<string, unknown> | undefined;
  const metadata = value?.metadata as Record<string, unknown> | undefined;
  if (String(metadata?.phone_number_id ?? '') !== phoneNumberId) return [];
  if (!Array.isArray(value?.calls)) return [];
  return value.calls.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const call = item as Record<string, unknown>;
    const id = String(call.id ?? '');
    if (!id || id.length > 256) return [];
    const event = String(call.event ?? call.status ?? '').toLowerCase();
    const session = call.session as Record<string, unknown> | undefined;
    return [
      {
        id,
        event,
        direction: String(call.direction ?? ''),
        from: String(call.from ?? ''),
        to: String(call.to ?? ''),
        session:
          typeof session?.sdp === 'string' && session.sdp.length <= 150000
            ? { sdp_type: String(session.sdp_type ?? ''), sdp: session.sdp }
            : undefined,
        timestamp: Number(call.timestamp ?? 0),
      },
    ];
  });
}

async function recentCallEvents(
  organizationId: string,
  connection: { id: string; waba_id: string; phone_number_id: string },
  minutes: number,
) {
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data, error } = await createOwnerProvisioningDatabase()
    .from('whatsapp_webhook_events')
    .select('payload,received_at')
    .eq('organization_id', organizationId)
    .eq('waba_id', connection.waba_id)
    .gte('received_at', cutoff)
    .order('received_at', { ascending: false })
    .limit(300);
  if (error) throw new Error('WHATSAPP_CALL_EVENT_READ_FAILED');
  return (data ?? []).flatMap((row) =>
    eventForConnection(row.payload, connection.phone_number_id, connection.id),
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = uuid.safeParse(url.searchParams.get('connectionId'));
    if (!parsed.success)
      return Response.json(
        { message: 'Select a WhatsApp number.' },
        { status: 400, headers: privateHeaders },
      );
    const { organizationId } = await whatsappContext();
    const connection = await getConnection(organizationId, parsed.data);
    const action = url.searchParams.get('action') ?? 'settings';
    if (action === 'events') {
      // Only a recent window is returned; ICE/SDP must never be cached in a browser/CDN.
      const events = await recentCallEvents(organizationId, connection, 3);
      return Response.json(
        { events: events.slice(0, 50) },
        { headers: privateHeaders },
      );
    }
    if (action === 'permissions') {
      const user = waIdSchema.safeParse(url.searchParams.get('waId'));
      if (!user.success)
        return Response.json(
          { message: 'Select a valid WhatsApp contact.' },
          { status: 400, headers: privateHeaders },
        );
      const result = await graphRequest<MetaCallPermission>(
        `${connection.phone_number_id}/call_permissions?user_wa_id=${encodeURIComponent(user.data)}`,
        connection.accessToken,
      );
      return Response.json(
        {
          permission: {
            permission: result.permission ?? null,
            actions: (result.actions ?? []).map((action) => ({
              action_name: action.action_name,
              can_perform_action: action.can_perform_action === true,
            })),
          },
        },
        { headers: privateHeaders },
      );
    }
    if (action !== 'settings')
      return Response.json(
        { message: 'Unknown calling operation.' },
        { status: 400, headers: privateHeaders },
      );
    const result = await graphRequest<{ calling?: Record<string, unknown> }>(
      `${connection.phone_number_id}/settings?fields=calling`,
      connection.accessToken,
    );
    const calling = result.calling ?? null;
    return Response.json(
      {
        calling: calling
          ? {
              status: calling.status ?? 'UNKNOWN',
              call_icon_visibility: calling.call_icon_visibility ?? 'UNKNOWN',
              callback_permission_status:
                calling.callback_permission_status ?? 'UNKNOWN',
            }
          : null,
      },
      { headers: privateHeaders },
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
    if (Number(request.headers.get('content-length') ?? 0) > 165000)
      return Response.json(
        { message: 'Call request is too large.' },
        { status: 413, headers: privateHeaders },
      );
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return Response.json(
        { message: 'Invalid WhatsApp calling request.' },
        { status: 400, headers: privateHeaders },
      );
    const data = parsed.data as {
      action:
        | 'enable'
        | 'request_permission'
        | 'connect'
        | 'accept'
        | 'reject'
        | 'terminate';
      connectionId: string;
      waId?: string;
      sdp?: string;
      callId?: string;
    };
    const { organizationId, client } = await whatsappContext();
    const connection = await getConnection(organizationId, data.connectionId);

    if (data.action === 'enable') {
      // Explicit administrator operation: never enable the public call button silently.
      await graphRequest(
        `${connection.phone_number_id}/settings`,
        connection.accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            calling: { status: 'ENABLED', call_icon_visibility: 'DEFAULT' },
          }),
        },
      );
      return Response.json({ success: true }, { headers: privateHeaders });
    }

    if (data.action === 'request_permission' || data.action === 'connect') {
      const { data: contact, error: contactError } =
        await createOwnerProvisioningDatabase()
          .from('whatsapp_contacts')
          .select('opted_out_at')
          .eq('organization_id', organizationId)
          .eq('connection_id', connection.id)
          .eq('wa_id', data.waId!)
          .maybeSingle();
      if (contactError)
        throw new Error('WHATSAPP_CONTACT_PERMISSION_CHECK_FAILED');
      if (contact?.opted_out_at) {
        return Response.json(
          {
            message:
              'This contact opted out. Do not request calls or start new calls until the customer opts back in.',
          },
          { status: 409, headers: privateHeaders },
        );
      }
    }

    if (data.action === 'request_permission') {
      const allowed = await client.rpc('whatsapp_window_open', {
        p_organization_id: organizationId,
        p_connection_id: connection.id,
        p_wa_id: data.waId!,
      });
      if (allowed.error || !allowed.data) {
        return Response.json(
          {
            message:
              'A customer message within the last 24 hours is required to send a call permission request.',
          },
          { status: 409, headers: privateHeaders },
        );
      }
      const permission = await graphRequest<MetaCallPermission>(
        `${connection.phone_number_id}/call_permissions?user_wa_id=${encodeURIComponent(data.waId!)}`,
        connection.accessToken,
      );
      if (!metaCallActionAllowed(permission, 'send_call_permission_request')) {
        return Response.json(
          {
            message:
              'Meta does not currently permit another call permission request for this customer.',
          },
          { status: 409, headers: privateHeaders },
        );
      }
      const result = await graphRequest<{ messages?: Array<{ id?: string }> }>(
        `${connection.phone_number_id}/messages`,
        connection.accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: data.waId,
            type: 'interactive',
            interactive: {
              type: 'call_permission_request',
              action: { name: 'call_permission_request' },
              body: {
                text: 'May our team call you on WhatsApp to discuss your enquiry?',
              },
            },
          }),
        },
      );
      return Response.json(
        { success: true, messageId: result.messages?.[0]?.id ?? null },
        { headers: privateHeaders },
      );
    }

    if (data.action === 'connect') {
      const permission = await graphRequest<MetaCallPermission>(
        `${connection.phone_number_id}/call_permissions?user_wa_id=${encodeURIComponent(data.waId!)}`,
        connection.accessToken,
      );
      // Permission is "temporary" or "permanent"; Meta's action limits
      // are top-level, not nested under permission.
      if (!canStartWhatsAppCall(permission)) {
        return Response.json(
          {
            message: 'Customer call permission has not been confirmed by Meta.',
          },
          { status: 409, headers: privateHeaders },
        );
      }
      const result = await graphRequest<{ calls?: Array<{ id?: string }> }>(
        `${connection.phone_number_id}/calls`,
        connection.accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: data.waId,
            action: 'connect',
            session: { sdp_type: 'offer', sdp: data.sdp },
          }),
        },
      );
      const callId = result.calls?.[0]?.id;
      if (!callId) throw new Error('WHATSAPP_CALL_ID_MISSING');
      const payload = {
        kind: 'outbound_call',
        connection_id: connection.id,
        call_id: callId,
        to: data.waId,
        timestamp: Math.floor(Date.now() / 1000),
      };
      const saved = await createOwnerProvisioningDatabase()
        .from('whatsapp_webhook_events')
        .upsert(
          {
            organization_id: organizationId,
            waba_id: connection.waba_id,
            idempotency_key: createHash('sha256')
              .update(JSON.stringify({ organizationId, payload }))
              .digest('hex'),
            payload: payload as Json,
          },
          { onConflict: 'idempotency_key', ignoreDuplicates: true },
        );
      if (saved.error) {
        // A call was already placed at Meta. Compensate immediately if we
        // cannot associate it with this tenant for secure future hang-up.
        try {
          await graphRequest(
            `${connection.phone_number_id}/calls`,
            connection.accessToken,
            {
              method: 'POST',
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                action: 'terminate',
                call_id: callId,
              }),
            },
          );
        } catch {
          // The next call webhook still permits recovery once received.
        }
        throw new Error('WHATSAPP_CALL_TRACKING_FAILED');
      }
      return Response.json(
        { success: true, callId },
        { headers: privateHeaders },
      );
    }

    const events = await recentCallEvents(organizationId, connection, 120);
    const matching = events.find((event) => event.id === data.callId);
    if (!matching)
      return Response.json(
        {
          message:
            'This call is not associated with the selected business number.',
        },
        { status: 404, headers: privateHeaders },
      );
    if (
      (data.action === 'accept' || data.action === 'reject') &&
      (matching.direction !== 'USER_INITIATED' ||
        matching.event !== 'connect' ||
        Date.now() - matching.timestamp * 1000 > 90_000)
    ) {
      return Response.json(
        { message: 'This incoming call can no longer be answered.' },
        { status: 409, headers: privateHeaders },
      );
    }
    await graphRequest(
      `${connection.phone_number_id}/calls`,
      connection.accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          action: data.action,
          call_id: data.callId,
          ...(data.action === 'accept'
            ? { session: { sdp_type: 'answer', sdp: data.sdp } }
            : {}),
        }),
      },
    );
    return Response.json({ success: true }, { headers: privateHeaders });
  } catch (error) {
    const failure = whatsappFailure(error);
    return Response.json(failure.body, {
      status: failure.status,
      headers: privateHeaders,
    });
  }
}
