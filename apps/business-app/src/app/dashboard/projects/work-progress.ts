/**
 * Work completion is the weighted percentage of real Operations tasks.
 * Workflow stage, design approval, invoice status and photo counts never
 * count as completed physical work. Missing tasks => untracked, not 0%.
 */
export type ProjectWorkTask = {
  project_id: string;
  status: string;
  completion_percentage: string | number;
  weight: string | number;
};

function finiteNumber(value: number | string): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function workCompletionByProject(
  projectIds: string[],
  tasks: ProjectWorkTask[] | null,
): Map<string, number | null> {
  const result = new Map<string, number | null>(
    projectIds.map((id) => [id, null] as const),
  );
  if (!tasks) return result;
  const totals = new Map<string, { sum: number; weight: number }>();
  for (const task of tasks) {
    if (!result.has(task.project_id) || task.status === 'cancelled') continue;
    const weight = finiteNumber(task.weight);
    const recorded = finiteNumber(task.completion_percentage);
    if (weight === null || weight <= 0 || (recorded === null && task.status !== 'done'))
      continue;
    const percentage =
      task.status === 'done' ? 100 : Math.min(100, Math.max(0, recorded ?? 0));
    const previous = totals.get(task.project_id) ?? { sum: 0, weight: 0 };
    previous.sum += percentage * weight;
    previous.weight += weight;
    totals.set(task.project_id, previous);
  }
  for (const [id, total] of totals)
    if (total.weight > 0)
      result.set(id, Math.round(total.sum / total.weight));
  return result;
}
