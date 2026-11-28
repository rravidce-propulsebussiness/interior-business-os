/** Unknown sharing metadata must not masquerade as an empty quotation list. */
export function filterSharedQuotations<T extends { id: string }>(
  rows: T[],
  sharedOnly: boolean,
  sharingAvailable: boolean,
  sharedIds: ReadonlySet<string>,
): T[] {
  return sharedOnly && sharingAvailable
    ? rows.filter((row) => sharedIds.has(row.id))
    : rows;
}
