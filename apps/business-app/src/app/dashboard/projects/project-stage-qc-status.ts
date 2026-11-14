export type StageQcStatusRecord = {
  id: string;
  index: number;
  decision: string;
  reviewed_at: string;
};

/** Reflect item-level on-site QC in the milestone badge without claiming
 * independent stage certification, which is a separate approval workflow.
 */
export function displayStageQcStatus(
  executionStatus: string,
  inspectionTopics: string[],
  records: StageQcStatusRecord[],
): string {
  if (executionStatus !== 'ready_for_qc' || inspectionTopics.length === 0) {
    return executionStatus;
  }

  const latestByIndex = new Map<number, StageQcStatusRecord>();
  for (const record of records) {
    const current = latestByIndex.get(record.index);
    if (
      !current ||
      record.reviewed_at.localeCompare(current.reviewed_at) > 0 ||
      (record.reviewed_at === current.reviewed_at && record.id > current.id)
    ) {
      latestByIndex.set(record.index, record);
    }
  }

  return inspectionTopics.every(
    (_, index) => latestByIndex.get(index)?.decision === 'passed',
  )
    ? 'qc_passed'
    : executionStatus;
}
