'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { clientDesignDecision } from './actions';

type Drawing = {
  kind: string;
  status: string;
  revision: number;
  reference: string;
};

export function ClientDesignReview({
  projectId,
  drawings,
}: {
  projectId: string;
  drawings: Drawing[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  const approved = drawings.filter((drawing) => drawing.status === 'approved');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFeedback('');
    start(async () => {
      const result = await clientDesignDecision(data);
      setFeedback(result.message);
      setFailed(!result.ok);
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="mt-6 space-y-4 border-t border-slate-200 pt-5">
      <h3 className="font-bold">Review your designs</h3>
      <p className="text-sm text-slate-600">
        Check the latest drawings, approve them, or request a revision.
        Required drawings must pass technical review before final client approval.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <input type="hidden" name="project" value={projectId} />
        <input type="hidden" name="decision" value="approved" />
        <input type="hidden" name="note" value="Approved final design revisions" />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="acknowledged" required className="mt-1" />
          I have reviewed the latest drawings and agree to proceed.
        </label>
        <button disabled={pending} type="submit"
          className="min-h-11 w-full rounded-xl bg-blue-700 px-4 font-semibold text-white disabled:opacity-50">
          {pending ? 'Recording…' : 'Approve final designs'}
        </button>
      </form>
      {approved.length > 0 && (
        <form onSubmit={submit} className="space-y-3 rounded-xl bg-amber-50 p-4">
          <input type="hidden" name="project" value={projectId} />
          <input type="hidden" name="decision" value="changes_requested" />
          <label className="block text-sm font-semibold">
            Drawing to change
            <select name="kind" required
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3">
              {approved.map((drawing) => (
                <option value={drawing.kind} key={drawing.kind}>
                  {drawing.kind.replaceAll('_', ' ')} · Revision {drawing.revision}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            What should the designer change?
            <textarea name="note" required minLength={10} rows={3}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3"
              placeholder="Explain what needs to change…"/>
          </label>
          <button disabled={pending} type="submit"
            className="min-h-11 w-full rounded-xl border border-amber-300 bg-white px-4 font-bold text-amber-900 disabled:opacity-50">
            Request changes
          </button>
        </form>
      )}
      {feedback && (
        <p role={failed ? 'alert' : 'status'} className={
          'rounded-xl p-3 text-sm font-medium ' +
          (failed ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800')
        }>
          {feedback}
        </p>
      )}
    </section>
  );
}
