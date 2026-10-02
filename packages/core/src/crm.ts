import { z } from 'zod';
import { addressSchema } from './commercial';
const text = z.string().trim().max(10000);
const id = z.uuid();
const nullableId = id.nullable();
const name = z.string().trim().min(1).max(200);
const identity = {
  id: id.optional(),
  version: z.number().int().positive().optional(),
};
const configuration = {
  ...identity,
  name,
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  active: z.boolean(),
  sort_order: z.number().int().min(0).max(10000),
};
export const crmSchemas = {
  lead_sources: z.object(configuration).strict(),
  crm_pipeline_stages: z
    .object({ ...configuration, outcome: z.enum(['open', 'won', 'lost']) })
    .strict(),
  crm_lost_reasons: z.object(configuration).strict(),
  crm_requirement_fields: z
    .object({
      ...configuration,
      industry_id: nullableId,
      field_type: z.enum(['text', 'number', 'select', 'boolean']),
      options: z.array(z.string().max(200)).max(100),
      required: z.boolean(),
    })
    .strict(),
  leads: z
    .object({
      ...identity,
      name,
      phone: z
        .string()
        .trim()
        .min(3)
        .max(50)
        .regex(/^(?:\+|00)?[0-9() .-]+$/),
      company_name: z.string().max(200).default(''),
      secondary_phone: z.string().max(50).default(''),
      email: z.union([z.email().max(254), z.literal('')]).default(''),
      source_id: id,
      stage_id: id.optional(),
      assigned_to: nullableId.optional(),
      source_detail: z.string().max(500).default(''),
      branch_id: nullableId.default(null),
      industry_id: nullableId.default(null),
      service_type: z.string().max(200).default(''),
      location: z.string().max(500).default(''),
      site_address: addressSchema,
      budget_min: z
        .string()
        .regex(/^\d{1,16}(\.\d{1,2})?$/)
        .nullable(),
      budget_max: z
        .string()
        .regex(/^\d{1,16}(\.\d{1,2})?$/)
        .nullable(),
      expected_start_date: z.iso.date().nullable(),
      project_size: z.string().max(200).default(''),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      notes: text.default(''),
      requirements: z
        .record(
          z.string().max(64),
          z.union([z.string().max(2000), z.number().finite(), z.boolean()]),
        )
        .default({}),
    })
    .strict(),
  lead_activities: z
    .object({
      lead_id: id,
      activity_type: z.enum([
        'note',
        'phone_call',
        'meeting',
        'email_note',
        'whatsapp_note',
      ]),
      subject: z.string().max(200).default(''),
      body: text.min(1),
      occurred_at: z.iso.datetime({ offset: true }).optional(),
    })
    .strict(),
  lead_followups: z
    .object({
      lead_id: id,
      assigned_to: id,
      due_at: z.iso.datetime({ offset: true }),
      followup_type: z.enum(['call', 'meeting', 'quotation', 'other']),
      note: z.string().max(3000),
    })
    .strict(),
  site_visits: z
    .object({
      lead_id: id,
      assigned_to: id,
      scheduled_at: z.iso.datetime({ offset: true }),
      site_address: addressSchema,
      contact_person: z.string().max(200),
      notes: text,
    })
    .strict(),
};
export type CrmEntity = keyof typeof crmSchemas;
export const crmCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('assign'),
      id,
      version: z.number().int().positive(),
      assigned_to: nullableId,
    })
    .strict(),
  z
    .object({
      action: z.literal('stage'),
      id,
      version: z.number().int().positive(),
      stage_id: id,
      lost_reason_id: nullableId,
      note: z.string().max(3000),
    })
    .strict(),
  z
    .object({
      action: z.literal('archive'),
      id,
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal('followup'),
      id,
      version: z.number().int().positive(),
      status: z.enum(['completed', 'cancelled']),
      outcome: z.string().max(3000),
    })
    .strict(),
  z
    .object({
      action: z.literal('visit'),
      id,
      version: z.number().int().positive(),
      status: z.enum(['completed', 'cancelled', 'rescheduled']),
      scheduled_at: z.iso.datetime({ offset: true }).nullable(),
      notes: text,
      outcome: text,
    })
    .strict(),
]);
export const conversionSchema = z
  .object({
    id,
    version: z.number().int().positive(),
    customer_id: nullableId,
    project_id: nullableId,
    project_name: name,
    acknowledge_duplicate: z.boolean(),
  })
  .strict();
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  return trimmed.startsWith('+')
    ? '+' + digits
    : trimmed.startsWith('00')
      ? '+' + digits.slice(2)
      : digits;
}
export function followupQueue(
  dueAt: string,
  now: Date,
  timezone: string,
): 'overdue' | 'today' | 'upcoming' {
  const due = new Date(dueAt);
  if (due < now) return 'overdue';
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return date.format(due) === date.format(now) ? 'today' : 'upcoming';
}
