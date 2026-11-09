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
import { templatePlaceholderCount } from '@/lib/whatsapp-template-params';

export const dynamic = 'force-dynamic';

const MAX_RECIPIENTS = 5000;

const createSchema = z
  .object({
    action: z.literal('create'),
    connectionId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    templateName: z.string().regex(/^[a-z0-9_]{1,512}$/),
    language: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/),
    parameters: z.array(z.string().max(1024)).max(20).default([]),
    labelIds: z.array(z.string().uuid()).max(20).default([]),
    contactIds: z.array(z.string().uuid()).max(5000).default([]),
    confirmOptIn: z.literal(true),
  })
  .strict();
const cancelSchema = z
  .object({ action: z.literal('cancel'), broadcastId: z.string().uuid() })
  .strict();

type Audience = {
  matched: number;
  optedOut: number;
  noOptIn: number;
  eligible: Array<{ id: string; wa_id: string; display_name: string }>;
};

/** Contacts on this number, optionally limited to any of the given labels. */
async function audience(
  organizationId: string,
  connectionId: string,
  labelIds: string[],
  pickedContactIds: string[] = [],
): Promise<Audience> {
  const database = createOwnerProvisioningDatabase();
  let contactIds: string[] | null = pickedContactIds.length
    ? [...new Set(pickedContactIds)]
    : null;
  if (!contactIds && labelIds.length) {
    const tagged = await database
      .from('whatsapp_contact_labels')
      .select('contact_id')
      .eq('organization_id', organizationId)
      .in('label_id', labelIds)
      .limit(20000);
    if (tagged.error) throw new Error('AUDIENCE_READ_FAILED');
    contactIds = [...new Set((tagged.data ?? []).map((row) => row.contact_id))];
    if (!contactIds.length)
      return { matched: 0, optedOut: 0, noOptIn: 0, eligible: [] };
  }
  const contacts: Array<{
    id: string;
    wa_id: string;
    display_name: string;
    opted_out_at: string | null;
    template_opted_in_at: string | null;
  }> = [];
  const chunks = contactIds
    ? Array.from({ length: Math.ceil(contactIds.length / 500) }, (_, i) =>
        contactIds!.slice(i * 500, i * 500 + 500),
      )
    : [null];
  for (const chunk of chunks) {
    let query = database
      .from('whatsapp_contacts')
      .select('id,wa_id,display_name,opted_out_at,template_opted_in_at')
      .eq('organization_id', organizationId)
      .eq('connection_id', connectionId)
      .limit(20000);
    if (chunk) query = query.in('id', chunk);
    const result = await query;
    if (result.error) throw new Error('AUDIENCE_READ_FAILED');
    contacts.push(...(result.data ?? []));
  }
  const optedOut = contacts.filter((c) => c.opted_out_at).length;
  const noOptIn = contacts.filter(
    (c) => !c.opted_out_at && !c.template_opted_in_at,
  ).length;
  return {
    matched: contacts.length,
    optedOut,
    noOptIn,
    eligible: contacts
      .filter((c) => !c.opted_out_at && c.template_opted_in_at)
      .map(({ id, wa_id, display_name }) => ({ id, wa_id, display_name })),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const connectionId = z
      .string()
      .uuid()
      .parse(url.searchParams.get('connectionId'));
    const { organizationId } = await whatsappContext('automation.view');
    if (url.searchParams.get('preview') === '1') {
      const ids = (name: string) =>
        (url.searchParams.get(name) ?? '')
          .split(',')
          .filter((id) => z.string().uuid().safeParse(id).success);
      const result = await audience(
        organizationId,
        connectionId,
        ids('labelIds'),
        ids('contactIds'),
      );
      return Response.json(
        {
          matched: result.matched,
          eligible: result.eligible.length,
          optedOut: result.optedOut,
          noOptIn: result.noOptIn,
        },
        { headers: privateHeaders },
      );
    }
    const database = createOwnerProvisioningDatabase();
    const broadcasts = await database
      .from('whatsapp_broadcasts')
      .select(
        'id,name,template_name,language,status,total,skipped,created_at,completed_at',
      )
      .eq('organization_id', organizationId)
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (broadcasts.error) throw new Error('BROADCASTS_READ_FAILED');
    const rows = [];
    for (const broadcast of broadcasts.data ?? []) {
      const recipients = await database
        .from('whatsapp_broadcast_recipients')
        .select('status,provider_message_id')
        .eq('organization_id', organizationId)
        .eq('broadcast_id', broadcast.id)
        .limit(MAX_RECIPIENTS);
      const list = recipients.data ?? [];
      const stats = {
        queued: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        cancelled: 0,
      };
      const providerIds: string[] = [];
      for (const item of list) {
        if (item.status === 'queued' || item.status === 'sending')
          stats.queued += 1;
        else if (item.status === 'failed') stats.failed += 1;
        else if (item.status === 'cancelled') stats.cancelled += 1;
        else if (item.provider_message_id)
          providerIds.push(item.provider_message_id);
      }
      // Delivery and read receipts come from the webhook on the message rows.
      for (let i = 0; i < providerIds.length; i += 500) {
        const statuses = await database
          .from('whatsapp_messages')
          .select('status')
          .eq('organization_id', organizationId)
          .eq('connection_id', connectionId)
          .in('provider_message_id', providerIds.slice(i, i + 500));
        for (const message of statuses.data ?? []) {
          if (message.status === 'read') stats.read += 1;
          else if (message.status === 'delivered') stats.delivered += 1;
          else if (message.status === 'failed') stats.failed += 1;
          else stats.sent += 1;
        }
      }
      rows.push({ ...broadcast, stats });
    }
    return Response.json({ rows }, { headers: privateHeaders });
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
    const raw = (await request.json().catch(() => null)) as {
      action?: string;
    } | null;
    const { organizationId } = await whatsappContext('automation.manage');
    const database = createOwnerProvisioningDatabase();

    if (raw?.action === 'cancel') {
      const input = cancelSchema.parse(raw);
      await database
        .from('whatsapp_broadcasts')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('id', input.broadcastId)
        .eq('status', 'sending');
      await database
        .from('whatsapp_broadcast_recipients')
        .update({ status: 'cancelled' })
        .eq('organization_id', organizationId)
        .eq('broadcast_id', input.broadcastId)
        .eq('status', 'queued');
      return Response.json({ cancelled: true }, { headers: privateHeaders });
    }

    const parsed = createSchema.safeParse(raw);
    if (!parsed.success)
      return Response.json(
        {
          message:
            'Name the broadcast, choose an approved template and confirm recipients opted in.',
        },
        { status: 400, headers: privateHeaders },
      );
    const input = parsed.data;
    const connection = await getConnection(organizationId, input.connectionId);
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
    const template = templates.data?.find(
      (item) =>
        item.name === input.templateName &&
        item.language === input.language &&
        item.status === 'APPROVED',
    );
    if (!template)
      return Response.json(
        { message: 'Only Meta-approved templates can be broadcast.' },
        { status: 400, headers: privateHeaders },
      );
    const needed = templatePlaceholderCount(
      template.components?.find((component) => component.type === 'BODY')
        ?.text,
    );
    if (input.parameters.length !== needed)
      return Response.json(
        {
          message: `This template needs ${needed} value${needed === 1 ? '' : 's'}, one for each placeholder.`,
        },
        { status: 400, headers: privateHeaders },
      );
    const people = await audience(
      organizationId,
      connection.id,
      input.labelIds,
      input.contactIds,
    );
    if (!people.eligible.length)
      return Response.json(
        {
          message:
            'No eligible recipients. Contacts need a recorded WhatsApp opt-in and must not have opted out.',
        },
        { status: 400, headers: privateHeaders },
      );
    if (people.eligible.length > MAX_RECIPIENTS)
      return Response.json(
        {
          message: `A broadcast can reach up to ${MAX_RECIPIENTS} contacts. Narrow the labels.`,
        },
        { status: 400, headers: privateHeaders },
      );
    const created = await database
      .from('whatsapp_broadcasts')
      .insert({
        organization_id: organizationId,
        connection_id: connection.id,
        name: input.name,
        template_name: input.templateName,
        language: input.language,
        parameters: input.parameters,
        label_ids: input.labelIds,
        total: people.eligible.length,
        skipped: people.matched - people.eligible.length,
      })
      .select('id')
      .single();
    if (created.error || !created.data) throw new Error('BROADCAST_CREATE_FAILED');
    for (let i = 0; i < people.eligible.length; i += 500) {
      const batch = people.eligible.slice(i, i + 500).map((contact) => ({
        organization_id: organizationId,
        broadcast_id: created.data.id,
        contact_id: contact.id,
        wa_id: contact.wa_id,
        display_name: contact.display_name,
      }));
      const inserted = await database
        .from('whatsapp_broadcast_recipients')
        .insert(batch);
      if (inserted.error) throw new Error('BROADCAST_RECIPIENTS_FAILED');
    }
    return Response.json(
      {
        id: created.data.id,
        total: people.eligible.length,
        skipped: people.matched - people.eligible.length,
      },
      { status: 201, headers: privateHeaders },
    );
  } catch (error) {
    const failure = whatsappFailure(error);
    return Response.json(failure.body, {
      status: failure.status,
      headers: privateHeaders,
    });
  }
}
