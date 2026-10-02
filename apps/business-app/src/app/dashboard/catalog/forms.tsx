import type { Catalog, Entity } from '@business-os/quotation-engine';
import { EntityForm } from './entity-form';
import type { Field } from './entity-form';
const choices = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll('_', ' ') }));
const state: Field = {
  key: 'status',
  label: 'Status',
  choices: choices(['active', 'inactive']),
};
const names: Field[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'key', label: 'Stable key', required: true },
  state,
];
const sorting: Field = {
  key: 'sort_order',
  label: 'Sort order',
  type: 'number',
};
const decimalField = (key: string, label: string, nullable = false): Field => ({
  key,
  label,
  nullable,
  required: !nullable,
});
export function ConfigForm({
  entity,
  catalog,
  org,
  record = {},
  itemId,
  title,
  canCost = false,
  industries = [],
  replace,
}: {
  entity: Entity;
  catalog: Catalog;
  org: string;
  record?: Record<string, unknown>;
  itemId?: string;
  title: string;
  canCost?: boolean;
  industries?: { id: string; name: string }[];
  replace?: { id: string; version: number };
}) {
  const select = (
    key: string,
    label: string,
    rows: { id: string; name: string }[],
    nullable = true,
  ): Field => ({
    key,
    label,
    choices: rows.map((r) => ({ value: r.id, label: r.name })),
    nullable,
  });
  let initial: Record<string, unknown> = {
    version: 1,
    status: 'active',
    sort_order: 0,
    ...record,
  };
  let fields: Field[] = [];
  const itemRows = catalog.items.map((i) => ({ id: i.id, name: i.name })),
    books = catalog.books.map((b) => ({ id: b.id, name: b.name }));
  if (entity === 'catalog_categories') {
    initial = {
      name: '',
      key: '',
      description: '',
      parent_id: null,
      industry_id: null,
      ...initial,
    };
    fields = [
      ...names,
      { key: 'description', label: 'Description', type: 'textarea' },
      select(
        'parent_id',
        'Parent category',
        catalog.categories.filter((c) => c.id !== record.id),
      ),
      select('industry_id', 'Industry', industries),
      sorting,
    ];
  }
  if (entity === 'catalog_items') {
    initial = {
      name: '',
      key: '',
      description: '',
      category_id: null,
      industry_id: null,
      unit_key: catalog.units[0]?.key ?? '',
      method_key: 'manual',
      quantity_rounding: { mode: 'none', step: '0.01' },
      amount_rounding: { mode: 'nearest', step: '0.01' },
      ...initial,
    };
    fields = [
      ...names,
      { key: 'description', label: 'Description', type: 'textarea' },
      select('category_id', 'Category', catalog.categories),
      select('industry_id', 'Industry', industries),
      {
        key: 'unit_key',
        label: 'Pricing unit',
        choices: catalog.units.map((u) => ({ value: u.key, label: u.label })),
      },
      {
        key: 'method_key',
        label: 'Measurement method',
        choices: catalog.methods.map((m) => ({ value: m.key, label: m.label })),
      },
      sorting,
    ];
    for (const name of ['quantity', 'amount']) {
      const rule = initial[name + '_rounding'] as {
        mode: string;
        step: string;
      };
      initial[name + '_mode'] = rule.mode;
      initial[name + '_step'] = rule.step;
      fields.push(
        {
          key: name + '_mode',
          label: name + ' rounding',
          choices: choices(['none', 'nearest', 'up', 'down']),
        },
        decimalField(name + '_step', name + ' increment'),
      );
    }
  }
  if (entity === 'catalog_item_attributes') {
    initial = {
      item_id: itemId,
      key: '',
      label: '',
      input_type: 'select',
      required: false,
      visible_sales: true,
      visible_customer: true,
      affects_pricing: false,
      default_options: [],
      conditions: [],
      help_text: '',
      ...initial,
    };
    const conditions = initial.conditions as {
      attribute_key: string;
      operator: string;
      values: string[];
    }[];
    initial.dependency_parent = conditions[0]?.attribute_key ?? '';
    initial.dependency_operator = conditions[0]?.operator ?? 'equals';
    initial.dependency_option = conditions[0]?.values[0] ?? '';
    fields = [
      { key: 'label', label: 'Question label', required: true },
      { key: 'key', label: 'Stable key', required: true },
      {
        key: 'input_type',
        label: 'Input type',
        choices: choices([
          'select',
          'multi_select',
          'boolean',
          'number',
          'text',
        ]),
      },
      state,
      sorting,
      ...[
        'required',
        'visible_sales',
        'visible_customer',
        'affects_pricing',
      ].map((key) => ({
        key,
        label: key.replaceAll('_', ' '),
        type: 'checkbox' as const,
      })),
      { key: 'help_text', label: 'Help text' },
      {
        key: 'default_options',
        label: 'Default options (Ctrl/Cmd for multiple)',
        type: 'multi',
        choices: catalog.options
          .filter((o) => o.attribute_id === record.id && o.status === 'active')
          .map((o) => ({ value: o.key, label: o.label })),
      },
      {
        key: 'dependency_parent',
        label: 'Show when question',
        nullable: true,
        choices: catalog.attributes
          .filter(
            (a) =>
              a.item_id === itemId &&
              a.id !== record.id &&
              ['select', 'multi_select'].includes(a.input_type),
          )
          .map((a) => ({ value: a.key, label: a.label })),
      },
      {
        key: 'dependency_operator',
        label: 'Condition',
        choices: choices(['equals', 'not_equals', 'in', 'not_in']),
      },
      {
        key: 'dependency_option',
        label: 'Condition option',
        nullable: true,
        choices: catalog.options
          .filter((o) => o.item_id === itemId)
          .map((o) => ({
            value: o.key,
            parentKey:
              catalog.attributes.find((a) => a.id === o.attribute_id)?.key ??
              '',
            label:
              (catalog.attributes.find((a) => a.id === o.attribute_id)?.label ??
                '') +
              ' / ' +
              o.label,
          })),
      },
    ];
  }
  if (entity === 'catalog_attribute_options') {
    initial = {
      item_id: itemId,
      attribute_id: '',
      key: '',
      label: '',
      description: '',
      ...initial,
    };
    fields = [
      { key: 'label', label: 'Option label', required: true },
      { key: 'key', label: 'Stable key', required: true },
      state,
      { key: 'description', label: 'Description' },
      sorting,
    ];
  }
  if (entity === 'price_books') {
    initial = {
      name: '',
      key: '',
      currency: '',
      branch_id: null,
      is_default: false,
      valid_from: new Date().toISOString(),
      valid_until: null,
      ...initial,
    };
    fields = [
      ...names,
      decimalField('currency', 'Currency (ISO code)'),
      select('branch_id', 'Branch', catalog.branches),
      {
        key: 'is_default',
        label: 'Default for this branch/currency',
        type: 'checkbox',
      },
      {
        key: 'valid_from',
        label: 'Effective from (ISO timestamp)',
        required: true,
      },
      {
        key: 'valid_until',
        label: 'Effective until (exclusive ISO timestamp)',
        nullable: true,
      },
    ];
  }
  if (entity === 'price_book_items') {
    initial = {
      item_id: itemId ?? '',
      price_book_id: null,
      currency: '',
      base_rate: '',
      minimum_rate: null,
      valid_from: '',
      valid_until: null,
      ...initial,
    };
    fields = [
      select('item_id', 'Item', itemRows, false),
      select('price_book_id', 'Price book (none = item default)', books),
      decimalField('currency', 'Currency (ISO code)'),
      decimalField('base_rate', 'Base selling rate'),
      decimalField('minimum_rate', 'Minimum selling rate', true),
      {
        key: 'valid_from',
        label: 'Effective from (ISO timestamp)',
        required: true,
      },
      {
        key: 'valid_until',
        label: 'Effective until (exclusive ISO timestamp)',
        nullable: true,
      },
      state,
    ];
  }
  if (entity === 'pricing_costs' && canCost) {
    initial = { rate_id: '', estimated_cost_rate: '', ...initial };
    fields = [
      {
        key: 'rate_id',
        label: 'Rate revision',
        choices: catalog.rates
          .filter((r) => !catalog.costs.some((c) => c.rate_id === r.id))
          .map((r) => ({
            value: r.id,
            label:
              (catalog.items.find((i) => i.id === r.item_id)?.name ?? '') +
              ' / ' +
              r.base_rate +
              ' / ' +
              r.valid_from,
          })),
      },
      decimalField('estimated_cost_rate', 'Estimated internal cost per unit'),
    ];
  }
  if (entity === 'pricing_modifiers') {
    initial = {
      item_id: itemId ?? '',
      option_id: null,
      price_book_id: null,
      label: '',
      kind: 'per_unit',
      value: '0',
      ...initial,
    };
    fields = [
      { key: 'label', label: 'Modifier label', required: true },
      select('item_id', 'Item', itemRows, false),
      {
        key: 'option_id',
        label: 'Applies to option (none = item)',
        nullable: true,
        choices: catalog.options
          .filter((o) => !itemId || o.item_id === itemId)
          .map((o) => ({
            value: o.id,
            label:
              (catalog.attributes.find((a) => a.id === o.attribute_id)?.label ??
                '') +
              ' / ' +
              o.label,
          })),
      },
      select('price_book_id', 'Price book context', books),
      {
        key: 'kind',
        label: 'Modifier type',
        choices: choices(['per_unit', 'fixed', 'percentage']),
      },
      decimalField('value', 'Modifier value'),
      state,
      sorting,
    ];
  }
  // Null values use empty controls; form submission restores declared nullable fields.
  for (const f of fields) if (initial[f.key] === null) initial[f.key] = '';
  return (
    <EntityForm
      key={String(record.id ?? title) + '-' + String(record.version ?? 1)}
      entity={entity}
      org={org}
      initial={initial}
      fields={fields}
      title={title}
      {...(replace ? { replace } : {})}
    />
  );
}
