import { automationServices } from '@/app/dashboard/automations/service';
import { privateHeaders } from '@/lib/whatsapp-cloud';
import { DomainError, safeFailure } from '@business-os/shared';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ruleSchema = z
  .object({
    id: z.string().uuid().optional(),
    version: z.number().int().min(0).default(0),
    connectionId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    triggerType: z.enum(['any_message', 'keyword']),
    keyword: z.string().trim().max(80).default(''),
    replyText: z.string().trim().min(1).max(1000),
    status: z.enum(['active', 'paused']).default('paused'),
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.triggerType === 'keyword' && !rule.keyword)
      context.addIssue({
        code: 'custom',
        path: ['keyword'],
        message: 'Enter a keyword for this trigger.',
      });
  });

export async function POST(request: Request) {
  try {
    const input = ruleSchema.safeParse(await request.json().catch(() => null));
    if (!input.success)
      return Response.json(
        { message: 'Review the automation name, trigger and reply text.' },
        { status: 400, headers: privateHeaders },
      );
    const services = await automationServices('automation.manage');
    const result = await services.client.rpc('whatsapp_automation_save', {
      p_organization_id: services.context.organizationId,
      ...(input.data.id ? { p_id: input.data.id } : {}),
      p_version: input.data.version,
      p_input: {
        connection_id: input.data.connectionId,
        name: input.data.name,
        trigger_type: input.data.triggerType,
        keyword: input.data.keyword,
        reply_text: input.data.replyText,
        status: input.data.status,
      },
    });
    if (result.error) throw new DomainError('VALIDATION_FAILED');
    return Response.json(result.data, { headers: privateHeaders });
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
