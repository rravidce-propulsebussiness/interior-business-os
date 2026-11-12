import type { Stage, StageItemPlan, StageItemRecord, StageExecution } from './project-v2-data';

const asText = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export type TimelineFeedItem = {
  stage: Stage;
  plan: StageItemPlan;
  status: string;
  blockers: string[];
};

/** Builds a read-only chronological view from the existing stage snapshot,
 * execution records, and item schedule. It never creates or advances work. */
export function projectTimelineFeed(input: {
  stages: readonly Stage[];
  plans: readonly StageItemPlan[];
  work: readonly StageItemRecord[];
  checks: readonly StageItemRecord[];
  execution: readonly StageExecution[];
}): TimelineFeedItem[] {
  const stages = new Map(input.stages.map(stage => [stage.id, stage]));
  const execution = new Map(input.execution.map(row => [row.stageId, row]));
  return input.plans
    .flatMap(plan => {
      const stage = stages.get(plan.stageId);
      if (!stage || !plan.plannedStart || !plan.plannedFinish) return [];
      const records = plan.kind === 'work' ? input.work : input.checks;
      const record = records.find(row => asText(row.stage_id) === plan.stageId &&
        Number(row.index) === plan.index);
      const gate = execution.get(plan.stageId);
      return [{
        stage,
        plan,
        status: asText(record?.status) || 'scheduled',
        blockers: gate?.blockers ?? [],
      }];
    })
    .sort((a, b) => a.plan.plannedStart.localeCompare(b.plan.plannedStart) ||
      a.stage.sequence - b.stage.sequence ||
      a.plan.index - b.plan.index ||
      a.plan.kind.localeCompare(b.plan.kind));
}
