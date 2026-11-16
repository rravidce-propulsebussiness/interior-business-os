/** Quotation snapshots remain in the contract and document archive.
 * Only executable agreement/design/site work appears in the project timeline.
 */
export function projectTimelineStages<T extends { template_code: string }>(
  stages: readonly T[],
): T[] {
  return stages.filter(
    (stage) => !stage.template_code.startsWith('QUOTED_SCOPE'),
  );
}
