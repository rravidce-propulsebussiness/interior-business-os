import { z } from 'zod';
const money = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/);
const signedMoney = z.string().regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,6})?$/);
const label = z.string().trim().min(1).max(200);
const note = z.string().max(3000);
const identity = {
  id: z.uuid().optional(),
  version: z.number().int().positive().optional(),
};
export const financeEntities = [
  'contracts',
  'payment_schedules',
  'payment_schedule_items',
  'payment_requests',
  'invoices',
  'invoice_items',
  'payments',
  'payment_allocations',
  'receipts',
  'change_orders',
  'change_order_items',
  'organization_billing_settings',
  'payment_methods',
  'tax_codes',
] as const;
export const financeEntitySchema = z.enum(financeEntities);
export type FinanceEntity = z.infer<typeof financeEntitySchema>;
export const financePermissions: Record<FinanceEntity, string> = {
  contracts: 'contract.view',
  payment_schedules: 'payment_schedule.view',
  payment_schedule_items: 'payment_schedule.view',
  payment_requests: 'payment_request.view',
  invoices: 'invoice.view',
  invoice_items: 'invoice.view',
  payments: 'payment.view',
  payment_allocations: 'payment.view',
  receipts: 'receipt.view',
  change_orders: 'change_order.view',
  change_order_items: 'change_order.view',
  organization_billing_settings: 'billing.manage',
  payment_methods: 'payment.view',
  tax_codes: 'invoice.view',
};
export const financeFilterSchema = z
  .object({
    q: z.string().max(100).optional(),
    id: z.uuid().optional(),
    contract_id: z.uuid().optional(),
    customer_id: z.uuid().optional(),
    project_id: z.uuid().optional(),
    branch_id: z.uuid().optional(),
    revision_id: z.uuid().optional(),
    parent_id: z.uuid().optional(),
    status: z.string().max(30).optional(),
    from: z.iso.date().optional(),
    until: z.iso.date().optional(),
  })
  .strict();
export const scheduleInputSchema = z
  .object({
    ...identity,
    label,
    supersedes_id: z.uuid().nullable().optional(),
    items: z
      .array(
        z
          .object({
            label,
            description: note.default(''),
            calculation_type: z.enum(['percentage', 'fixed', 'remaining']),
            value: money,
            due_trigger: z.string().max(300).default(''),
            due_date: z.iso.date().nullable().default(null),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export const invoiceInputSchema = z
  .object({
    ...identity,
    invoice_type: z.enum(['proforma', 'tax_invoice']),
    issue_date: z.iso.date(),
    due_date: z.iso.date().nullable(),
    tax_mode: z.enum(['exclusive', 'inclusive']),
    tax_application: z.enum(['line', 'document']),
    tax_code_id: z.uuid().nullable(),
    place_of_supply: label.or(z.literal('')).default(''),
    billing_state: label.or(z.literal('')).default(''),
    notes: note.default(''),
    terms: z.string().max(10000).optional(),
    items: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(3000),
            quantity: money,
            unit: z.string().min(1).max(80),
            unit_rate: money,
            discount: money.default('0'),
            tax_code_id: z.uuid().nullable(),
            hsn_sac: z.string().max(40).default(''),
            source_type: z.enum([
              'manual',
              'milestone',
              'quotation',
              'change_order',
            ]),
            source_id: z.uuid().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export const allocationSchema = z
  .object({ invoice_id: z.uuid(), amount: money, idempotency_key: z.uuid() })
  .strict();
export const paymentInputSchema = z
  .object({
    idempotency_key: z.uuid(),
    payment_date: z.iso.date(),
    amount: money,
    method_id: z.uuid(),
    external_reference: z.string().max(200).default(''),
    notes: note.default(''),
    allocations: z.array(allocationSchema).max(100).default([]),
  })
  .strict();
export const billingSettingsSchema = z
  .object({
    ...identity,
    legal_name: label,
    billing_address: z.string().max(2000),
    tax_identifier: z.string().max(80),
    invoice_prefix: z.string().regex(/^[A-Z][A-Z0-9-]{0,15}$/),
    receipt_prefix: z.string().regex(/^[A-Z][A-Z0-9-]{0,15}$/),
    contract_prefix: z.string().regex(/^[A-Z][A-Z0-9-]{0,15}$/),
    default_terms: z.string().max(10000),
    payment_instructions: note,
    invoice_notes: note,
    receipt_footer: note,
  })
  .strict();
export const paymentMethodSchema = z
  .object({
    ...identity,
    name: label,
    kind: z.enum([
      'cash',
      'bank_transfer',
      'upi',
      'cheque',
      'card_offline',
      'other',
    ]),
    active: z.boolean(),
  })
  .strict();
export const taxCodeSchema = z
  .object({
    ...identity,
    code: z.string().trim().min(1).max(80),
    jurisdiction: z.string().max(100),
    active: z.boolean(),
    components: z
      .array(
        z.object({ name: z.string().min(1).max(80), rate: money }).strict(),
      )
      .max(8),
  })
  .strict();
export const changeOrderInputSchema = z
  .object({
    ...identity,
    action: z.enum(['save', 'issue', 'approve', 'reject', 'cancel']),
    contract_id: z.uuid(),
    reason: note.optional(),
    terms: z.string().max(10000).optional(),
    evidence: note.optional(),
    items: z
      .array(
        z
          .object({
            change_type: z.enum([
              'addition',
              'deletion',
              'modification',
              'price_adjustment',
            ]),
            description: z.string().trim().min(1).max(3000),
            reason: z.string().trim().min(3).max(3000),
            area: z.string().max(200).default(''),
            original_item_id: z.uuid().nullable(),
            pricing_type: z.enum(['manual', 'catalog']),
            quantity: money.default('1'),
            unit: z.string().min(1).max(80).default('each'),
            unit_rate: money.default('0'),
            adjustment: signedMoney.default('0'),
            specifications: z
              .array(z.object({ label, value: z.string().max(2000) }).strict())
              .max(100)
              .default([]),
            pricing: z.unknown().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .optional(),
  })
  .strict();
export const financeCommandSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('create_contract'), revision_id: z.uuid() })
    .strict(),
  z
    .object({
      action: z.literal('contract_status'),
      id: z.uuid(),
      version: z.number().int().positive(),
      status: z.enum(['active', 'on_hold', 'completed', 'closed', 'cancelled']),
      reason: note.default(''),
    })
    .strict(),
  z
    .object({
      action: z.literal('save_schedule'),
      contract_id: z.uuid(),
      input: scheduleInputSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('activate_schedule'),
      id: z.uuid(),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal('issue_request'),
      item_id: z.uuid(),
      due_date: z.iso.date().nullable(),
      note: note.default(''),
    })
    .strict(),
  z
    .object({
      action: z.literal('save_invoice'),
      contract_id: z.uuid(),
      input: invoiceInputSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('issue_invoice'),
      id: z.uuid(),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.enum(['void_invoice', 'void_payment', 'void_request']),
      id: z.uuid(),
      reason: z.string().trim().min(3).max(3000),
    })
    .strict(),
  z
    .object({
      action: z.literal('record_payment'),
      contract_id: z.uuid(),
      input: paymentInputSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('allocate_payment'),
      id: z.uuid(),
      input: allocationSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('change_order'),
      input: changeOrderInputSchema,
    })
    .strict(),
  z
    .object({ action: z.literal('settings'), input: billingSettingsSchema })
    .strict(),
  z
    .object({ action: z.literal('payment_method'), input: paymentMethodSchema })
    .strict(),
  z.object({ action: z.literal('tax_code'), input: taxCodeSchema }).strict(),
]);
export type FinanceCommand = z.infer<typeof financeCommandSchema>;
export const financeRecordSchema = z.record(z.string(), z.unknown());
export const financeResultsSchema = z.object({
  rows: z.array(financeRecordSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
});
