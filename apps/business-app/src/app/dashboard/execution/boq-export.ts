/**
 * BOQ export and order list: the whole-project list of materials and
 * labour to order, and a CSV (opens in Excel / Google Sheets) of the full
 * BOQ stage by stage. Pure functions so the page and tests share them.
 */

export type BoqExportRow = {
  /** Stage / floor: Foundation, Ground Floor … */
  stage: string;
  /** The BOQ line the quantity belongs to. */
  item: string;
  /** Material or work quantified. */
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  /** Cost head (Cement, Steel, Painting …). */
  head?: string | undefined;
  /** What to order, e.g. "66 boxes of 4". */
  order?: string | undefined;
  rods?: number | undefined;
  diameter?: number | undefined;
  weightKg?: number | undefined;
};

export type OrderLine = {
  name: string;
  unit: string;
  head: string;
  quantity: number;
  amount: number;
  /** Stages that need it, in BOQ order. */
  stages: string[];
  weightKg: number;
};

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/**
 * Totals of each material / work across every stage, grouped by cost head
 * in the given head order (else the order heads first appear), so the list
 * reads like a purchase list. Measured work with no material of its own
 * (walls, plaster, shuttering area …) is listed last: its cost is in the
 * materials and labour above.
 */
export const MEASURED_WORK_HEAD = 'Measured work (cost in materials & labour)';
export function materialsToOrder(
  rows: BoqExportRow[],
  headOrder: readonly string[] = [],
): OrderLine[] {
  const byKey = new Map<string, OrderLine>();
  for (const row of rows) {
    if (!(row.quantity > 0)) continue;
    // Measured site-mix m³ is a takeoff reference, not concrete to purchase.
    // Keep it in the BOQ detail while excluding it from material orders.
    if (
      row.rate === 0 &&
      row.unit === 'm³' &&
      /(?:reference only|volume only)/i.test(row.name)
    )
      continue;
    const key = `${row.name.trim().toLowerCase()}::${row.unit.trim().toLowerCase()}`;
    const prior = byKey.get(key);
    const line = prior ?? {
      name: row.name,
      unit: row.unit,
      head:
        (!row.head || row.head === 'Other') && !(row.rate > 0)
          ? MEASURED_WORK_HEAD
          : row.head || 'Other',
      quantity: 0,
      amount: 0,
      stages: [],
      weightKg: 0,
    };
    line.quantity += row.quantity;
    line.amount += row.quantity * (row.rate || 0);
    line.weightKg += row.weightKg ?? 0;
    if (!line.stages.includes(row.stage)) line.stages.push(row.stage);
    byKey.set(key, line);
  }
  const order = [...headOrder];
  for (const line of byKey.values())
    if (!order.includes(line.head) && line.head !== MEASURED_WORK_HEAD)
      order.push(line.head);
  order.push(MEASURED_WORK_HEAD);
  return [...byKey.values()]
    .map((line) => ({
      ...line,
      quantity: round(line.quantity),
      amount: round(line.amount),
      weightKg: round(line.weightKg),
    }))
    .sort((a, b) => order.indexOf(a.head) - order.indexOf(b.head));
}

/** A CSV cell, quoted, with spreadsheet formulas neutralised. */
export function csvCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(round(value)) : '';
  let text = value.replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",]/.test(text) || text !== text.trim()
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

const csvLine = (cells: (string | number | undefined | null)[]) =>
  cells.map(csvCell).join(',');

/**
 * The BOQ as CSV: a header block, every item stage by stage with stage
 * totals, the whole-project order list and the totals. Without cost access
 * rates and amounts are left out.
 */
export function boqCsv(input: {
  title: string;
  project?: string | undefined;
  quotation?: string | undefined;
  status?: string | undefined;
  rows: BoqExportRow[];
  includeCost: boolean;
  quotedValue?: number | undefined;
  builtUpSqft?: number | undefined;
  generatedOn?: string | undefined;
  /** Order of cost heads in the order list. */
  headOrder?: readonly string[] | undefined;
}): string {
  const { rows, includeCost } = input;
  const out: string[] = [];
  out.push(csvLine(['Bill of quantities', input.title]));
  if (input.project) out.push(csvLine(['Project', input.project]));
  if (input.quotation) out.push(csvLine(['Quotation', input.quotation]));
  if (input.status) out.push(csvLine(['Status', input.status]));
  if (input.builtUpSqft)
    out.push(csvLine(['Built-up area (sq ft)', input.builtUpSqft]));
  if (input.generatedOn) out.push(csvLine(['Exported on', input.generatedOn]));
  out.push('');
  out.push(
    csvLine([
      'Stage',
      'Item',
      'Material / work',
      'Quantity',
      'Unit',
      ...(includeCost ? ['Rate', 'Amount'] : []),
      'Order',
    ]),
  );
  const stages: string[] = [];
  for (const row of rows)
    if (!stages.includes(row.stage)) stages.push(row.stage);
  let total = 0;
  for (const stage of stages) {
    let stageTotal = 0;
    for (const row of rows) {
      if (row.stage !== stage || !(row.quantity > 0)) continue;
      const amount = row.quantity * (row.rate || 0);
      stageTotal += amount;
      out.push(
        csvLine([
          stage,
          row.item,
          row.name,
          row.quantity,
          row.unit,
          ...(includeCost ? [row.rate || 0, amount] : []),
          row.order ?? '',
        ]),
      );
    }
    total += stageTotal;
    if (includeCost)
      out.push(
        csvLine([`${stage} total`, '', '', '', '', '', Math.round(stageTotal)]),
      );
  }
  out.push('');
  out.push(csvLine(['Materials and work to order, whole project']));
  out.push(
    csvLine([
      'Head',
      'Material / work',
      'Quantity',
      'Unit',
      ...(includeCost ? ['Amount'] : []),
      'Stages',
    ]),
  );
  for (const line of materialsToOrder(
    rows.filter((row) => row.head !== 'Labour'),
    input.headOrder,
  ))
    out.push(
      csvLine([
        line.head,
        line.name,
        line.quantity,
        line.unit,
        ...(includeCost ? [line.amount] : []),
        line.stages.join(' / '),
      ]),
    );
  if (includeCost) {
    out.push('');
    const material = rows
      .filter((row) => row.head !== 'Labour')
      .reduce((sum, row) => sum + row.quantity * (row.rate || 0), 0);
    const labour = rows
      .filter((row) => row.head === 'Labour')
      .reduce((sum, row) => sum + row.quantity * (row.rate || 0), 0);
    out.push(csvLine(['Material cost estimate', Math.round(material)]));
    out.push(csvLine(['Labour cost estimate', Math.round(labour)]));
    out.push(csvLine(['Total cost estimate', Math.round(total)]));
    if (input.builtUpSqft)
      out.push(csvLine(['Cost per sq ft', round(total / input.builtUpSqft)]));
    if (input.quotedValue && input.quotedValue > 0) {
      out.push(csvLine(['Quotation value', round(input.quotedValue)]));
      out.push(
        csvLine(['Margin over cost', Math.round(input.quotedValue - total)]),
      );
    }
  }
  return out.join('\r\n') + '\r\n';
}

/** A safe file name for the download. */
export function boqFileName(title: string, extension = 'csv') {
  const base =
    title
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'BOQ';
  return `${base}.${extension}`;
}
