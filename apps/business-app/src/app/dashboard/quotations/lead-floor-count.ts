/**
 * The CRM stores floor selection as ground/g1/g2/g3plus.
 * This is a quotation editor INITIAL value, never an irreversible floor lock.
 */
export function quoteFloorsFromLead(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const requirements = value as Record<string, unknown>;
  const raw = requirements.floors ?? requirements.floor_count ?? requirements.number_of_floors;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 8) return raw;
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase().replace(/\s+/g,'');
  const fixed: Record<string,number> = {
    ground:1,groundfloor:1,g:1,g0:1,'g+0':1,
    g1:2,'g+1':2,g2:3,'g+2':3,g3:4,'g+3':4,
    g3plus:4,'g+3plus':4,'g+3+':4
  };
  if (fixed[v]) return fixed[v];
  if (/^[1-8]$/.test(v)) return Number(v);
  return null;
}

export function leadFloorLabel(count: number | null): string {
  return count === null ? '' : count === 1 ? 'Ground only' : count >= 4 ? `${count} floors (editable)` : `${count} floors`;
}
