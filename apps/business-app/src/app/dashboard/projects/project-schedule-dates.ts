/** Calendar-date offsets for project plans; no browser locale or UTC/local shift. */
export function offsetPlanDate(iso: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isInteger(days)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const at = new Date(Date.UTC(year!, month! - 1, day!));
  if (!Number.isFinite(at.getTime()) || at.toISOString().slice(0, 10) !== iso)
    return '';
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
