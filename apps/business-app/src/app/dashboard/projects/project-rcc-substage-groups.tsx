import type { ReactNode } from 'react';
import { OpenRccWorkButton } from './project-rcc-open-work-button';

export type RccWorkItem = {
  index: number;
  title: string;
  status: string;
  plannedStart: string;
  plannedFinish: string;
};

export type RccMaterialItem = {
  index: number;
  title: string;
  plannedStart: string;
  plannedFinish: string;
};

const GROUPS = [
  { id: 'columns', title: 'Columns', match: /column|stirrup|tie beam/i },
  { id: 'staircase', title: 'Staircase', match: /stair|landing/i },
  { id: 'slab', title: 'Slab & beams', match: /slab|beam|roof/i },
] as const;

function groupFor(title: string) {
  return GROUPS.find((group) => group.match.test(title))?.id ?? 'slab';
}

function dayStatus(item: RccWorkItem, today: string) {
  if (item.status === 'completed') return 'Completed';
  if (item.status === 'skipped') return 'Not applicable';
  if (item.plannedFinish < today) return 'Delayed';
  return 'Planned';
}

export function RccDailyPlan({
  stageId,
  stageTitle,
  work,
  materials,
  today,
  tomorrow,
}: {
  stageId: string;
  stageTitle: string;
  work: RccWorkItem[];
  materials: RccMaterialItem[];
  today: string;
  tomorrow: string;
}) {
  const rowsFor = (date: string) => [
    ...work
      .filter(
        (item) =>
          Boolean(item.plannedStart && item.plannedFinish) &&
          item.plannedStart <= date &&
          (item.plannedFinish >= date ||
            (date === today &&
              item.plannedFinish < today &&
              item.status !== 'completed')),
      )
      .map((item) => ({
        id: `pv2-work-${stageId}-${item.index}`,
        title: item.title,
        status: dayStatus(item, today),
        kind: 'Work',
      })),
    ...materials
      .filter(
        (item) =>
          Boolean(item.plannedStart && item.plannedFinish) &&
          item.plannedStart <= date &&
          (item.plannedFinish >= date ||
            (date === today && item.plannedFinish < today)),
      )
      .map((item) => ({
        id: `pv2-material-${stageId}-${item.index}`,
        title: item.title,
        status: item.plannedFinish < today ? 'Delayed' : 'Planned',
        kind: 'Material',
      })),
  ];

  return (
    <section
      className="pv2-rcc-daily-plan"
      aria-label={stageTitle + ' daily work'}
    >
      {[
        { label: 'Today', date: today },
        { label: 'Tomorrow', date: tomorrow },
      ].map(({ label, date }) => {
        const rows = rowsFor(date);
        return (
          <div className="pv2-rcc-day" key={label}>
            <h4>
              {label} <time dateTime={date}>{date}</time>
            </h4>
            {rows.length ? (
              <ul>
                {rows.map((row) => (
                  <li key={row.id}>
                    <span>
                      <small>{row.kind}</small>
                      <strong>{row.title}</strong>
                    </span>
                    <span
                      className={
                        'pv2-rcc-task-status ' + row.status.toLowerCase()
                      }
                    >
                      {row.status}
                    </span>
                    {row.kind === 'Work' && (
                      <OpenRccWorkButton targetId={row.id} />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No work or material deliveries are scheduled.</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function RccSubstageGroups({
  stageId,
  title,
  activities,
  completed,
  renderActivity,
}: {
  stageId: string;
  title: string;
  activities: RccWorkItem[];
  completed: number;
  renderActivity: (index: number, title: string) => ReactNode;
}) {
  const groups = GROUPS;
  return (
    <section
      className="pv2-rcc-substages"
      aria-label={title + ' structural work'}
    >
      <div className="pv2-rcc-substage-heading">
        <div>
          <h4>{title}</h4>
          <p>
            Open a work area to plan dates, arrange materials, and record
            completion.
          </p>
        </div>
        <span>
          {completed}/{activities.length} complete
        </span>
      </div>
      {groups.map((group) => {
        const items = activities.filter(
          (item) => groupFor(item.title) === group.id,
        );
        const done = items.filter((item) => item.status === 'completed').length;
        return (
          <details
            className="pv2-rcc-substage"
            id={`pv2-rcc-group-${stageId}-${group.id}`}
            key={group.id}
          >
            <summary>
              <strong>{group.title}</strong>
              <span>
                {done}/{items.length} complete
              </span>
            </summary>
            <div className="pv2-rcc-substage-items">
              {items.length ? (
                items.map((item) => (
                  <div className="pv2-rcc-work-entry" key={item.index}>
                    {renderActivity(item.index, item.title)}
                  </div>
                ))
              ) : (
                <p className="pv2-rcc-empty">
                  No work items are assigned to this area yet.
                </p>
              )}
            </div>
          </details>
        );
      })}
    </section>
  );
}
