import { COST_HEADS, QUANTITY_HEADS, type CostHead } from './boq-pricing';

export type CostSummaryRow = {
  head: string;
  /** Purchase quantity for heads bought by a single unit (kg, bag, t …). */
  quantity: number | null;
  unit: string | null;
  amount: number;
};

type SummaryInput = {
  head?: string | undefined;
  quantity: number;
  unit: string;
  rate: number;
  weightKg?: number | undefined;
};

const order = (head: string) => {
  const index = COST_HEADS.indexOf(head as CostHead);
  return index < 0 ? COST_HEADS.length : index;
};

/**
 * Cost per head (Steel, Cement, Sand …) across the whole BOQ, with the total
 * purchase quantity where the head is bought by one unit. Steel is summed in
 * kg from the rod weights.
 */
export function costSummaryByHead(
  rows: readonly SummaryInput[],
): CostSummaryRow[] {
  const byHead = new Map<string, CostSummaryRow>();
  for (const row of rows) {
    const head = row.head || 'Other';
    const amount = row.quantity * row.rate;
    const unit = QUANTITY_HEADS[head as CostHead] ?? null;
    const prior = byHead.get(head) ?? {
      head,
      quantity: unit ? 0 : null,
      unit,
      amount: 0,
    };
    prior.amount += Number.isFinite(amount) ? amount : 0;
    if (prior.quantity !== null) {
      if (head === 'Steel' && row.weightKg) prior.quantity += row.weightKg;
      else if (row.unit === unit) prior.quantity += row.quantity;
    }
    byHead.set(head, prior);
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return [...byHead.values()]
    .map((row) => ({
      ...row,
      amount: round(row.amount),
      quantity: row.quantity === null ? null : round(row.quantity),
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => order(a.head) - order(b.head) || b.amount - a.amount);
}
