export type HandoverStage = {
  id: string;
  title: string;
  instance_code: string;
  floor_code: string | null;
  hold_point: string | null;
  cleared: boolean;
};

export function ConstructionHandoverReadiness({
  workflowStatus,
  stages,
  pendingChecks,
  pendingMaterials,
}: {
  workflowStatus: string | null;
  stages: HandoverStage[];
  pendingChecks: number;
  pendingMaterials: number;
}) {
  const pending = stages.filter((stage) => !stage.cleared);
  const stats = [
    ['Workflow', workflowStatus?.replaceAll('_', ' ') ?? 'Not configured'],
    ['Certified stages', String(stages.length - pending.length)],
    ['Stages awaiting QC', String(pending.length)],
    ['Open site checks / needs', `${pendingChecks} / ${pendingMaterials}`],
  ];
  return (
    <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5">
      <h3 className="text-base font-bold text-slate-900">
        Construction stage certification &amp; handover
      </h3>
      {!workflowStatus ? (
        <p className="mt-2 text-sm text-slate-700">
          No frozen construction workflow is linked; original Site Delivery
          rules apply.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white p-3">
                <p className="text-xs text-slate-600">{label}</p>
                <p className="mt-1 font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          {pending.length > 0 && (
            <ul className="mt-3 max-h-52 space-y-2 overflow-auto rounded-xl bg-white p-3">
              {pending.map((stage) => (
                <li key={stage.id} className="text-sm text-slate-800">
                  <strong>
                    {stage.floor_code ? `${stage.floor_code} · ` : ''}
                    {stage.title}
                  </strong>
                  <span className="ml-2 text-xs text-amber-800">
                    {stage.hold_point === 'structural'
                      ? 'QC and structural clearance required'
                      : 'Independent QC clearance required'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-600">
        This is informational. The database revalidates every certificate,
        transitive prerequisite, agreement scope, and the existing Operations
        handover checks before a transition. Certification is not a payment.
      </p>
    </div>
  );
}
