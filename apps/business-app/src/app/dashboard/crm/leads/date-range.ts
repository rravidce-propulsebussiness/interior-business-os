/** Calendar periods for the company's preferred timezone.
 * DB search uses date-only bounds: created_at >= from and created_at < until + 1 day.
 * A "week" runs Monday-Sunday, and "last month" means the previous calendar month.
 */
export type LeadDateRange =
  '' | 'last_week' | 'last_month' | 'this_month' | 'custom';

export function leadDateRangeSelection(input: {
  range?: string | undefined;
  from?: string | undefined;
  until?: string | undefined;
}): LeadDateRange {
  if (
    input.range === 'last_week' ||
    input.range === 'last_month' ||
    input.range === 'this_month' ||
    input.range === 'custom'
  )
    return input.range;
  // Keep older shared URLs with explicit dates usable after the UI cleanup.
  return input.from || input.until ? 'custom' : '';
}

function validISODate(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    return undefined;
  return value;
}

function calendarToday(now: Date, timeZone: string): Date {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timeZone);
  } catch {
    parts = format('Asia/Kolkata');
  }
  const part = (name: string) =>
    Number(parts.find((entry) => entry.type === name)?.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
}

const iso = (day: Date) => day.toISOString().slice(0, 10);
const utcDay = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day));

/** Returns inclusive date-only boundaries, or nothing for all-time.
 * Date filtering itself stays on the server; browsers never set clock-dependent bounds.
 */
export function leadDateBounds(
  input: {
    range?: string | undefined;
    from?: string | undefined;
    until?: string | undefined;
  },
  timeZone: string,
  now: Date = new Date(),
): { from?: string; until?: string } {
  const range = leadDateRangeSelection(input);
  if (range === 'custom') {
    const from = validISODate(input.from);
    const until = validISODate(input.until);
    if (from && until && from > until) return {};
    return {
      ...(from ? { from } : {}),
      ...(until ? { until } : {}),
    };
  }
  if (!range) return {};
  const today = calendarToday(now, timeZone);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  if (range === 'this_month') {
    return { from: iso(utcDay(year, month, 1)), until: iso(today) };
  }
  if (range === 'last_month') {
    return {
      from: iso(utcDay(year, month - 1, 1)),
      until: iso(utcDay(year, month, 0)),
    };
  }
  // Last *calendar* week (Monday through Sunday), not rolling seven days.
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  return {
    from: iso(utcDay(year, month, today.getUTCDate() - mondayOffset - 7)),
    until: iso(utcDay(year, month, today.getUTCDate() - mondayOffset - 1)),
  };
}
