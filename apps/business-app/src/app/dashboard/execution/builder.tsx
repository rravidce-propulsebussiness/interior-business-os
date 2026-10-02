import Link from 'next/link';
import type { ExecutionRecord } from '@business-os/core/execution';
import { ExecutionForm, type ExecutionField } from './form';
import { choices, basisOptions } from './forms';
import { record, text, RecordTable } from './presentation';
import type { executionServices } from './service';
export async function ScopeBuilder({
  s,
  scope,
  line,
}: {
  s: Awaited<ReturnType<typeof executionServices>>;
  scope: ExecutionRecord;
  line?: ExecutionRecord;
}) {
  const revision = await s.execution.detail(
      'execution_estimate_revisions',
      text(scope.revision_id),
    ),
    snapshot = record(scope.snapshot);
  const editable =
    revision.status === 'draft' &&
    scope.coverage !== 'removed' &&
    s.allowed('estimate.edit');
  const requirements = await s.execution.search('execution_estimate_lines', {
    scope_id: text(scope.id),
  });
  const calculation = record(line?.calculation_snapshot);
  const currentCost =
    line && s.allowed('estimate.view_cost')
      ? (
          await s.execution.search('execution_estimate_line_costs', {
            line_id: text(line.id),
          })
        ).rows[0]
      : null;
  const fields: ExecutionField[] = [
    { key: 'description', label: 'Requirement description', required: true },
    {
      key: 'cost_kind',
      label: 'Requirement type',
      options: [
        'material',
        'labour',
        'external_service',
        'transport',
        'other',
      ].map((value) => ({ value, label: value.replaceAll('_', ' ') })),
    },
    {
      key: 'variant_id',
      label: 'Material variant (materials only)',
      optional: true,
      options: [
        { value: '', label: 'No material — service requirement' },
        ...(editable
          ? await choices(s, 'material_variants', { status: 'active' })
          : []),
      ],
    },
    { key: 'unit', label: 'Service unit', required: true },
    { key: 'rule.basis', label: 'Calculation basis', options: basisOptions },
    { key: 'rule.factor', label: 'Factor / fixed quantity', required: true },
    {
      key: 'accuracy',
      label: 'Estimate accuracy',
      options: ['rough', 'detailed', 'final_estimate'].map((value) => ({
        value,
        label: value.replaceAll('_', ' '),
      })),
    },
    ...[
      'quantity',
      'finished_area',
      'width',
      'height',
      'length',
      'depth',
      'volume',
      'percentage',
    ].map((key) => ({
      key: `measurements.${key}`,
      label: `Measurement: ${key.replaceAll('_', ' ')}`,
      optional: true,
    })),
    {
      key: 'measurement_note',
      label: 'Measurement source / reason for changes',
      type: 'textarea',
    },
    { key: 'drawing_reference', label: 'Drawing reference' },
    { key: 'site_measurement_version', label: 'Site measurement version' },
    {
      key: 'waste_percentage',
      label: 'Waste override (%) — blank uses recipe/material',
      optional: true,
    },
    ...(s.allowed('estimate.override_quantity')
      ? [
          {
            key: 'override_quantity',
            label: 'Planned purchase override',
            optional: true,
          },
          { key: 'override_reason', label: 'Override reason', optional: true },
        ]
      : []),
    ...(s.allowed('estimate.view_cost')
      ? [
          {
            key: 'manual_cost.unit_cost',
            label: 'Manual cost per purchase/service unit (optional)',
            optional: true,
          },
          {
            key: 'manual_cost.source_reference',
            label: 'Manual rate source',
            optional: true,
          },
          {
            key: 'manual_cost.reason',
            label: 'Manual rate reason',
            optional: true,
          },
        ]
      : []),
    { key: 'notes', label: 'Planning notes', type: 'textarea' },
  ];
  const input = {
    version: revision.version,
    scope_id: scope.id,
    method: line?.recipe_item_id ? 'recipe' : 'rule',
    ...(line?.recipe_item_id
      ? {
          recipe_item_id: line.recipe_item_id,
          recipe_reason: scope.recipe_reason,
        }
      : {}),
    description: line?.description ?? '',
    cost_kind: line?.cost_kind ?? 'material',
    variant_id: line?.variant_id ?? undefined,
    unit: line?.purchase_unit ?? 'each',
    rule: calculation.rule ?? { basis: 'fixed', factor: '1' },
    measurements: calculation.measurements ?? snapshot.measurements ?? {},
    accuracy: line?.accuracy ?? 'rough',
    ...(calculation.waste_source === 'line'
      ? { waste_percentage: calculation.waste_percentage }
      : {}),
    ...(line
      ? {
          id: line.id,
          drawing_reference: line.drawing_reference,
          measurement_note: line.measurement_note,
          site_measurement_version: line.site_measurement_version,
          notes: line.notes,
          override_quantity: line.override_quantity ?? undefined,
          override_reason: line.override_reason,
        }
      : {}),
  };
  return (
    <section className="my-6">
      <Link
        className="underline"
        href={`/dashboard/execution/execution_estimate_revisions/${text(revision.id)}`}
      >
        Estimate revision {text(revision.revision_number)}
      </Link>
      <h2 className="my-3 text-2xl">
        {text(scope.area_name) || 'Unassigned area'} · {text(snapshot.name)}
      </h2>
      <p>
        {text(scope.coverage).replaceAll('_', ' ')} · Source:{' '}
        {scope.source_type === 'change_order'
          ? 'Approved change order'
          : 'Accepted quotation'}
      </p>
      <p>
        {text(snapshot.quantity)} {text(record(snapshot.unit).label)}
      </p>
      {currentCost && (
        <p className="my-4">
          Estimated cost: {text(currentCost.currency)}{' '}
          {text(currentCost.estimated_cost)} · Rate:{' '}
          {text(currentCost.unit_cost)} per {text(line?.purchase_unit)} ·
          Source: {text(record(currentCost.rate_snapshot).source_reference)}
        </p>
      )}
      <RecordTable
        rows={requirements.rows}
        entity="execution_estimate_lines"
        columns={[
          'cost_kind',
          'base_quantity',
          'waste_quantity',
          'required_quantity',
          'calculated_purchase_quantity',
          'rounded_purchase_quantity',
          'planned_purchase_quantity',
          'purchase_unit',
        ]}
      />
      {editable && (
        <>
          <details open={Boolean(line)}>
            <summary className="cursor-pointer font-semibold">
              {line
                ? 'Edit requirement'
                : 'Add material, labour or service requirement'}
            </summary>
            <ExecutionForm
              title={line ? 'Save requirement' : 'Add requirement'}
              initial={{ action: 'line_save', revision_id: revision.id, input }}
              fields={
                line?.recipe_item_id
                  ? fields.filter(
                      (field) =>
                        ![
                          'description',
                          'cost_kind',
                          'variant_id',
                          'unit',
                          'rule.basis',
                          'rule.factor',
                        ].includes(field.key),
                    )
                  : fields
              }
              returnTo={`/dashboard/execution/execution_estimate_scope_items/${text(scope.id)}`}
            />
          </details>
          {!line && (
            <details>
              <summary className="cursor-pointer font-semibold">
                Apply a recipe
              </summary>
              <ExecutionForm
                title="Apply recipe"
                initial={{
                  action: 'recipe_apply',
                  revision_id: revision.id,
                  input: {
                    version: revision.version,
                    scope_id: scope.id,
                    recipe_id: scope.suggested_recipe_id ?? undefined,
                  },
                }}
                fields={[
                  {
                    key: 'recipe_id',
                    label: 'Recipe',
                    required: true,
                    options: [
                      { value: '', label: 'Select recipe…' },
                      ...(await choices(s, 'estimation_recipes', {
                        status: 'active',
                      })),
                    ],
                  },
                  {
                    key: 'recipe_reason',
                    label:
                      'Selection reason (required when different from suggestion)',
                  },
                  { key: 'measurement_note', label: 'Measurement source' },
                ]}
                returnTo={`/dashboard/execution/execution_estimate_scope_items/${text(scope.id)}`}
              />
            </details>
          )}
          {!requirements.total && !line && (
            <ExecutionForm
              title="Exclude this scope"
              initial={{
                action: 'estimate',
                operation: 'exclude_scope',
                input: {
                  id: revision.id,
                  version: revision.version,
                  scope_id: scope.id,
                },
              }}
              fields={[
                { key: 'reason', label: 'Exclusion reason', required: true },
              ]}
            />
          )}
          {line && (
            <ExecutionForm
              title="Remove requirement"
              initial={{
                action: 'line_remove',
                revision_id: revision.id,
                line_id: line.id,
                version: revision.version,
              }}
              returnTo={`/dashboard/execution/execution_estimate_scope_items/${text(scope.id)}`}
            />
          )}
        </>
      )}
      {!editable && (
        <p className="my-4">
          This scope is read-only. Create a new estimate revision to change
          approved requirements.
        </p>
      )}
    </section>
  );
}
