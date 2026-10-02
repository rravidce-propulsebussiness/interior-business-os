import { z } from 'zod';
const operationId = z.string().uuid();
export const operationVersionSchema = z.number().int().positive();
export const operationChoicesSchema = z.object({
  rows: z.array(z.object({ id: operationId, label: z.string() })),
  page: z.number().int().positive(),
  has_more: z.boolean(),
});
const quantity = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/)
  .max(25);
export const siteCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('task'),
      id: operationId,
      version: z.number().int().positive(),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']),
      completion_percentage: quantity,
      reason: z.string().max(3000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('snag'),
      project_id: operationId,
      title: z.string().trim().min(1).max(200),
      description: z.string().max(3000),
      priority: z.enum(['low', 'medium', 'high', 'critical']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('stock'),
      operation: z.enum(['consumption', 'scrap', 'damage']),
      project_id: operationId,
      source_location_id: operationId,
      lot_id: operationId,
      quantity,
      reason: z.string().trim().min(3).max(3000),
      idempotency_key: operationId,
    })
    .strict(),
]);
export type SiteCommand = z.infer<typeof siteCommandSchema>;
export function siteCommandPermission(command: SiteCommand) {
  return command.kind === 'task'
    ? 'task.manage'
    : command.kind === 'snag'
      ? 'snag.create'
      : 'inventory.consume';
}
export const operationsPermissions = {
  project_execution_members: 'execution.view',
  execution_plans: 'execution.view',
  execution_plan_revisions: 'execution.view',
  work_packages: 'execution.view',
  project_milestones: 'milestone.view',
  project_tasks: 'task.view',
  task_dependencies: 'task.view',
  inventory_locations: 'inventory.view',
  inventory_lots: 'inventory.view',
  inventory_lot_costs: 'cost.execution.view',
  material_issue_requests: 'material_issue.view',
  material_issue_request_items: 'material_issue.view',
  inventory_transactions: 'inventory.view',
  inventory_movements: 'inventory.view',
  inventory_counts: 'inventory.count',
  vendor_execution_profiles: 'subcontractor.view',
  subcontractor_work_orders: 'subcontractor.view',
  subcontractor_work_order_costs: 'cost.execution.view',
  work_measurements: 'subcontractor.view',
  work_measurement_costs: 'cost.execution.view',
  inspection_templates: 'inspection.view',
  project_inspections: 'inspection.view',
  project_snags: 'snag.view',
  handover_templates: 'handover.view',
  handover_records: 'handover.view',
  project_execution_events: 'execution.view',
} as const;
export const operationsEntitySchema = z.enum([
  'project_execution_members',
  'execution_plans',
  'execution_plan_revisions',
  'work_packages',
  'project_milestones',
  'project_tasks',
  'task_dependencies',
  'inventory_locations',
  'inventory_lots',
  'inventory_lot_costs',
  'material_issue_requests',
  'material_issue_request_items',
  'inventory_transactions',
  'inventory_movements',
  'inventory_counts',
  'vendor_execution_profiles',
  'subcontractor_work_orders',
  'subcontractor_work_order_costs',
  'work_measurements',
  'work_measurement_costs',
  'inspection_templates',
  'project_inspections',
  'project_snags',
  'handover_templates',
  'handover_records',
  'project_execution_events',
]);
export type OperationsEntity = z.infer<typeof operationsEntitySchema>;
export const operationsFilterSchema = z.record(
  z.enum([
    'id',
    'project_id',
    'plan_id',
    'request_id',
    'work_order_id',
    'transaction_id',
    'lot_id',
    'location_id',
    'entity_id',
    'status',
  ]),
  z.string().max(100),
);
export const operationsRowSchema = z.record(z.string(), z.unknown());
export type OperationsRow = z.infer<typeof operationsRowSchema>;
export const operationsResultsSchema = z.object({
  rows: z.array(operationsRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.literal(25),
});
export function operationsModules(permission: string) {
  return [
    'projects',
    ...(/^(inventory|material_issue)\./.test(permission) ? ['purchasing'] : []),
    ...(/^(work_order|subcontractor)\./.test(permission) ? ['vendors'] : []),
  ];
}
