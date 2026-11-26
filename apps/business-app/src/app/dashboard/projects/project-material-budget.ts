/** Material spend by source (marketplace / outside supplier) against the
 * project BOQ's material-wise budget. */

export type MaterialBudgetRow = {
  head: string;
  quantity: number | null;
  unit: string | null;
  amount: number;
};

export type MaterialOrderInput = {
  item: string;
  status: string;
  source: string;
  orderAmount: number | null;
  marketplaceTotal: number | null;
  marketplaceStatus: string;
};

export type ProcurementBudgetRow = {
  head: string;
  boqAmount: number;
  boqQuantity: number | null;
  unit: string | null;
  marketplace: number;
  outside: number;
  ordered: number;
  balance: number;
  /** Ordered requests in this head with no amount recorded yet. */
  unpriced: number;
};

const HEAD_PATTERNS: readonly [RegExp, string][] = [
  [/scaffold/, 'Scaffolding'],
  [/waterproof/, 'Waterproofing'],
  [
    /\brmc\b|ready.?mix|\bm\s?(?:20|25|30|35|40|45|50|55|60)\b/,
    'Concrete (RMC)',
  ],
  [/steel|tmt|\brods?\b|\bbars?\b|binding wire|fe\s?500/, 'Steel'],
  [/cement|\bopc\b|\bppc\b/, 'Cement'],
  [/\bsand\b|m-?sand|robo/, 'Sand'],
  [/aggregate|jelly|chips|\bmetal\b/, 'Aggregate'],
  [/brick|block/, 'Bricks'],
  [/stair.*granite|granite.*stair/, 'Staircase granite'],
  [/kitchen|sink|platform/, 'Kitchen (granite, tiles, sink)'],
  [/parking/, 'Parking tiles'],
  [/bath\w* tile|wall tile|toilet tile/, 'Bathroom tiles'],
  [/tile|vitrified|granite|marble/, 'Room flooring tiles'],
  [/door|window|upvc|\bshutters?\b|\bgate\b|ventilator/, 'Doors & windows'],
  [/paint|putty|primer|emulsion/, 'Painting'],
  [/wire|cable|switch|socket|\bmcb\b|conduit|electric|db box/, 'Electrical'],
  [
    /sanitary|commode|\btaps?\b|faucet|cp fitting|wash ?basin|shower/,
    'Sanitary & CP fittings',
  ],
  [/cpvc|\bpvc\b|\bswr\b|pipe|plumb|valve|trap/, 'Plumbing'],
  [/tank|sump/, 'Water storage'],
];

/** BOQ cost head a free-text material request belongs to. */
export function materialHeadForRequest(item: string): string {
  const text = item.toLowerCase();
  return HEAD_PATTERNS.find(([pattern]) => pattern.test(text))?.[1] ?? 'Other';
}

// Marketplace orders are requested, accepted or rejected by the seller.
const ACTIVE_MARKETPLACE = new Set(['requested', 'accepted']);

/** Amount committed by one request, by where it was bought. */
export function orderSpend(order: MaterialOrderInput): {
  marketplace: number;
  outside: number;
  unpriced: boolean;
} {
  if (
    order.marketplaceTotal !== null &&
    ACTIVE_MARKETPLACE.has(order.marketplaceStatus)
  )
    return { marketplace: order.marketplaceTotal, outside: 0, unpriced: false };
  if (!['ordered', 'received'].includes(order.status))
    return { marketplace: 0, outside: 0, unpriced: false };
  if (order.orderAmount === null)
    return { marketplace: 0, outside: 0, unpriced: true };
  return order.source === 'marketplace'
    ? { marketplace: order.orderAmount, outside: 0, unpriced: false }
    : { marketplace: 0, outside: order.orderAmount, unpriced: false };
}

/** One row per material head in the BOQ or in the orders. */
export function procurementVsBoq(
  budget: readonly MaterialBudgetRow[] | null,
  orders: readonly MaterialOrderInput[],
): ProcurementBudgetRow[] {
  const rows = new Map<string, ProcurementBudgetRow>();
  const row = (head: string) => {
    const existing = rows.get(head);
    if (existing) return existing;
    const created: ProcurementBudgetRow = {
      head,
      boqAmount: 0,
      boqQuantity: null,
      unit: null,
      marketplace: 0,
      outside: 0,
      ordered: 0,
      balance: 0,
      unpriced: 0,
    };
    rows.set(head, created);
    return created;
  };
  for (const item of budget ?? []) {
    const target = row(
      item.head === 'Concrete (M20)' ? 'Concrete (RMC)' : item.head,
    );
    target.boqAmount += item.amount;
    target.boqQuantity = item.quantity;
    target.unit = item.unit;
  }
  for (const order of orders) {
    const spend = orderSpend(order);
    if (!spend.marketplace && !spend.outside && !spend.unpriced) continue;
    const target = row(materialHeadForRequest(order.item));
    target.marketplace += spend.marketplace;
    target.outside += spend.outside;
    if (spend.unpriced) target.unpriced += 1;
  }
  return [...rows.values()].map((item) => {
    const ordered = item.marketplace + item.outside;
    return { ...item, ordered, balance: item.boqAmount - ordered };
  });
}
