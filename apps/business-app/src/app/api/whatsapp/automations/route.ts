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
    triggerType: z.enum(['any_message', 'keyword', 'greeting', 'away', 'menu']),
    keyword: z.string().trim().max(80).default(''),
    replyText: z.string().trim().min(1).max(1000),
    status: z.enum(['active', 'paused']).default('paused'),
    schedule: z
      .object({
        timezone: z.string().max(60).default('Asia/Kolkata'),
        days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      })
      .strict()
      .optional(),
    menu: z
      .array(
        z
          .object({
            key: z.string().regex(/^[0-9]{1,2}$/),
            title: z.string().trim().min(1).max(24),
            reply: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(10)
      .optional(),
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.triggerType === 'keyword' && !rule.keyword)
      context.addIssue({
        code: 'custom',
        path: ['keyword'],
        message: 'Enter a keyword for this trigger.',
      });
    if (rule.triggerType === 'away' && !rule.schedule)
      context.addIssue({
        code: 'custom',
        path: ['schedule'],
        message: 'Set business hours for the away message.',
      });
    if (rule.triggerType === 'menu') {
      const keys = (rule.menu ?? []).map((option) => option.key);
      if (!keys.length || new Set(keys).size !== keys.length)
        context.addIssue({
          code: 'custom',
          path: ['menu'],
          message: 'Add menu options with different numbers.',
        });
    }
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
      p_id: input.data.id ?? (null as unknown as string),
      p_version: input.data.version,
      p_input: {
        connection_id: input.data.connectionId,
        name: input.data.name,
        trigger_type: input.data.triggerType,
        keyword: input.data.keyword,
        reply_text: input.data.replyText,
        status: input.data.status,
        schedule:
          input.data.triggerType === 'away' ? (input.data.schedule ?? {}) : {},
        menu: input.data.triggerType === 'menu' ? (input.data.menu ?? []) : [],
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
