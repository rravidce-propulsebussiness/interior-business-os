/** Customer-facing milestone rows must come from a saved quotation revision,
 * never from an unapproved example schedule.
 */
export type StagePaymentMilestone = { name: string; percent: number };

export function savedStagePaymentPlan(
  terms: string,
): StagePaymentMilestone[] | null {
  const match = terms.match(
    /\[STAGE_PAYMENT_PLAN\]([\s\S]*?)\[\/STAGE_PAYMENT_PLAN\]/,
  );
  if (!match) return null;
  const lines = (match[1] ?? '').trim().split(/\r?\n/);
  if (!lines.length || lines.length > 40) return null;
  const result: StagePaymentMilestone[] = [];
  for (const line of lines) {
    const index = line.lastIndexOf('|');
    if (index < 1) return null;
    const name = line.slice(0, index).trim();
    const rawPercent = line.slice(index + 1).trim();
    const percent = Number(rawPercent);
    if (
      !name ||
      name.length > 100 ||
      !/^\d+(?:\.\d{1,2})?$/.test(rawPercent) ||
      !Number.isFinite(percent) ||
      percent <= 0 ||
      percent > 100
    )
      return null;
    result.push({ name, percent });
  }
  const total = result.reduce((sum, row) => sum + row.percent, 0);
  return Math.abs(total - 100) < 0.001 ? result : null;
}

export const hasSavedStagePaymentPlan = (terms: string) =>
  savedStagePaymentPlan(terms) !== null;

/**
 * Optional immutable quote-stage associations saved alongside the customer
 * payment lines. A stage association is a scope reference only; it never
 * authorizes invoicing, collection, or automatic progress certification.
 * Legacy quotes without this block remain valid and unlinked.
 */
export function savedStagePaymentLinks(terms: string): string[][] | null {
  const plan = savedStagePaymentPlan(terms);
  const marker = terms.match(
    /\[STAGE_PAYMENT_LINKS\]([\s\S]*?)\[\/STAGE_PAYMENT_LINKS\]/g,
  );
  if (!marker?.length) return null;
  if (marker.length !== 1 || !plan) return null;
  const raw = marker[0]!
    .replace(/^\[STAGE_PAYMENT_LINKS\]/, '')
    .replace(/\[\/STAGE_PAYMENT_LINKS\]$/, '')
    .trim();
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded) || decoded.length !== plan.length) return null;
    const result: string[][] = [];
    for (const row of decoded) {
      if (
        !Array.isArray(row) ||
        row.length > 18 ||
        !row.every(
          (x) =>
            typeof x === 'string' &&
            /^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]*)?$/.test(x) &&
            x.length <= 120,
        ) ||
        new Set(row).size !== row.length
      )
        return null;
      result.push(row);
    }
    return result;
  } catch {
    return null;
  }
}

export function encodeStagePaymentLinks(
  linked: readonly (readonly string[])[],
): string {
  const result = JSON.stringify(linked);
  if (
    !linked.length ||
    linked.length > 40 ||
    result.length > 8000 ||
    linked.some(
      (row) =>
        row.length > 18 ||
        new Set(row).size !== row.length ||
        row.some(
          (key) =>
            key.length > 120 ||
            !/^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]*)?$/.test(key),
        ),
    )
  )
    throw new Error('Invalid construction stage associations');
  return '[STAGE_PAYMENT_LINKS]\n' + result + '\n[/STAGE_PAYMENT_LINKS]';
}
