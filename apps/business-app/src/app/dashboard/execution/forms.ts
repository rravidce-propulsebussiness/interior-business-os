import 'server-only';
import type {
  ExecutionEntity,
  ExecutionRecord,
} from '@business-os/core/execution';
import { executionPermissions } from '@business-os/core/execution';
import type { ExecutionField } from './form';
import { label, text } from './presentation';
import type { executionServices } from './service';
type Services = Awaited<ReturnType<typeof executionServices>>;
const field = (
  key: string,
  label: string,
  required = false,
): ExecutionField => ({ key, label, required });
export const statusField: ExecutionField = {
  key: 'status',
  label: 'Status',
  options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
};
export async function choices(
  s: Services,
  entity: ExecutionEntity,
  filter: Record<string, string> = {},
) {
  if (!s.allowed(executionPermissions[entity])) return [];
  const first = await s.execution.search(entity, filter);
  const pages = Math.min(10, Math.ceil(first.total / 25));
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
      s.execution.search(entity, filter, i + 2),
    ),
  );
  return [...first.rows, ...rest.flatMap((page) => page.rows)].map((row) => ({
    value: text(row.id),
    label: `${label(row)}${row.code ? ` (${text(row.code)})` : ''}`,
  }));
}
/** Load every document page so editing cannot silently discard later items. */
export async function documentItems(
  s: Services,
  entity: ExecutionEntity,
  filter: Record<string, string | undefined>,
) {
  const first = await s.execution.search(entity, filter);
  if (first.total > 1000)
    throw new Error('Document exceeds supported item limit');
  const pages = await Promise.all(
    Array.from(
      { length: Math.max(0, Math.ceil(first.total / 25) - 1) },
      (_, i) => s.execution.search(entity, filter, i + 2),
    ),
  );
  return {
    ...first,
    rows: [...first.rows, ...pages.flatMap((page) => page.rows)],
  };
}
export const configurationEntities = [
  'material_categories',
  'materials',
  'material_variants',
  'material_unit_conversions',
  'vendors',
  'vendor_contacts',
  'vendor_materials',
] as const;
export function configurationPermission(entity: string) {
  return entity.startsWith('vendor') ? 'vendor.manage' : 'material.manage';
}
export async function configurationFields(
  s: Services,
  entity: string,
  current: ExecutionRecord = {},
): Promise<{ fields: ExecutionField[]; defaults: ExecutionRecord }> {
  const select = async (
    key: string,
    name: string,
    source: ExecutionEntity,
    optional = false,
  ): Promise<ExecutionField> => {
    const options = await choices(s, source, { status: 'active' });
    const selected = text(current[key]);
    if (selected && !options.some((option) => option.value === selected)) {
      const row = await s.execution.detail(source, selected);
      options.push({ value: selected, label: label(row) });
    }
    return {
      key,
      label: name,
      required: !optional,
      optional,
      options: [
        { value: '', label: optional ? 'None' : 'Select…' },
        ...options,
      ],
    };
  };
  switch (entity) {
    case 'material_categories':
      return {
        fields: [
          field('name', 'Category name', true),
          field('code', 'Category code', true),
          statusField,
        ],
        defaults: { status: 'active' },
      };
    case 'materials':
      return {
        fields: [
          await select('category_id', 'Category', 'material_categories'),
          field('name', 'Material name', true),
          field('code', 'Material code', true),
          field('brand', 'Brand'),
          field('manufacturer', 'Manufacturer'),
          { key: 'description', label: 'Description', type: 'textarea' },
          statusField,
        ],
        defaults: { status: 'active' },
      };
    case 'material_variants':
      return {
        fields: [
          await select('material_id', 'Material', 'materials'),
          field('name', 'Variant name', true),
          field('code', 'Variant code', true),
          field('attributes.thickness', 'Thickness and unit'),
          field('attributes.width', 'Width and unit'),
          field('attributes.length', 'Length and unit'),
          field('attributes.finish', 'Finish'),
          field('default_waste', 'Default waste (%)', true),
          statusField,
        ],
        defaults: { default_waste: '0', status: 'active' },
      };
    case 'material_unit_conversions':
      return {
        fields: [
          await select('variant_id', 'Material variant', 'material_variants'),
          field('purchase_unit', 'Purchase unit (for example sheet)', true),
          field(
            'consumption_unit',
            'Consumption unit (for example sqft)',
            true,
          ),
          field(
            'consumption_per_purchase',
            'Consumption units per purchase unit',
            true,
          ),
          field('purchase_increment', 'Purchase increment', true),
          {
            key: 'reason',
            label: 'Conversion source / reason',
            required: true,
            type: 'textarea',
          },
        ],
        defaults: { purchase_increment: '1' },
      };
    case 'vendors':
      return {
        fields: [
          field('name', 'Vendor name', true),
          field('code', 'Vendor code', true),
          field('legal_name', 'Legal name'),
          field('phone', 'Phone'),
          field('email', 'Email'),
          field('billing_address.line1', 'Address'),
          field('billing_address.city', 'City'),
          field('billing_address.postal_code', 'Postal code'),
          field('tax_identifier', 'Tax identifier'),
          { key: 'payment_terms', label: 'Payment terms', type: 'textarea' },
          { key: 'notes', label: 'Notes', type: 'textarea' },
          statusField,
        ],
        defaults: { status: 'active' },
      };
    case 'vendor_contacts':
      return {
        fields: [
          await select('vendor_id', 'Vendor', 'vendors'),
          field('name', 'Contact name', true),
          field('role', 'Role'),
          field('phone', 'Phone'),
          field('email', 'Email'),
          statusField,
        ],
        defaults: { status: 'active' },
      };
    case 'vendor_materials':
      return {
        fields: [
          await select('vendor_id', 'Vendor', 'vendors'),
          await select('variant_id', 'Material variant', 'material_variants'),
          field('vendor_description', 'Vendor description'),
          field('minimum_order', 'Minimum order quantity', true),
          field('pack_quantity', 'Vendor pack quantity', true),
          { key: 'lead_time_days', label: 'Lead time (days)', type: 'integer' },
          { key: 'preferred', label: 'Preferred supplier', type: 'checkbox' },
          statusField,
        ],
        defaults: {
          minimum_order: '0',
          pack_quantity: '1',
          lead_time_days: 0,
          preferred: false,
          status: 'active',
        },
      };
    default:
      throw new Error('Unsupported configuration');
  }
}
