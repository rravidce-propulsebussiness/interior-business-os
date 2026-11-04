export type RevisionCostRow = {
  line_id: string;
  estimated_cost: string;
  currency: string;
};
function asNumber(value: unknown) {
  const n = Number(value);
  return value === null ||
    value === undefined ||
    value === '' ||
    !Number.isFinite(n)
    ? null
    : n;
}
export type CostSummary = {
  total: number | null;
  priced: number;
  unpriced: number;
  currency: string;
  complete: boolean;
};
export function calculateRevisionCost(
  lines: readonly { id: string }[],
  costs: readonly {
    line_id: string;
    estimated_cost: string;
    currency: string;
  }[],
  currency: string,
  fullyLoaded: boolean,
): CostSummary {
  const valid = new Map(costs.map((cost) => [cost.line_id, cost]));
  const priced = lines.filter((line) => valid.has(line.id)).length;
  const unpriced = lines.length - priced;
  const allCurrency = costs.every((cost) => cost.currency === currency);
  const allNumeric = costs.every(
    (cost) => asNumber(cost.estimated_cost) !== null,
  );
  const complete =
    fullyLoaded &&
    unpriced === 0 &&
    allCurrency &&
    allNumeric &&
    lines.length > 0;
  return {
    total: complete
      ? lines.reduce(
          (sum, line) =>
            sum + (asNumber(valid.get(line.id)?.estimated_cost) ?? 0),
          0,
        )
      : null,
    priced,
    unpriced,
    currency,
    complete,
  };
}
