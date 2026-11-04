import type { ProjectEntry } from '../projects/project-v2-types';

export type PortfolioTask = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  priority: string;
  planned_end: string | null;
};

export type TaskAlert = PortfolioTask & {
  kind: 'blocked' | 'overdue' | 'due_soon';
};

const finished = new Set(['completed', 'closed', 'handover']);
const paused = new Set(['on_hold', 'held', 'inactive']);

export function projectCategory(status: string) {
  if (finished.has(status)) return 'completed';
  if (paused.has(status)) return 'on_hold';
  return 'ongoing';
}

export function portfolioSnapshot(
  projects: readonly ProjectEntry[],
  tasks: readonly PortfolioTask[] | null,
  today: string,
) {
  const total = projects.length;
  const completed = projects.filter(
    (item) => projectCategory(item.status) === 'completed',
  ).length;
  const onHold = projects.filter(
    (item) => projectCategory(item.status) === 'on_hold',
  ).length;
  const tracked = projects.filter((item) => item.progress !== null);
  const averageProgress = tracked.length
    ? Math.round(
        tracked.reduce((sum, item) => sum + (item.progress ?? 0), 0) /
          tracked.length,
      )
    : null;
  const week = new Date(today + 'T00:00:00Z');
  week.setUTCDate(week.getUTCDate() + 7);
  const withinWeek = week.toISOString().slice(0, 10);
  const alerts: TaskAlert[] | null = tasks
    ? tasks
        .filter((task) => task.status !== 'done' && task.status !== 'cancelled')
        .map((task) => {
          const kind =
            task.status === 'blocked'
              ? 'blocked'
              : task.planned_end && task.planned_end < today
                ? 'overdue'
                : task.planned_end && task.planned_end <= withinWeek
                  ? 'due_soon'
                  : null;
          return kind ? { ...task, kind } : null;
        })
        .filter((task): task is TaskAlert => task !== null)
        .sort((a, b) => {
          const priority = { blocked: 0, overdue: 1, due_soon: 2 };
          const left = priority[a.kind] - priority[b.kind];
          return (
            left || (a.planned_end ?? '').localeCompare(b.planned_end ?? '')
          );
        })
    : null;
  const byProject: Record<string, number> = {};
  for (const alert of alerts ?? [])
    byProject[alert.project_id] = (byProject[alert.project_id] ?? 0) + 1;
  return {
    total,
    ongoing: total - completed - onHold,
    completed,
    onHold,
    tracked: tracked.length,
    averageProgress,
    alerts,
    byProject,
    blocked: alerts?.filter((alert) => alert.kind === 'blocked').length ?? null,
    overdue: alerts?.filter((alert) => alert.kind === 'overdue').length ?? null,
    dueSoon:
      alerts?.filter((alert) => alert.kind === 'due_soon').length ?? null,
  };
}
