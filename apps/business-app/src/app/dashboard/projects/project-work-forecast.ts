/** A read-only forecast from the original stage work and actual completion.
 * No stage activation, approval or schedule mutation happens here. */
export type PlannedWork = {
  stageId: string;
  kind: string;
  index: number;
  plannedStart: string;
  plannedFinish: string;
};
export type CompletedWork = Record<string, unknown>;
type WorkStage = { id: string; activities: string[] };
export type WorkPace = {
  completed: number;
  total: number;
  progressPct: number;
  scheduled: number;
  scheduledCompleted: number;
  due: number;
  late: number;
  early: number;
  expectedPct: number | null;
  scheduledActualPct: number | null;
  pace: 'not_planned' | 'completed' | 'ahead' | 'on_track' | 'delayed';
  originalFinish: string | null;
  forecastFinish: string | null;
};
const DAY = 86400000;
function dateNumber(d: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const date = Date.parse(d + 'T00:00:00Z');
  return Number.isFinite(date) ? date : null;
}
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
export function forecastWork(
  stages: readonly WorkStage[],
  plans: readonly PlannedWork[],
  completedRecords: readonly CompletedWork[],
  today: string,
): WorkPace {
  const items = new Map(
    stages.flatMap((stage) =>
      stage.activities.map(
        (_, index) => [stage.id + ':' + index, true] as const,
      ),
    ),
  );
  const done = new Set(
    completedRecords
      .filter((record) => record.status === 'completed')
      .map((record) => String(record.stage_id) + ':' + String(record.index))
      .filter((key) => items.has(key)),
  );
  const planned = new Map<string, PlannedWork>();
  for (const row of plans)
    if (row.kind === 'work') {
      const key = row.stageId + ':' + row.index;
      const start = dateNumber(row.plannedStart),
        end = dateNumber(row.plannedFinish);
      if (items.has(key) && start !== null && end !== null && end >= start)
        planned.set(key, row);
    }
  const count = items.size,
    completed = done.size;
  const list = [...planned.entries()];
  const scheduled = list.length,
    scheduledCompleted = list.filter(([key]) => done.has(key)).length;
  const due = list.filter(([, p]) => p.plannedFinish <= today).length;
  const late = list.filter(
    ([key, p]) => p.plannedFinish < today && !done.has(key),
  ).length;
  const early = list.filter(
    ([key, p]) => p.plannedFinish > today && done.has(key),
  ).length;
  const originalFinish = scheduled
    ? (list
        .map(([, p]) => p.plannedFinish)
        .sort()
        .at(-1) ?? null)
    : null;
  const expectedPct = scheduled ? Math.round((due / scheduled) * 100) : null;
  const scheduledActualPct = scheduled
    ? Math.round((scheduledCompleted / scheduled) * 100)
    : null;
  let pace: WorkPace['pace'] = scheduled ? 'on_track' : 'not_planned';
  if (scheduled && scheduledCompleted === scheduled) pace = 'completed';
  else if (late > 0) pace = 'delayed';
  else if (early > 0 || scheduledCompleted > due) pace = 'ahead';
  let forecastFinish: string | null = null;
  const firstStart = scheduled
    ? list.map(([, p]) => p.plannedStart).sort()[0]
    : null;
  const todayNum = dateNumber(today),
    startNum = firstStart ? dateNumber(firstStart) : null;
  if (scheduled && originalFinish && todayNum !== null) {
    if (scheduledCompleted === scheduled) {
      // Actual completion timestamps are not implied by the plan.
      forecastFinish = null;
    } else if (startNum !== null && scheduledCompleted > 0) {
      const elapsedDays = Math.max(
        1,
        Math.floor((todayNum - startNum) / DAY) + 1,
      );
      const daysNeeded = Math.ceil(
        ((scheduled - scheduledCompleted) * elapsedDays) / scheduledCompleted,
      );
      forecastFinish = iso(todayNum + (daysNeeded - 1) * DAY);
    }
  }
  return {
    completed,
    total: count,
    progressPct: count ? Math.round((completed / count) * 100) : 0,
    scheduled,
    scheduledCompleted,
    due,
    late,
    early,
    expectedPct,
    scheduledActualPct,
    pace,
    originalFinish,
    forecastFinish,
  };
}
