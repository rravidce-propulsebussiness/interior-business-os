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
