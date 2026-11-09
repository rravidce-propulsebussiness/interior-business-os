import { z } from 'zod';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { DomainError, safeFailure } from '@business-os/shared';
import {
  privateHeaders,
  validSameOrigin,
  whatsappContext,
} from '@/lib/whatsapp-cloud';

export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      name: z.string().trim().min(1).max(40),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default('#88352B'),
    })
    .strict(),
  z.object({ action: z.literal('delete'), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('assign'),
      contactId: z.string().uuid(),
      labelId: z.string().uuid(),
      on: z.boolean(),
    })
    .strict(),
]);

function failureResponse(error: unknown) {
  const failure = safeFailure(error);
  return Response.json(failure, {
    status:
      error instanceof DomainError
        ? error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'VALIDATION_FAILED'
            ? 400
            : 403
        : 500,
    headers: privateHeaders,
  });
}

/** Labels for the organization, with each contact's labels for one number. */
export async function GET(request: Request) {
  try {
    const { organizationId } = await whatsappContext('automation.view');
    const connectionId = new URL(request.url).searchParams.get('connectionId');
    const database = createOwnerProvisioningDatabase();
    const labels = await database
      .from('whatsapp_labels')
      .select('id,name,color')
      .eq('organization_id', organizationId)
      .order('name');
    if (labels.error) throw new Error('LABELS_READ_FAILED');
    const assignments: Record<string, string[]> = {};
    const counts: Record<string, number> = {};
    if (connectionId && z.string().uuid().safeParse(connectionId).success) {
      const rows = await database
        .from('whatsapp_contact_labels')
        .select('contact_id,label_id,whatsapp_contacts!inner(connection_id)')
        .eq('organization_id', organizationId)
        .eq('whatsapp_contacts.connection_id', connectionId)
        .limit(10000);
      if (rows.error) throw new Error('LABELS_READ_FAILED');
      for (const row of rows.data ?? []) {
        (assignments[row.contact_id] ??= []).push(row.label_id);
        counts[row.label_id] = (counts[row.label_id] ?? 0) + 1;
      }
    }
    return Response.json(
      { labels: labels.data ?? [], assignments, counts },
      { headers: privateHeaders },
    );
  } catch (error) {
    return failureResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!validSameOrigin(request))
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers: privateHeaders },
      );
    const input = actionSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success)
      return Response.json(
        { message: 'Check the label name (up to 40 characters).' },
        { status: 400, headers: privateHeaders },
      );
    const { organizationId } = await whatsappContext('automation.manage');
    const database = createOwnerProvisioningDatabase();
    const data = input.data;
    if (data.action === 'create') {
      const created = await database
        .from('whatsapp_labels')
        .insert({
          organization_id: organizationId,
          name: data.name,
          color: data.color,
        })
        .select('id,name,color')
        .single();
      if (created.error)
        return Response.json(
          { message: 'A label with this name already exists.' },
          { status: 409, headers: privateHeaders },
        );
      return Response.json(created.data, { headers: privateHeaders });
    }
    if (data.action === 'delete') {
      const removed = await database
        .from('whatsapp_labels')
        .delete()
        .eq('organization_id', organizationId)
        .eq('id', data.id);
      if (removed.error) throw new Error('LABEL_DELETE_FAILED');
      return Response.json({ deleted: true }, { headers: privateHeaders });
    }
    if (data.on) {
      // Composite foreign keys reject a contact or label from another workspace.
      const added = await database.from('whatsapp_contact_labels').upsert(
        {
          organization_id: organizationId,
          contact_id: data.contactId,
          label_id: data.labelId,
        },
        { onConflict: 'contact_id,label_id', ignoreDuplicates: true },
      );
      if (added.error) throw new DomainError('VALIDATION_FAILED');
    } else {
      const removed = await database
        .from('whatsapp_contact_labels')
        .delete()
        .eq('organization_id', organizationId)
        .eq('contact_id', data.contactId)
        .eq('label_id', data.labelId);
      if (removed.error) throw new Error('LABEL_ASSIGN_FAILED');
    }
    return Response.json({ saved: true }, { headers: privateHeaders });
  } catch (error) {
    return failureResponse(error);
  }
}
