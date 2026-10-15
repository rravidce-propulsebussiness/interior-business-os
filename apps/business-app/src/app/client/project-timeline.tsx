type Stage = {
  id: string;
  title: string;
  description: string;
  phase: string;
  floor_code: string | null;
  status: string;
  completed_at: string | null;
  activities: string[];
};

const completeStates = new Set(['completed', 'certified', 'done']);
const activeStates = new Set(['in_progress', 'active', 'started', 'blocked', 'under_review']);

function readable(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function completedDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Read-only, tenant-scoped stage projection. Never accepts company finance data. */
export function ClientProjectTimeline({
  stages, unavailable = false,
}: {
  stages: Stage[];
  unavailable?: boolean;
}) {
  const done = stages.filter((stage) => completeStates.has(stage.status)).length;
  const active = stages.find((stage) => activeStates.has(stage.status));
  const next = stages.find((stage) => !completeStates.has(stage.status));
  const nextId = active?.id ?? (done > 0 ? next?.id : null);

  return (
    <section id="project-timeline"
      className="scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Project delivery</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Work timeline</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Stages from your accepted project scope, updated by your project team.
            Your company may adjust the plan as work progresses.
          </p>
        </div>
        {stages.length > 0 && (
          <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800">
            {done} of {stages.length} completed
          </span>
        )}
      </div>
      {stages.length > 0 ? (
        <>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar" aria-label="Completed work stages"
            aria-valuemin={0} aria-valuemax={stages.length} aria-valuenow={done}>
            <div className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${(done / stages.length) * 100}%` }} />
          </div>
          <ol className="mt-7 space-y-0">
            {stages.map((stage, index) => {
              const complete = completeStates.has(stage.status);
              const inProgress = activeStates.has(stage.status);
              const selected = nextId === stage.id;
              const date = complete ? completedDate(stage.completed_at) : null;
              return (
                <li key={stage.id} className="relative flex gap-4 pb-7 last:pb-0">
                  {index !== stages.length - 1 && (
                    <span aria-hidden="true"
                      className="absolute bottom-0 left-[17px] top-9 w-0.5 bg-slate-200" />
                  )}
                  <div className={
                    'z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ' +
                    (complete ? 'bg-emerald-600 text-white'
                      : selected || inProgress ? 'bg-blue-700 text-white'
                        : 'bg-slate-100 text-slate-500')
                  }>
                    {complete ? '✓' : index + 1}
                  </div>
                  <div className={'min-w-0 flex-1 rounded-2xl border p-4 ' +
                    (selected ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-white')}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-900">{stage.title}</h3>
                      <span className={
                        'rounded-full px-3 py-1 text-xs font-bold ' +
                        (complete ? 'bg-emerald-50 text-emerald-800'
                          : inProgress ? 'bg-blue-100 text-blue-800'
                            : selected ? 'bg-blue-50 text-blue-700'
                              : 'bg-slate-100 text-slate-600')
                      }>
                        {complete ? 'Completed'
                          : inProgress ? readable(stage.status)
                            : selected ? 'Next' : 'Upcoming'}
                      </span>
                    </div>
                    {(stage.floor_code || stage.phase) && (
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        {[stage.floor_code, stage.phase && readable(stage.phase)]
                          .filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {stage.description && (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {stage.description}
                      </p>
                    )}
                    {date && (
                      <p className="mt-3 text-xs font-semibold text-emerald-800">
                        Stage certified: {date}
                      </p>
                    )}
                    {stage.activities.length > 0 && (
                      <details className="mt-3 text-sm text-slate-600">
                        <summary className="cursor-pointer font-semibold text-blue-700">
                          Work included ({stage.activities.length})
                        </summary>
                        <ul className="ml-4 mt-2 list-disc space-y-1">
                          {stage.activities.map((activity, i) => (
                            <li key={i}>{activity}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm leading-6 text-slate-600">
          {unavailable
            ? 'The project timeline could not be loaded right now.'
            : 'Your project team has not prepared the detailed work timeline yet. Once the approved quotation becomes a project plan, its stages will appear here.'}
        </p>
      )}
    </section>
  );
}
