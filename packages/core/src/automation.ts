import { z } from 'zod';

export const automationEvents = [
  'lead.created',
  'lead.stage_changed',
  'lead.assigned',
  'lead.followup_due',
  'lead.inactive',
  'quotation.created',
  'quotation.sent',
  'quotation.accepted',
  'quotation.rejected',
  'quotation.expired',
  'contract.accepted',
  'invoice.created',
  'invoice.due',
  'invoice.overdue',
  'payment.received',
  'po.created',
  'po.issued',
  'po.overdue',
  'receipt.created',
  'material.shortage',
  'inventory.changed',
  'task.created',
  'task.assigned',
  'task.started',
  'task.blocked',
  'task.overdue',
  'task.completed',
  'milestone.approaching',
  'milestone.overdue',
  'milestone.completed',
  'inspection.created',
  'inspection.failed',
  'inspection.passed',
  'snag.created',
  'snag.assigned',
  'snag.overdue',
  'snag.reopened',
  'snag.review',
  'snag.closed',
  'handover.ready',
  'handover.completed',
  'project.completed',
  'change_order.awaiting_action',
] as const;
export const categories = [
  'crm',
  'quotation',
  'billing',
  'payment',
  'procurement',
  'inventory',
  'execution',
  'inspection',
  'snag',
  'handover',
  'system',
] as const;
export const priorities = ['info', 'normal', 'important', 'urgent'] as const;
export const conditionFields = [
  'status',
  'amount',
  'days_since_event',
  'days_until_due',
  'project_status',
  'lead_source',
  'lead_stage',
  'priority',
  'shortage',
] as const;
export const conditionSchema = z
  .object({
    field: z.enum(conditionFields),
    operator: z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte']),
    value: z.union([z.string().max(120), z.boolean()]),
  })
  .strict();
export const actionKinds = [
  'notify',
  'reminder',
  'followup',
  'task',
  'assign_task',
  'email',
  'activity',
  'escalation',
  'start_task',
] as const;
export const actionSchema = z
  .object({
    kind: z.enum(actionKinds),
    recipient: z
      .enum(['assignee', 'manager', 'actor', 'user'])
      .default('assignee'),
    userId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(160),
    priority: z.enum(priorities).default('normal'),
    delayMinutes: z.number().int().min(0).max(525600).default(0),
    dueBasis: z.enum(['event', 'due_before', 'due_after']).default('event'),
    template: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,59}$/)
      .default('operational_notice'),
    audience: z.enum(['internal', 'customer']).default('internal'),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.recipient === 'user' && !a.userId)
      ctx.addIssue({
        code: 'custom',
        message: 'Choose a recipient',
        path: ['userId'],
      });
    if (a.audience === 'customer' && a.kind !== 'email')
      ctx.addIssue({
        code: 'custom',
        message: 'Customer communication uses approved email only',
      });
  });
export const ruleSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().max(1000).default(''),
    event: z.enum(automationEvents),
    mode: z
      .enum(['event', 'delayed', 'scheduled', 'condition'])
      .default('event'),
    status: z
      .enum(['active', 'paused', 'disabled', 'archived'])
      .default('paused'),
    conditions: z.array(conditionSchema).max(10).default([]),
    actions: z.array(actionSchema).min(1).max(5),
    cooldownMinutes: z.number().int().min(1).max(525600).default(1440),
    maxPerEntity: z.number().int().min(1).max(20).default(3),
    dailyLimit: z.number().int().min(1).max(1000).default(100),
    scheduleHour: z.number().int().min(0).max(23).default(9),
  })
  .strict();
export type AutomationRule = z.infer<typeof ruleSchema>;
export const preferenceSchema = z
  .object({
    inApp: z.boolean().default(true),
    email: z.boolean().default(false),
    categories: z
      .array(z.enum(categories))
      .max(categories.length)
      .default([...categories]),
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      })
      .default('UTC'),
    quietStart: z.number().int().min(0).max(23).nullable().default(null),
    quietEnd: z.number().int().min(0).max(23).nullable().default(null),
  })
  .strict();
export const reportKinds = [
  'crm',
  'sales',
  'billing',
  'receivables',
  'projects',
  'procurement',
  'inventory',
  'execution',
  'snags',
  'handover',
  'cost',
  'subcontractors',
] as const;
export const reportFilterSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    projectId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    assigneeId: z.string().uuid().optional(),
    industryId: z.string().uuid().optional(),
    location: z.string().max(200).optional(),
    status: z.string().max(60).optional(),
    page: z.number().int().min(1).max(10000).default(1),
    agingBuckets: z
      .array(z.number().int().min(1).max(3650))
      .min(1)
      .max(6)
      .refine(
        (values) =>
          values.every((value, index) => value > (values[index - 1] ?? 0)),
        'Aging buckets must increase',
      )
      .optional(),
  })
  .strict()
  .refine((f) => f.from <= f.to, 'Date range is reversed');

const variables = [
  'business_name',
  'entity_number',
  'project_name',
  'due_date',
  'amount_due',
  'currency',
  'action_url',
] as const;
export const emailTemplateSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),
    subject: z.string().min(1).max(180),
    body: z.string().min(1).max(5000),
  })
  .strict()
  .superRefine((t, ctx) => {
    for (const value of [t.subject, t.body]) {
      for (const match of value.matchAll(/\{\{([^{}]+)\}\}/g))
        if (!variables.includes(match[1] as (typeof variables)[number]))
          ctx.addIssue({
            code: 'custom',
            message: 'Unsupported template variable',
          });
      if (value.replace(/\{\{[^{}]+\}\}/g, '').includes('{{'))
        ctx.addIssue({
          code: 'custom',
          message: 'Malformed template variable',
        });
    }
  });
export function renderEmail(
  template: unknown,
  values: Partial<Record<(typeof variables)[number], string>>,
) {
  const t = emailTemplateSchema.parse(template);
  const render = (s: string) =>
    s.replace(
      /\{\{([^{}]+)\}\}/g,
      (_, key: string) => values[key as (typeof variables)[number]] ?? '',
    );
  return {
    subject: render(t.subject).replace(/[\r\n]/g, ' '),
    text: render(t.body),
  };
}
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function reportCsv(columns: string[], rows: Record<string, unknown>[]) {
  return (
    '\uFEFF' +
    [
      columns.map(csvCell).join(','),
      ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')),
    ].join('\r\n')
  );
}
