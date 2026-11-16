/** Stable internal floor identifier for linking a quoted floor to its stages. */
export function quotedConstructionFloorCode(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (/^[A-Z]/.test(normalized) ? normalized : 'F_' + normalized).slice(
    0,
    50,
  );
}
