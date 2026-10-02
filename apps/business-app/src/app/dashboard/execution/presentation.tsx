import Link from 'next/link';
import type { ExecutionRecord } from '@business-os/core/execution';
export const titles: Record<string, string> = {
  material_categories: 'Material categories',
  materials: 'Materials',
  material_variants: 'Material variants',
  material_unit_conversions: 'Units and conversions',
  material_cost_revisions: 'Material cost history',
  vendors: 'Vendors',
  vendor_contacts: 'Vendor contacts',
  vendor_materials: 'Vendor materials',
  estimation_recipes: 'Recipes',
  estimation_recipe_items: 'Recipe components',
  estimation_recipe_item_costs: 'Recipe service costs',
  execution_estimates: 'Estimates',
  execution_estimate_revisions: 'Estimate revisions',
  execution_estimate_scope_items: 'Execution scope',
  execution_estimate_lines: 'Requirements',
  execution_estimate_line_costs: 'Estimated costs',
  purchase_requisitions: 'Purchase requisitions',
  purchase_requisition_items: 'Requisition items',
  purchase_requisition_sources: 'Source allocations',
  rfqs: 'Requests for quotation',
  rfq_vendors: 'Invited vendors',
  rfq_items: 'Requested items',
  vendor_quotes: 'Vendor quotes',
  vendor_quote_items: 'Quoted items',
  purchase_orders: 'Purchase orders',
  purchase_order_items: 'Ordered items',
  purchase_order_costs: 'Purchase commitments',
  purchase_order_item_costs: 'Ordered costs',
  goods_receipts: 'Goods and service receipts',
  goods_receipt_items: 'Received items',
};
export const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export const record = (value: unknown): ExecutionRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ExecutionRecord)
    : {};
export const records = (value: unknown): ExecutionRecord[] =>
  Array.isArray(value) ? value.map(record) : [];
export function label(row: ExecutionRecord) {
  return (
    text(
      row.name ||
        row.estimate_number ||
        row.requisition_number ||
        row.rfq_number ||
        row.po_number ||
        row.receipt_number ||
        row.reference ||
        row.description ||
        record(row.snapshot).name,
    ) ||
    (row.revision_number
      ? `Revision ${text(row.revision_number)}`
      : 'Open record')
  );
}
export function RecordTable({
  rows,
  entity,
  columns = ['status', 'code', 'quantity', 'unit', 'planned_purchase_quantity'],
}: {
  rows: ExecutionRecord[];
  entity: string;
  columns?: string[];
}) {
  const visible = columns.filter((key) =>
    rows.some((row) => row[key] !== undefined && row[key] !== null),
  );
  if (!rows.length)
    return <p className="my-4 text-muted-foreground">No records yet.</p>;
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="border-b p-2">Record</th>
            {visible.map((key) => (
              <th className="border-b p-2" key={key}>
                {key.replaceAll('_', ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={text(row.id)}>
              <td className="border-b p-2">
                <Link
                  className="underline"
                  href={`/dashboard/execution/${entity}/${text(row.id)}`}
                >
                  {label(row)}
                </Link>
              </td>
              {visible.map((key) => (
                <td className="border-b p-2" key={key}>
                  {text(row[key]).replaceAll('_', ' ') || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
