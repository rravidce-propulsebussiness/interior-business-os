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
import {
  buttonsSchema,
  contactCardSchema,
  digitsOnly,
  locationSchema,
  richMessagePayload,
} from '@/lib/whatsapp-rich-messages';

export const dynamic = 'force-dynamic';

const mediaSchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    messageType: z.literal('media'),
    to: z.string().regex(/^\+[1-9]\d{7,14}$/),
    mediaId: z.string().regex(/^[A-Za-z0-9._-]{1,200}$/),
    mediaType: z.enum(['image', 'video', 'audio', 'document']),
    caption: z.string().trim().max(1000).default(''),
    filename: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
const templateSchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    messageType: z.literal('template'),
    to: z.string().regex(/^\+[1-9]\d{7,14}$/),
    templateName: z.string().regex(/^[a-z0-9_]{3,512}$/),
    language: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/),
    parameters: z.array(z.string().max(1024)).max(20).default([]),
    recipientHasOptedIn: z.literal(true),
  })
  .strict();
const textSchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    messageType: z.literal('text'),
    to: z.string().regex(/^\+[1-9]\d{7,14}$/),
    body: z.string().trim().min(1).max(4096),
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
    const raw = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (
      raw &&
      ['location', 'contacts', 'buttons'].includes(String(raw.messageType))
    ) {
      // Location pin, contact card or quick question with tap buttons.
      const rich = (
        raw.messageType === 'location'
          ? locationSchema
          : raw.messageType === 'contacts'
            ? contactCardSchema
            : buttonsSchema
      ).safeParse(raw);
      if (!rich.success)
        return Response.json(
          { message: 'Check the details and try again.' },
          { status: 400, headers: privateHeaders },
        );
      const { organizationId, client } = await whatsappContext();
      const connection = await getConnection(
        organizationId,
        rich.data.connectionId,
      );
      const allowed = await client.rpc('whatsapp_window_open', {
        p_organization_id: organizationId,
        p_connection_id: connection.id,
        p_wa_id: digitsOnly(rich.data.to),
      });
      if (allowed.error || !allowed.data)
        return Response.json(
          {
            message:
              'You can send this only within 24 hours of the customer’s last message.',
          },
          { status: 400, headers: privateHeaders },
        );
      const built = richMessagePayload(rich.data);
      const result = await graphRequest<{
        messages?: Array<{ id?: string }>;
      }>(`${connection.phone_number_id}/messages`, connection.accessToken, {
        method: 'POST',
        body: JSON.stringify(built.payload),
      });
      const messageId = result.messages?.[0]?.id;
      if (!messageId) throw new Error('META_MESSAGE_ID_MISSING');
      const logged = await createOwnerProvisioningDatabase().rpc(
        'whatsapp_message_log_outbound',
        {
          p_organization_id: organizationId,
          p_connection_id: connection.id,
          p_to: digitsOnly(rich.data.to),
          p_provider_id: messageId,
          p_body: built.logBody,
          p_type: built.logType,
        },
      );
      return Response.json(
        { sent: true, messageId, logged: !logged.error },
        { status: 202, headers: privateHeaders },
      );
    }
    const parsed = (
      raw?.messageType === 'text'
        ? textSchema
        : raw?.messageType === 'media'
          ? mediaSchema
          : templateSchema
    ).safeParse({ ...raw, messageType: raw?.messageType ?? 'template' });
    if (!parsed.success)
      return Response.json(
        { message: 'Enter a valid recipient and approved template.' },
        { status: 400, headers: privateHeaders },
      );
    const { organizationId, client } = await whatsappContext();
    const connection = await getConnection(
      organizationId,
      parsed.data.connectionId,
    );
    if (parsed.data.messageType === 'text') {
      const allowed = await client.rpc('whatsapp_window_open', {
        p_organization_id: organizationId,
        p_connection_id: connection.id,
        p_wa_id: parsed.data.to.replace(/^\+/, ''),
      });
      if (allowed.error || !allowed.data)
        return Response.json(
          {
            message:
              'Free-form replies are available only within 24 hours of the contact’s latest message.',
          },
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
          type: 'text',
          text: { preview_url: false, body: parsed.data.body },
        }),
      });
      const messageId = result.messages?.[0]?.id;
      if (!messageId) throw new Error('META_MESSAGE_ID_MISSING');
      const logged = await createOwnerProvisioningDatabase().rpc(
        'whatsapp_message_log_outbound',
        {
          p_organization_id: organizationId,
          p_connection_id: connection.id,
          p_to: parsed.data.to.replace(/^\+/, ''),
          p_provider_id: messageId,
          p_body: parsed.data.body,
          p_type: 'text',
        },
      );
      return Response.json(
        { sent: true, messageId, logged: !logged.error },
        { status: 202, headers: privateHeaders },
      );
    }
    if (parsed.data.messageType === 'media') {
      const mediaRequest = parsed.data as z.infer<typeof mediaSchema>;
      const allowed = await client.rpc('whatsapp_window_open', {
        p_organization_id: organizationId,
        p_connection_id: connection.id,
        p_wa_id: mediaRequest.to.replace(/^\+/, ''),
      });
      if (allowed.error || !allowed.data)
        return Response.json(
          {
            message:
              'Attachments can be sent only within 24 hours of the contact’s latest message.',
          },
          { status: 400, headers: privateHeaders },
        );
      if (mediaRequest.mediaType === 'audio' && mediaRequest.caption)
        return Response.json(
          { message: 'Send audio without a caption, or send the text separately.' },
          { status: 400, headers: privateHeaders },
        );
      const attachment = {
        id: mediaRequest.mediaId,
        ...(mediaRequest.caption ? { caption: mediaRequest.caption } : {}),
        ...(mediaRequest.mediaType === 'document'
          ? { filename: mediaRequest.filename ?? 'attachment' }
          : {}),
      };
      const result = await graphRequest<{
        messages?: Array<{ id?: string; message_status?: string }>;
      }>(`${connection.phone_number_id}/messages`, connection.accessToken, {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: mediaRequest.to.replace(/^\+/, ''),
          type: mediaRequest.mediaType,
          [mediaRequest.mediaType]: attachment,
        }),
      });
      const messageId = result.messages?.[0]?.id;
      if (!messageId) throw new Error('META_MESSAGE_ID_MISSING');
      const logged = await createOwnerProvisioningDatabase().rpc(
        'whatsapp_message_log_outbound',
        {
          p_organization_id: organizationId,
          p_connection_id: connection.id,
          p_to: mediaRequest.to.replace(/^\+/, ''),
          p_provider_id: messageId,
          // Documents keep their file name so the chat shows a proper card.
          p_body: `[[WA_MEDIA:${mediaRequest.mediaId}:${mediaRequest.mediaType}]]${
            mediaRequest.caption ||
            (mediaRequest.mediaType === 'document' && mediaRequest.filename)
              ? `\n${mediaRequest.caption || mediaRequest.filename}`
              : ''
          }`,
          p_type: mediaRequest.mediaType,
        },
      );
      return Response.json(
        { sent: true, messageId, logged: !logged.error },
        { status: 202, headers: privateHeaders },
      );
    }
    const templateRequest = parsed.data as z.infer<typeof templateSchema>;
    const optedOut = await client.rpc('whatsapp_contact_opted_out', {
      p_organization_id: organizationId,
      p_connection_id: connection.id,
      p_wa_id: templateRequest.to.replace(/^\+/, ''),
    });
    if (optedOut.error || optedOut.data)
      return Response.json(
        {
          message:
            'This contact has opted out. Send only after they message START to this business number.',
        },
        { status: 400, headers: privateHeaders },
      );
    const templateOptIn = await client.rpc(
      'whatsapp_contact_template_opted_in',
      {
        p_organization_id: organizationId,
        p_connection_id: connection.id,
        p_wa_id: templateRequest.to.replace(/^\+/, ''),
      },
    );
    if (templateOptIn.error || !templateOptIn.data)
      return Response.json(
        {
          message:
            'Add this contact and record their WhatsApp opt-in before sending a template.',
        },
        { status: 400, headers: privateHeaders },
      );
    const templates = await graphRequest<{
      data?: Array<{
        name: string;
        language: string;
        status: string;
        components?: Array<{ type: string; text?: string }>;
      }>;
    }>(
      `${connection.waba_id}/message_templates?fields=name,language,status,components&limit=100`,
      connection.accessToken,
    );
    const approved = templates.data?.some(
      (template) =>
        template.name === templateRequest.templateName &&
        template.language === templateRequest.language &&
        template.status === 'APPROVED',
    );
    if (!approved)
      return Response.json(
        { message: 'Only Meta-approved templates can be sent.' },
        { status: 400, headers: privateHeaders },
      );
    const approvedTemplate = templates.data?.find(
      (template) =>
        template.name === templateRequest.templateName &&
        template.language === templateRequest.language &&
        template.status === 'APPROVED',
    );
    const bodyText = approvedTemplate?.components?.find(
      (component) => component.type === 'BODY',
    )?.text;
    const requiredParameters = bodyText
      ? Math.max(
          0,
          ...[...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((match) =>
            Number(match[1]),
          ),
        )
      : 0;
    if (templateRequest.parameters.length !== requiredParameters)
      return Response.json(
        {
          message: `This template needs ${requiredParameters} value${requiredParameters === 1 ? '' : 's'}, one for each placeholder.`,
        },
        { status: 400, headers: privateHeaders },
      );
    const result = await graphRequest<{
      messages?: Array<{ id?: string; message_status?: string }>;
    }>(`${connection.phone_number_id}/messages`, connection.accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: templateRequest.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: templateRequest.templateName,
          language: { code: templateRequest.language },
          ...(templateRequest.parameters.length
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: templateRequest.parameters.map((text) => ({
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
    const logged = await createOwnerProvisioningDatabase().rpc(
      'whatsapp_message_log_outbound',
      {
        p_organization_id: organizationId,
        p_connection_id: connection.id,
        p_to: templateRequest.to.replace(/^\+/, ''),
        p_provider_id: messageId,
        p_body: `Template · ${templateRequest.templateName}`,
        p_type: 'template',
      },
    );
    return Response.json(
      {
        sent: true,
        messageId,
        logged: !logged.error,
        status: result.messages?.[0]?.message_status ?? 'accepted',
      },
      { status: 202, headers: privateHeaders },
    );
  } catch (error) {
    const failure = whatsappFailure(error);
    return Response.json(failure.body, {
      status: failure.status,
      headers: privateHeaders,
    });
  }
}
