import { z } from 'zod';

export const executionEntities = [
  'material_categories',
  'materials',
  'material_variants',
  'material_unit_conversions',
  'material_cost_revisions',
  'vendors',
  'vendor_contacts',
  'vendor_materials',
  'estimation_recipes',
  'estimation_recipe_items',
  'estimation_recipe_item_costs',
  'execution_estimates',
  'execution_estimate_revisions',
  'execution_estimate_scope_items',
  'execution_estimate_lines',
  'execution_estimate_line_costs',
  'purchase_requisitions',
  'purchase_requisition_items',
  'purchase_requisition_sources',
  'rfqs',
  'rfq_vendors',
  'rfq_items',
  'vendor_quotes',
  'vendor_quote_items',
  'purchase_orders',
  'purchase_order_items',
  'purchase_order_costs',
  'purchase_order_item_costs',
  'goods_receipts',
  'goods_receipt_items',
] as const;
export const executionEntitySchema = z.enum(executionEntities);
export type ExecutionEntity = z.infer<typeof executionEntitySchema>;
export const executionPermissions: Record<ExecutionEntity, string> =
  Object.fromEntries(
    executionEntities.map((entity) => [
      entity,
      entity === 'material_cost_revisions'
        ? 'material_cost.view'
        : entity === 'estimation_recipe_item_costs' ||
            entity === 'execution_estimate_line_costs'
          ? 'estimate.view_cost'
          : entity.startsWith('material')
            ? 'material.view'
            : entity.startsWith('vendor_quote')
              ? 'vendor_quote.view'
              : entity.startsWith('vendor')
                ? 'vendor.view'
                : entity.startsWith('estimation') ||
                    entity.startsWith('execution_estimate')
                  ? 'estimate.view'
                  : entity.startsWith('purchase_requisition')
                    ? 'purchase_requisition.view'
                    : entity.startsWith('rfq')
                      ? 'rfq.view'
                      : entity === 'purchase_order_costs' ||
                          entity === 'purchase_order_item_costs'
                        ? 'purchase_order.view_cost'
                        : entity.startsWith('purchase_order')
                          ? 'purchase_order.view'
                          : 'goods_receipt.view',
    ]),
  ) as Record<ExecutionEntity, string>;
export function executionModules(permission: string): string[] {
  return [
    'projects',
    ...(permission.startsWith('vendor.') ||
    permission.startsWith('vendor_quote.')
      ? ['vendors']
      : []),
    ...(/^(purchase_|rfq\.|vendor_quote\.|goods_receipt\.|cost_report\.)/.test(
      permission,
    )
      ? ['purchasing']
      : []),
  ];
}
export const executionDecimalSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/);
export const executionRuleSchema = z
  .object({
    basis: z.enum([
      'fixed',
      'quantity',
      'finished_area',
      'width',
      'height',
      'length',
      'depth',
      'volume',
      'percentage',
    ]),
    factor: executionDecimalSchema,
  })
  .strict();
export const executionFilterSchema = z
  .object({
    category_id: z.uuid().optional(),
    line_id: z.uuid().optional(),
    item_id: z.uuid().optional(),
    estimate_id: z.uuid().optional(),
    receipt_id: z.uuid().optional(),
    project_id: z.uuid().optional(),
    contract_id: z.uuid().optional(),
    revision_id: z.uuid().optional(),
    scope_id: z.uuid().optional(),
    material_id: z.uuid().optional(),
    variant_id: z.uuid().optional(),
    vendor_id: z.uuid().optional(),
    recipe_id: z.uuid().optional(),
    requisition_id: z.uuid().optional(),
    rfq_id: z.uuid().optional(),
    quote_id: z.uuid().optional(),
    po_id: z.uuid().optional(),
    status: z.string().max(40).optional(),
    query: z.string().max(100).optional(),
  })
  .strict();
export const executionRecordSchema = z.record(z.string(), z.json());
export type ExecutionRecord = z.infer<typeof executionRecordSchema>;
export const executionResultsSchema = z.object({
  rows: z.array(executionRecordSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.literal(25),
});
const payload = executionRecordSchema.refine(
  (value) => JSON.stringify(value).length <= 250000,
  'Input is too large',
);
const identity = { id: z.uuid(), version: z.number().int().positive() };
export const executionCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('configure'),
      entity: z.enum([
        'material_categories',
        'materials',
        'material_variants',
        'material_unit_conversions',
        'vendors',
        'vendor_contacts',
        'vendor_materials',
        'estimation_recipes',
        'estimation_recipe_items',
        'estimation_recipe_item_costs',
      ]),
      input: payload,
    })
    .strict(),
  z.object({ action: z.literal('cost_record'), input: payload }).strict(),
  z
    .object({
      action: z.literal('estimate'),
      operation: z.enum([
        'create',
        'revise',
        'sync',
        'submit',
        'approve',
        'return',
        'cancel',
        'exclude_scope',
      ]),
      input: payload,
    })
    .strict(),
  z
    .object({
      action: z.literal('line_save'),
      revision_id: z.uuid(),
      input: payload,
    })
    .strict(),
  z
    .object({
      action: z.literal('recipe_apply'),
      revision_id: z.uuid(),
      input: payload,
    })
    .strict(),
  z
    .object({
      action: z.literal('line_remove'),
      revision_id: z.uuid(),
      line_id: z.uuid(),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({ action: z.literal('requisition_create'), input: payload })
    .strict(),
  z
    .object({
      action: z.literal('requisition_transition'),
      ...identity,
      operation: z.enum(['submit', 'approve', 'cancel']),
      reason: z.string().max(3000).default(''),
    })
    .strict(),
  z.object({ action: z.literal('rfq_create'), input: payload }).strict(),
  z
    .object({
      action: z.literal('rfq_transition'),
      ...identity,
      operation: z.enum(['issue', 'close', 'cancel']),
    })
    .strict(),
  z.object({ action: z.literal('quote_save'), input: payload }).strict(),
  z
    .object({
      action: z.literal('quote_transition'),
      ...identity,
      operation: z.enum(['record', 'decline', 'cancel']),
    })
    .strict(),
  z.object({ action: z.literal('po_create'), input: payload }).strict(),
  z
    .object({
      action: z.literal('po_transition'),
      ...identity,
      operation: z.enum(['issue', 'close', 'cancel']),
      reason: z.string().max(3000).default(''),
    })
    .strict(),
  z.object({ action: z.literal('receipt_record'), input: payload }).strict(),
]);
export type ExecutionCommand = z.infer<typeof executionCommandSchema>;
export function executionCommandPermission(c: ExecutionCommand): string {
  switch (c.action) {
    case 'configure':
      return c.entity.startsWith('vendor')
        ? 'vendor.manage'
        : c.entity.startsWith('estimation')
          ? 'estimate.manage_recipes'
          : 'material.manage';
    case 'cost_record':
      return 'material_cost.manage';
    case 'estimate':
      return c.operation === 'create' || c.operation === 'revise'
        ? 'estimate.create'
        : c.operation === 'approve'
          ? 'estimate.approve'
          : c.operation === 'return'
            ? 'estimate.review'
            : 'estimate.edit';
    case 'line_save':
    case 'recipe_apply':
    case 'line_remove':
      return 'estimate.edit';
    case 'requisition_create':
      return 'purchase_requisition.create';
    case 'requisition_transition':
      return c.operation === 'approve'
        ? 'purchase_requisition.approve'
        : 'purchase_requisition.create';
    case 'rfq_create':
      return 'rfq.create';
    case 'rfq_transition':
      return 'rfq.manage';
    case 'quote_save':
    case 'quote_transition':
      return 'vendor_quote.manage';
    case 'po_create':
      return 'purchase_order.create';
    case 'po_transition':
      return c.operation === 'issue'
        ? 'purchase_order.issue'
        : 'purchase_order.manage';
    case 'receipt_record':
      return 'goods_receipt.record';
  }
}
