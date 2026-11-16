import type { StageItemPlan } from './project-v2-data';

export type StagePlanPreview = {
  count: number;
  start: string | null;
  finish: string | null;
  overlapsAnotherStage: boolean;
  hasWorkToday: boolean;
};
/**
 * Display-only summary of the EXISTING canonical schedule rows.
 * Dates can overlap across stages; there is deliberately no dependency gate
 * in the planning layer. Execution / QC authorization remains independent.
 */
export function stagePlanPreview(
  plans: readonly StageItemPlan[],
  stageId: string,
  today: string,
): StagePlanPreview {
  const ours = plans.filter(
    (p) => p.stageId === stageId && p.plannedStart && p.plannedFinish,
  );
  if (!ours.length)
    return {
      count: 0,
      start: null,
      finish: null,
      overlapsAnotherStage: false,
      hasWorkToday: false,
    };
  const ordered = [...ours].sort((a, b) =>
    a.plannedStart.localeCompare(b.plannedStart),
  );
  const start = ordered[0]!.plannedStart;
  const finish = ours.reduce(
    (max, row) => (row.plannedFinish > max ? row.plannedFinish : max),
    ordered[0]!.plannedFinish,
  );
  // An overlap refers to actual dates on distinct stage items (not payment
  // milestones); touching the same day counts as overlapping.
  const overlapsAnotherStage = ours.some((item) =>
    plans.some(
      (other) =>
        other.stageId !== stageId &&
        other.plannedStart &&
        other.plannedFinish &&
        item.plannedStart <= other.plannedFinish &&
        other.plannedStart <= item.plannedFinish,
    ),
  );
  return {
    count: ours.length,
    start,
    finish,
    overlapsAnotherStage,
    hasWorkToday: ours.some(
      (item) => item.plannedStart <= today && item.plannedFinish >= today,
    ),
  };
}
