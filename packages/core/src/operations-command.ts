import { z } from 'zod';
export type OperationField = {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'decimal' | 'integer' | 'boolean' | 'textarea';
  required?: boolean;
  reference?: string;
  options?: readonly string[];
  children?: OperationField[];
};
export type OperationDefinition = {
  label: string;
  permission: string;
  group:
    | 'save'
    | 'plan'
    | 'refresh'
    | 'task'
    | 'issue_request'
    | 'stock'
    | 'inspection'
    | 'snag'
    | 'handover'
    | 'work_order';
  operation: string;
  entity: string;
  fields: OperationField[];
};
const f = (
  key: string,
  label: string,
  extra: Omit<OperationField, 'key' | 'label'> = {},
): OperationField => ({ key, label, ...extra });
const ref = (key: string, label: string, reference: string, required = true) =>
  f(key, label, { reference, required });
const text = (key: string, label: string, required = false) =>
  f(key, label, { required });
const decimal = (key: string, label: string, required = true) =>
  f(key, label, { type: 'decimal', required });
const date = (key: string, label: string) => f(key, label, { type: 'date' });
const select = (key: string, label: string, options: readonly string[]) =>
  f(key, label, { options, required: true });
const project = ref('project_id', 'Project', 'projects'),
  plan = ref('plan_id', 'Execution plan', 'execution_plans'),
  area = ref('area_id', 'Area', 'project_areas', false),
  notes = f('notes', 'Notes', { type: 'textarea' }),
  reason = text('reason', 'Reason', true);
const identity = [
  f('id', 'Record', { required: true }),
  f('version', 'Version', { type: 'integer', required: true }),
];
const dates = [
  date('planned_start', 'Planned start'),
  date('planned_end', 'Planned end'),
];
const checklist = [
  f('checklist', 'Checklist', {
    required: true,
    children: [
      text('key', 'Key', true),
      text('label', 'Check', true),
      f('required', 'Required', { type: 'boolean' }),
    ],
  }),
];
const results = [
  f('results', 'Checklist results', {
    required: true,
    children: [
      text('key', 'Key', true),
      select('result', 'Result', ['not_checked', 'pass', 'fail', 'na']),
      text('note', 'Note'),
    ],
  }),
];
export const operationDefinitions: Record<string, OperationDefinition> = {};
export function operationSourceEntity(action: string) {
  const d = operationDefinitions[action];
  if (!d) return '';
  if (action === 'plan_revise') return 'execution_plans';
  if (action === 'work_order_measure') return 'subcontractor_work_orders';
  return d.entity;
}
function add(
  key: string,
  label: string,
  permission: string,
  group: OperationDefinition['group'],
  operation: string,
  entity: string,
  fields: OperationField[],
) {
  operationDefinitions[key] = {
    label,
    permission,
    group,
    operation,
    entity,
    fields,
  };
}
function save(
  entity: string,
  label: string,
  permission: string,
  fields: OperationField[],
) {
  add('save_' + entity, label, permission, 'save', entity, entity, fields);
}
save('project_execution_members', 'Assign project member', 'execution.manage', [
  project,
  ref('user_id', 'Member', 'members'),
  f('active', 'Active', { type: 'boolean' }),
]);
save('inventory_locations', 'Save inventory location', 'inventory.manage', [
  text('name', 'Name', true),
  select('kind', 'Type', [
    'central_store',
    'warehouse',
    'workshop',
    'project_site',
    'other',
  ]),
  ref('site_project_id', 'Site project', 'projects', false),
  f('active', 'Active', { type: 'boolean' }),
  notes,
]);
save('work_packages', 'Save work package', 'execution.manage', [
  project,
  plan,
  area,
  text('name', 'Name', true),
  ref('scope_id', 'Estimate scope', 'execution_estimate_scope_items', false),
  select('source_type', 'Source', ['manual', 'quotation', 'change_order']),
  text('source_id', 'Source reference'),
  select('scope_state', 'Execution scope state', [
    'not_estimated',
    'estimated',
    'procurement_required',
    'procurement_ready',
    'in_execution',
    'completed',
    'removed_pending_confirmation',
    'no_longer_required',
  ]),
  decimal('weight', 'Weight'),
  notes,
]);
save('project_milestones', 'Save milestone', 'milestone.manage', [
  project,
  plan,
  text('name', 'Name', true),
  text('description', 'Description'),
  f('sequence', 'Sequence', { type: 'integer' }),
  ref('owner_id', 'Owner', 'members', false),
  ...dates,
  notes,
]);
save('project_tasks', 'Save task', 'task.manage', [
  project,
  plan,
  area,
  ref('work_package_id', 'Work package', 'work_packages', false),
  ref('milestone_id', 'Milestone', 'project_milestones', false),
  text('title', 'Title', true),
  text('description', 'Description'),
  ref('assigned_to', 'Assigned to', 'members', false),
  select('priority', 'Priority', ['low', 'normal', 'high', 'urgent']),
  decimal('weight', 'Weight'),
  ...dates,
  notes,
]);
save(
  'vendor_execution_profiles',
  'Save subcontractor profile',
  'subcontractor.manage',
  [
    ref('vendor_id', 'Vendor', 'vendors'),
    text('specialization', 'Specialization'),
    text('service_areas', 'Service areas'),
    f('active', 'Active', { type: 'boolean' }),
    notes,
  ],
);
save(
  'inspection_templates',
  'Save inspection template',
  'inspection.manage_templates',
  [
    text('name', 'Name', true),
    text('kind', 'Type', true),
    f('is_final', 'Final inspection', { type: 'boolean' }),
    f('mandatory', 'Mandatory', { type: 'boolean' }),
    f('active', 'Active', { type: 'boolean' }),
    ...checklist,
  ],
);
save('handover_templates', 'Save handover template', 'handover.create', [
  text('name', 'Name', true),
  f('active', 'Active', { type: 'boolean' }),
  ...checklist,
]);
add(
  'plan_create',
  'Create execution plan',
  'execution.manage',
  'plan',
  'create',
  'execution_plans',
  [
    ref('contract_id', 'Accepted contract', 'contracts'),
    ref('manager_id', 'Project manager', 'members', false),
    ...dates,
    notes,
  ],
);
add(
  'plan_revise',
  'Create plan revision',
  'execution.manage',
  'plan',
  'revise',
  'execution_plan_revisions',
  [...identity, notes],
);
add(
  'plan_approve',
  'Approve plan revision',
  'execution.approve',
  'plan',
  'approve',
  'execution_plan_revisions',
  identity,
);
add(
  'plan_refresh',
  'Refresh draft estimate basis',
  'execution.manage',
  'refresh',
  'refresh',
  'execution_plan_revisions',
  identity,
);
add(
  'plan_status',
  'Update execution status',
  'execution.manage',
  'plan',
  'status',
  'execution_plans',
  [
    ...identity,
    select('status', 'Status', [
      'planning',
      'in_progress',
      'on_hold',
      'punch_list',
      'ready_for_handover',
      'completed',
      'cancelled',
    ]),
    reason,
  ],
);
add(
  'milestone_progress',
  'Update milestone',
  'milestone.manage',
  'task',
  'milestone',
  'project_milestones',
  [
    ...identity,
    select('status', 'Status', [
      'not_started',
      'in_progress',
      'blocked',
      'completed',
      'cancelled',
    ]),
    decimal('completion_percentage', 'Progress %'),
    text('reason', 'Block reason'),
  ],
);
for (const operation of ['dependency_add', 'dependency_remove'])
  add(
    operation,
    operation === 'dependency_add' ? 'Add predecessor' : 'Remove predecessor',
    'execution.manage',
    'task',
    operation,
    'project_tasks',
    [...identity, ref('predecessor_id', 'Predecessor', 'project_tasks')],
  );
add(
  'site_note',
  'Add site note',
  'task.manage',
  'task',
  'note',
  'project_tasks',
  [...identity, text('note', 'Site note', true)],
);
add(
  'request_create',
  'Request material',
  'material_issue.request',
  'issue_request',
  'create',
  'material_issue_requests',
  [
    project,
    ref('source_location_id', 'Store', 'inventory_locations'),
    ref('destination_location_id', 'Site', 'inventory_locations'),
    reason,
    f('items', 'Materials', {
      required: true,
      children: [
        ref('variant_id', 'Material variant', 'material_variants'),
        text('unit', 'Purchase unit', true),
        decimal('quantity', 'Requested quantity'),
      ],
    }),
  ],
);
for (const operation of ['submit', 'reject', 'cancel'])
  add(
    'request_' + operation,
    operation + ' request',
    operation === 'reject'
      ? 'material_issue.approve'
      : 'material_issue.request',
    'issue_request',
    operation,
    'material_issue_requests',
    [...identity, ...(operation === 'submit' ? [] : [reason])],
  );
add(
  'request_approve',
  'Approve requested quantities',
  'material_issue.approve',
  'issue_request',
  'approve',
  'material_issue_requests',
  [
    ...identity,
    f('items', 'Approvals', {
      required: true,
      children: [
        ref('id', 'Requested item', 'material_issue_request_items'),
        decimal('approved_quantity', 'Total approved quantity'),
      ],
    }),
  ],
);
const stockPermission: Record<string, string> = {
  purchase_receipt: 'inventory.receive',
  transfer: 'inventory.issue',
  issue_to_site: 'inventory.issue',
  return_from_site: 'inventory.issue',
  consumption: 'inventory.consume',
  scrap: 'inventory.consume',
  damage: 'inventory.consume',
  adjustment: 'inventory.adjust',
  count: 'inventory.count',
  reversal: 'inventory.reverse',
};
for (const operation of Object.keys(stockPermission)) {
  const fields: OperationField[] = [
    {
      ...project,
      required: !['transfer', 'adjustment', 'count'].includes(operation),
    },
  ];
  if (operation === 'reversal')
    fields.push(
      ref(
        'original_transaction_id',
        'Original movement',
        'inventory_transactions',
      ),
    );
  else {
    if (operation === 'purchase_receipt')
      fields.push(
        ref('receipt_item_id', 'Accepted receipt item', 'goods_receipt_items'),
      );
    else
      fields.push(
        ref('lot_id', 'Receipt lot', 'inventory_lots'),
        ref('source_location_id', 'Source location', 'inventory_locations'),
      );
    if (
      [
        'purchase_receipt',
        'transfer',
        'issue_to_site',
        'return_from_site',
      ].includes(operation)
    )
      fields.push(
        ref('destination_location_id', 'Destination', 'inventory_locations'),
      );
    if (operation === 'issue_to_site')
      fields.push(
        ref(
          'request_item_id',
          'Approved request item',
          'material_issue_request_items',
        ),
        text('received_by', 'Received by', true),
      );
    if (operation === 'return_from_site')
      fields.push(
        ref(
          'original_transaction_id',
          'Original issue',
          'inventory_transactions',
        ),
      );
    if (operation === 'count')
      fields.push(decimal('physical_quantity', 'Physical quantity'));
    else if (operation !== 'purchase_receipt')
      fields.push(
        decimal(
          'quantity',
          operation === 'adjustment' ? 'Quantity delta' : 'Quantity',
        ),
      );
    fields.push(
      area,
      ref('task_id', 'Task', 'project_tasks', false),
      ref('work_package_id', 'Work package', 'work_packages', false),
      ref(
        'estimate_line_id',
        'Estimate line',
        'execution_estimate_lines',
        false,
      ),
      date('movement_date', 'Movement date'),
    );
  }
  fields.push(reason);
  add(
    'stock_' + operation,
    operation.replaceAll('_', ' '),
    stockPermission[operation]!,
    'stock',
    operation,
    'inventory_transactions',
    fields,
  );
}
add(
  'inspection_create',
  'Start inspection',
  'inspection.create',
  'inspection',
  'create',
  'project_inspections',
  [
    project,
    ref('template_id', 'Template', 'inspection_templates'),
    area,
    ref('work_package_id', 'Work package', 'work_packages', false),
    ref(
      'predecessor_id',
      'Failed inspection to reinspect',
      'project_inspections',
      false,
    ),
    ref('inspector_id', 'Inspector', 'members'),
    date('inspection_date', 'Inspection date'),
    notes,
  ],
);
for (const op of ['save', 'approve'])
  add(
    'inspection_' + op,
    op === 'save' ? 'Save inspection' : 'Approve inspection',
    op === 'save' ? 'inspection.create' : 'inspection.approve',
    'inspection',
    op,
    'project_inspections',
    [
      ...identity,
      ...results,
      ...(op === 'approve'
        ? [
            select('status', 'Decision', [
              'passed',
              'failed',
              'requires_rework',
            ]),
          ]
        : []),
      notes,
    ],
  );
add(
  'snag_assign',
  'Assign snag',
  'snag.assign',
  'snag',
  'assign',
  'project_snags',
  [
    ...identity,
    ref('assigned_to', 'Member', 'members', false),
    ref('vendor_id', 'Subcontractor/vendor', 'vendors', false),
  ],
);
for (const status of [
  'in_progress',
  'ready_for_review',
  'verified',
  'closed',
  'reopened',
])
  add(
    'snag_' + status,
    status.replaceAll('_', ' '),
    ['verified', 'closed', 'reopened'].includes(status)
      ? 'snag.verify'
      : 'snag.create',
    'snag',
    'transition',
    'project_snags',
    [
      ...identity,
      select('status', 'Status', [status]),
      text('resolution', 'Resolution', status === 'ready_for_review'),
      text(
        'verification',
        'Verification',
        ['verified', 'closed', 'reopened'].includes(status),
      ),
    ],
  );
add(
  'handover_create',
  'Open handover',
  'handover.create',
  'handover',
  'create',
  'handover_records',
  [plan, ref('template_id', 'Checklist template', 'handover_templates')],
);
for (const op of ['save', 'approve'])
  add(
    'handover_' + op,
    op === 'save' ? 'Save handover' : 'Approve handover',
    op === 'save' ? 'handover.create' : 'handover.approve',
    'handover',
    op,
    'handover_records',
    [
      ...identity,
      ...results,
      text('customer_notes', 'Customer notes'),
      text('internal_notes', 'Internal notes'),
      text('acknowledgement', 'Acknowledgement evidence'),
      text('commercial_review', 'Commercial review', op === 'approve'),
      text('materials_review', 'Material reconciliation', op === 'approve'),
      date('handover_date', 'Handover date'),
      date('warranty_start', 'Warranty start'),
      date('warranty_end', 'Warranty end'),
    ],
  );
add(
  'work_order_create',
  'Create work order',
  'work_order.create',
  'work_order',
  'create',
  'subcontractor_work_orders',
  [
    plan,
    ref('vendor_id', 'Subcontractor', 'vendors'),
    area,
    text('title', 'Title', true),
    text('scope', 'Scope', true),
    text('unit', 'Unit', true),
    decimal('quantity', 'Quantity'),
    decimal('agreed_amount', 'Agreed amount'),
    ...dates,
    notes,
  ],
);
for (const op of ['issue', 'cancel', 'progress', 'measure'])
  add(
    'work_order_' + op,
    op.replaceAll('_', ' ') + ' work order',
    ['issue', 'cancel'].includes(op)
      ? 'work_order.issue'
      : 'work_order.measure',
    'work_order',
    op,
    op === 'measure' ? 'work_measurements' : 'subcontractor_work_orders',
    [
      ...identity,
      ...(op === 'cancel'
        ? [reason]
        : op === 'progress'
          ? [
              decimal('completed_percentage', 'Completed %'),
              decimal('accepted_percentage', 'Accepted %'),
            ]
          : op === 'measure'
            ? [
                decimal('quantity', 'Measured quantity'),
                area,
                date('measurement_date', 'Measurement date'),
                text('note', 'Measurement note', true),
              ]
            : []),
    ],
  );
for (const op of ['verify', 'reject', 'certify'])
  add(
    'measurement_' + op,
    op + ' measurement',
    'work_order.approve',
    'work_order',
    op,
    'work_measurements',
    [...identity, reason],
  );

function fieldSchema(field: OperationField): z.ZodType {
  let schema: z.ZodType;
  if (field.children)
    schema = z
      .array(
        z
          .object(
            Object.fromEntries(
              field.children.map((c) => [c.key, fieldSchema(c)]),
            ),
          )
          .strict(),
      )
      .min(1)
      .max(100);
  else if (field.type === 'boolean') schema = z.boolean();
  else if (field.type === 'integer')
    schema = z.number().int().nonnegative().max(1000000);
  else if (field.reference || field.key === 'id' || field.key === 'source_id')
    schema = z.string().uuid();
  else if (field.options)
    schema = z.enum(field.options as [string, ...string[]]);
  else if (field.type === 'decimal')
    schema = z
      .string()
      .regex(/^-?\d+(\.\d{1,6})?$/)
      .max(26);
  else if (field.type === 'date')
    schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  else
    schema = z
      .string()
      .max(10000)
      .refine((v) => !field.required || v.trim().length > 0);
  return field.required ? schema : schema.optional();
}
export function parseOperationCommand(value: unknown) {
  const envelope = z
    .object({ action: z.string(), input: z.record(z.string(), z.unknown()) })
    .strict()
    .parse(value);
  const definition = operationDefinitions[envelope.action];
  if (!definition) throw new Error('Unknown operation');
  const shape = Object.fromEntries(
    definition.fields.map((field) => [field.key, fieldSchema(field)]),
  );
  if (definition.group === 'stock') shape.idempotency_key = z.string().uuid();
  if (definition.group === 'save') {
    shape.id = z.string().uuid().optional();
    shape.version = z.number().int().positive().optional();
  }
  const input = z.object(shape).strict().parse(envelope.input);
  return {
    action: envelope.action,
    definition,
    input: z.record(z.string(), z.json()).parse(input),
  };
}
