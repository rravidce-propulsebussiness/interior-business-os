import { z } from 'zod';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { automationServices } from '@/app/dashboard/automations/service';
import { privateHeaders, validSameOrigin } from '@/lib/whatsapp-cloud';
import { DomainError, safeFailure } from '@business-os/shared';

export const dynamic = 'force-dynamic';

const inputSchema = z
  .object({
    connectionId: z.string().uuid(),
    consentSource: z.string().trim().min(3).max(200),
    labelName: z.string().trim().min(1).max(40),
    rows: z
      .array(
        z
          .object({
            phone: z.string().regex(/^[1-9]\d{7,14}$/),
            name: z.string().max(120).default(''),
          })
          .strict(),
      )
      .min(1)
      .max(2000),
  })
  .strict();

/**
 * Import broadcast recipients from a sheet: records each contact's WhatsApp
 * opt-in (with the stated source) and tags them with a label. Numbers that
 * previously opted out are never re-subscribed.
 */
export async function POST(request: Request) {
  try {
    if (!validSameOrigin(request))
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers: privateHeaders },
      );
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success)
      return Response.json(
        {
          message:
            'Check the sheet (up to 2000 valid numbers), the label name and where consent was collected.',
        },
        { status: 400, headers: privateHeaders },
      );
    const services = await automationServices('automation.manage');
    const organizationId = services.context.organizationId;
    const database = createOwnerProvisioningDatabase();
    const { connectionId, consentSource, labelName, rows } = input.data;

    const existingLabel = await database
      .from('whatsapp_labels')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('name', labelName)
      .maybeSingle();
    let labelId = existingLabel.data?.id ?? '';
    if (!labelId) {
      const created = await database
        .from('whatsapp_labels')
        .insert({ organization_id: organizationId, name: labelName })
        .select('id')
        .single();
      if (created.error || !created.data) throw new Error('LABEL_CREATE_FAILED');
      labelId = created.data.id;
    }

    const optedOut = new Set<string>();
    for (let i = 0; i < rows.length; i += 500) {
      const existing = await database
        .from('whatsapp_contacts')
        .select('wa_id,opted_out_at')
        .eq('organization_id', organizationId)
        .eq('connection_id', connectionId)
        .in(
          'wa_id',
          rows.slice(i, i + 500).map((row) => row.phone),
        );
      for (const row of existing.data ?? [])
        if (row.opted_out_at) optedOut.add(row.wa_id);
    }

    let imported = 0;
    let failed = 0;
    for (const row of rows) {
      if (optedOut.has(row.phone)) continue;
      const saved = await services.client.rpc('whatsapp_contact_create', {
        p_organization_id: organizationId,
        p_connection_id: connectionId,
        p_wa_id: row.phone,
        p_display_name: row.name,
        p_consent_source: consentSource,
      });
      if (saved.error || !saved.data) {
        failed += 1;
        continue;
      }
      await database.from('whatsapp_contact_labels').upsert(
        {
          organization_id: organizationId,
          contact_id: saved.data,
          label_id: labelId,
        },
        { onConflict: 'contact_id,label_id', ignoreDuplicates: true },
      );
      imported += 1;
    }
    return Response.json(
      { imported, skippedOptedOut: optedOut.size, failed, labelId },
      { headers: privateHeaders },
    );
  } catch (error) {
    const failure = safeFailure(error);
    return Response.json(failure, {
      status:
        error instanceof DomainError
          ? error.code === 'UNAUTHENTICATED'
            ? 401
            : 403
          : 500,
      headers: privateHeaders,
    });
  }
}
