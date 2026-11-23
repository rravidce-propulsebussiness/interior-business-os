/**
 * Plaster material quantities come from measured wall faces and coat
 * specification, never independent manual overrides.
 */
export function isAutoPlasterQuantity(
  kind: string,
  outputName: string,
): boolean {
  return kind === 'quote-masonry' &&
    (outputName === 'Cement (plaster)' ||
      outputName === 'Sand (plaster)');
}

type PlasterOutput = { name: string; unit: string };
type PlasterLine = {
  section: string;
  kind: string;
  outputs: readonly PlasterOutput[];
};

/** Never carry stale manual plaster quantities across wall regenerations.
 * Price overrides remain intact. Returns original object when unchanged.
 */
export function clearDerivedPlasterQuantityOverrides(
  lines: readonly PlasterLine[],
  overrides: Readonly<Record<string, { quantity?: number; rate?: number }>>,
) {
  let next: Record<string, { quantity?: number; rate?: number }> | null = null;
  for (const line of lines) {
    for (const output of line.outputs) {
      if (!isAutoPlasterQuantity(line.kind, output.name)) continue;
      const key = [line.section, line.kind, output.name, output.unit]
        .join('|')
        .slice(0, 300);
      const existing = overrides[key];
      if (!existing || existing.quantity === undefined) continue;
      next ??= { ...overrides };
      if (existing.rate !== undefined)
        next[key] = { rate: existing.rate };
      else delete next[key];
    }
  }
  return next ?? overrides;
}
