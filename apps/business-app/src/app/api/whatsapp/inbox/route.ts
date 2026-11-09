import { automationServices } from '@/app/dashboard/automations/service';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { privateHeaders, validSameOrigin } from '@/lib/whatsapp-cloud';
import { DomainError, safeFailure } from '@business-os/shared';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const section = z
      .enum(['inbox', 'contacts', 'thread', 'automations'])
      .parse(url.searchParams.get('section') ?? 'inbox');
    const connectionId = url.searchParams.get('connectionId');
    const waId = url.searchParams.get('waId');
    const search = (url.searchParams.get('search') ?? '').slice(0, 120);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(url.searchParams.get('page') ?? '1');
    const services = await automationServices('automation.view');
    const result = await services.client.rpc('whatsapp_workspace_read', {
      p_organization_id: services.context.organizationId,
      p_section: section,
      ...(connectionId ? { p_connection_id: connectionId } : {}),
      ...(waId ? { p_wa_id: waId } : {}),
      p_search: search,
      p_page: page,
    });
    if (result.error) {
      if (result.error.code === '42501') throw new DomainError('FORBIDDEN');
      throw new Error('WHATSAPP_WORKSPACE_READ_FAILED');
    }
    if (section === 'automations') {
      // Business hours for away messages live beside the rule row.
      const data = (result.data ?? {}) as {
        rows?: Array<Record<string, unknown>>;
      };
      const ids = (data.rows ?? []).map((row) => String(row.id));
      if (ids.length) {
        const schedules = await createOwnerProvisioningDatabase()
          .from('whatsapp_automation_rules')
          .select('id,schedule')
          .eq('organization_id', services.context.organizationId)
          .in('id', ids);
        const byId = new Map(
          (schedules.data ?? []).map((row) => [row.id, row.schedule]),
        );
        data.rows = (data.rows ?? []).map((row) => ({
          ...row,
          schedule: byId.get(String(row.id)) ?? {},
        }));
      }
      return Response.json(data, { headers: privateHeaders });
    }
    return Response.json(result.data ?? {}, { headers: privateHeaders });
  } catch (error) {
    const failure = safeFailure(error);
    return Response.json(failure, {
      status:
        error instanceof DomainError
          ? error.code === 'UNAUTHENTICATED'
            ? 401
            : error.code === 'VALIDATION_FAILED'
              ? 400
              : 403
          : error instanceof z.ZodError
            ? 400
            : 500,
      headers: privateHeaders,
    });
  }
}

const actionSchema = z
  .object({
    action: z.enum(['read', 'opt_out']),
    connectionId: z.string().uuid(),
    waId: z.string().regex(/^\d{5,32}$/),
  })
  .strict();
const addContactSchema = z
  .object({
    action: z.literal('add_contact'),
    connectionId: z.string().uuid(),
    waId: z.string().regex(/^[1-9]\d{7,14}$/),
    name: z.string().trim().max(120).default(''),
    consentSource: z.string().trim().min(3).max(200),
    confirmOptIn: z.literal(true),
  })
  .strict();

export async function POST(request: Request) {
  try {
    if (!validSameOrigin(request))
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers: privateHeaders },
      );
    const raw = await request.json().catch(() => null);
    const addContact = addContactSchema.safeParse(raw);
    const services = await automationServices('automation.manage');
    if (addContact.success) {
      const result = await services.client.rpc('whatsapp_contact_create', {
        p_organization_id: services.context.organizationId,
        p_connection_id: addContact.data.connectionId,
        p_wa_id: addContact.data.waId,
        p_display_name: addContact.data.name,
        p_consent_source: addContact.data.consentSource,
      });
      if (result.error || !result.data)
        throw new DomainError('VALIDATION_FAILED');
      return Response.json(
        { saved: true, contactId: result.data },
        { status: 201, headers: privateHeaders },
      );
    }
    const input = actionSchema.safeParse(raw);
    if (!input.success)
      return Response.json(
        { message: 'Choose a valid contact action.' },
        { status: 400, headers: privateHeaders },
      );
    const result = await services.client.rpc('whatsapp_contact_state', {
      p_organization_id: services.context.organizationId,
      p_connection_id: input.data.connectionId,
      p_wa_id: input.data.waId,
      p_action: input.data.action,
    });
    if (result.error) throw new DomainError('VALIDATION_FAILED');
    return Response.json({ saved: true }, { headers: privateHeaders });
  } catch (error) {
    const failure = safeFailure(error);
    return Response.json(failure, {
      status:
        error instanceof DomainError
          ? error.code === 'UNAUTHENTICATED'
            ? 401
            : 403
          : error instanceof z.ZodError
            ? 400
            : 500,
      headers: privateHeaders,
    });
  }
}
