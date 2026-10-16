/** Customer-facing milestone rows must come from a saved quotation revision,
 * never from an unapproved example schedule.
 */
export type StagePaymentMilestone = { name: string; percent: number };

export function savedStagePaymentPlan(terms: string): StagePaymentMilestone[] | null {
  const match = terms.match(/\[STAGE_PAYMENT_PLAN\]([\s\S]*?)\[\/STAGE_PAYMENT_PLAN\]/);
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
    if (!name || name.length > 100 || !/^\d+(?:\.\d{1,2})?$/.test(rawPercent) ||
        !Number.isFinite(percent) || percent <= 0 || percent > 100) return null;
    result.push({ name, percent });
  }
  const total = result.reduce((sum, row) => sum + row.percent, 0);
  return Math.abs(total - 100) < 0.001 ? result : null;
}

export const hasSavedStagePaymentPlan = (terms: string) =>
  savedStagePaymentPlan(terms) !== null;
