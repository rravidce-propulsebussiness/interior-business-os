import { automationServices } from '@/app/dashboard/automations/service';
import { privateHeaders } from '@/lib/whatsapp-cloud';
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
      p_connection_id: connectionId,
      p_wa_id: waId,
      p_search: search,
      p_page: page,
    });
    if (result.error) throw new DomainError('FORBIDDEN');
    return Response.json(result.data ?? {}, { headers: privateHeaders });
  } catch (error) {
    const failure = safeFailure(error);
    return Response.json(failure, {
      status:
        error instanceof DomainError
          ? error.code === 'UNAUTHENTICATED'
            ? 401
            : 403
          : 400,
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

export async function POST(request: Request) {
  try {
    const input = actionSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success)
      return Response.json(
        { message: 'Choose a valid contact action.' },
        { status: 400, headers: privateHeaders },
      );
    const services = await automationServices('automation.manage');
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
          : 400,
      headers: privateHeaders,
    });
  }
}
