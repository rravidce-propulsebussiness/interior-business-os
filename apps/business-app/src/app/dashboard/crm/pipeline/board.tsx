'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCrmCommand } from '../actions';
export function PipelineBoard({
  stages,
  leads,
  canManage,
}: {
  stages: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  canManage: boolean;
}) {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    router = useRouter();
  async function move(id: string, stage: string) {
    const lead = leads.find((l) => l.id === id),
      target = stages.find((s) => s.id === stage);
    if (!canManage || !lead || !target || busy) return;
    if (target.outcome !== 'open') {
      setMessage(
        'Open the lead workspace to record the required Won/Lost reason.',
      );
      return;
    }
    setBusy(true);
    try {
      const result = await runCrmCommand({
        action: 'stage',
        id,
        version: lead.version,
        stage_id: stage,
        lost_reason_id: null,
        note: '',
      });
      setMessage(result.message);
      if (result.id) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p role="status">{message}</p>
      <p>
        Drag a card to an open stage, or use its stage selector. Terminal
        outcomes require a reason in the lead workspace.
      </p>
      <div className="my-5 flex gap-4 overflow-x-auto pb-5">
        {stages.map((stage) => (
          <section
            key={String(stage.id)}
            aria-label={String(stage.name)}
            className="min-w-72 flex-1 rounded border bg-muted/30 p-3"
            onDragOver={(e) => {
              if (canManage) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              void move(e.dataTransfer.getData('text/plain'), String(stage.id));
            }}
          >
            <h2 className="text-lg font-semibold">{String(stage.name)}</h2>
            {leads
              .filter((l) => l.stage_id === stage.id)
              .map((l) => (
                <article
                  key={String(l.id)}
                  className="my-3 rounded border bg-background p-3"
                  draggable={canManage && !busy}
                  onDragStart={(e) =>
                    e.dataTransfer.setData('text/plain', String(l.id))
                  }
                >
                  <Link
                    className="font-semibold underline"
                    href={'/dashboard/crm/leads/' + String(l.id)}
                  >
                    {String(l.name)}
                  </Link>
                  <p>
                    {String(l.priority)} · Budget {String(l.budget_min ?? '—')}–
                    {String(l.budget_max ?? '—')}
                  </p>
                  <p>Assigned: {String(l.assignee_name ?? 'Unassigned')}</p>
                  <p>Source: {String(l.source_name ?? '—')}</p>
                  <p>
                    In stage since{' '}
                    {new Date(String(l.stage_entered_at)).toLocaleDateString()}
                  </p>
                  <p>
                    Next follow-up:{' '}
                    {l.next_follow_up_at
                      ? new Date(String(l.next_follow_up_at)).toLocaleString()
                      : 'Not scheduled'}
                  </p>
                  <p>Latest: {String(l.latest_activity ?? 'No activity')}</p>
                  {canManage && (
                    <label className="mt-3 block">
                      Move to stage
                      <select
                        className="mt-1 min-h-11 w-full rounded border p-2"
                        value={String(l.stage_id)}
                        disabled={busy}
                        onChange={(e) =>
                          void move(String(l.id), e.target.value)
                        }
                      >
                        {stages.map((s) => (
                          <option key={String(s.id)} value={String(s.id)}>
                            {String(s.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </article>
              ))}
          </section>
        ))}
      </div>
    </>
  );
}
