'use client';

import { useState, useTransition } from 'react';
import { editQuotedProjectStage } from './stage-owner-actions';

export function OwnerStageEditor({
  projectId,
  stage,
}: {
  projectId: string;
  stage: {
    id: string;
    title: string;
    explanation: string;
    activities: string[];
    display_order?: number;
    owner_version?: number;
    template_code: string;
  };
}) {
  const [busy, start] = useTransition();
  const [message, setMessage] = useState('');
  if (stage.template_code === 'QUOTED_SCOPE') {
    return (
      <p className="mt-3 text-xs text-slate-600">
        Accepted quotation scope is locked. Use an approved change order for changes
        to agreed quantities, pricing or specifications.
      </p>
    );
  }
  return (
    <details className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-blue-800">
        Owner: edit planned stage
      </summary>
      <form
        className="mt-3 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const activities = String(fields.get('activities') ?? '').split('\n')
            .map((s) => s.trim()).filter(Boolean);
          start(async () => {
            const saved = await editQuotedProjectStage({
              projectId,
              stageId: stage.id,
              expectedVersion: stage.owner_version ?? 0,
              title: fields.get('title'),
              explanation: fields.get('explanation'),
              activities,
              displayOrder: Number(fields.get('displayOrder')),
              reason: fields.get('reason'),
            });
            setMessage(saved.message);
          });
        }}
      >
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Stage name
          <input className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
            name="title" required minLength={3} maxLength={180}
            defaultValue={stage.title}/>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Planned activities (one per line)
          <textarea className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
            name="activities" required rows={6}
            defaultValue={stage.activities.join('\n')}/>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Description
          <textarea className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
            name="explanation" rows={2} maxLength={800}
            defaultValue={stage.explanation}/>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Display order
          <input className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
            name="displayOrder" type="number" min={1} max={900}
            required defaultValue={stage.display_order ?? 1}/>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Reason for change (audit trail)
          <input className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
            name="reason" minLength={8} maxLength={1000}
            required placeholder="e.g. Revised site execution sequencing"/>
        </label>
        <p className="text-xs text-slate-600">
          Editing changes only the execution plan, never accepted quote prices,
          approved inspections, payment terms or past site records. Dependency
          order and already executed stages remain protected.
        </p>
        <button type="submit" disabled={busy}
          className="justify-self-start rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Save planning edit'}
        </button>
        {message && <p role="status" className="text-xs text-slate-700">{message}</p>}
      </form>
    </details>
  );
}
