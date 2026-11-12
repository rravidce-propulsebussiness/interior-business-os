'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createCuringPlan,
  recordCuringRound,
} from './[id]/site/curing-actions';

export type CuringRoundView = {
  key: string;
  planId: string;
  title: string;
  roundAt: string;
  time: string;
  day: string;
  status: 'recorded' | 'due' | 'missed' | 'upcoming';
  recordable: boolean;
  late: boolean;
  remarks: string;
  hasPhoto: boolean;
};

const label = {
  recorded: 'Recorded',
  due: 'Due now',
  missed: 'Missed',
  upcoming: 'Upcoming',
} as const;

function RoundForm({
  projectId,
  round,
}: {
  projectId: string;
  round: CuringRoundView;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  return (
    <form
      className="pf-curing-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        form.set('plan_id', round.planId);
        form.set('round_at', round.roundAt);
        setMessage(null);
        start(async () => {
          const result = await recordCuringRound(projectId, form);
          setMessage({ ok: result.saved, text: result.message });
          if (result.saved) router.refresh();
        });
      }}
    >
      <input
        name="remarks"
        required
        minLength={3}
        maxLength={1000}
        placeholder="What was done? e.g. Slab ponded, hessian wet"
        aria-label="Remarks"
      />
      <label className="pf-camera">
        <span aria-hidden="true">📷</span>
        <span>Photo</span>
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
        />
      </label>
      <button
        className="pf-btn pf-btn-primary pf-wide pf-big"
        disabled={pending}
      >
        {pending ? 'Saving…' : 'Record round'}
      </button>
      {message && (
        <p role="status" className={'pf-msg ' + (message.ok ? 'ok' : 'bad')}>
          {message.text}
        </p>
      )}
    </form>
  );
}

export function CuringRounds({
  projectId,
  rounds,
  canRecord,
}: {
  projectId: string;
  rounds: CuringRoundView[];
  canRecord: boolean;
}) {
  const [open, setOpen] = useState(rounds.find((r) => r.recordable)?.key ?? '');
  if (!rounds.length)
    return (
      <p className="pf-empty">No curing rounds scheduled for these days.</p>
    );
  return (
    <ol className="pf-rounds">
      {rounds.map((round) => (
        <li key={round.key} className={'pf-round pf-round-' + round.status}>
          <button
            type="button"
            className="pf-round-head"
            aria-expanded={open === round.key}
            disabled={!canRecord || !round.recordable}
            onClick={() => setOpen(open === round.key ? '' : round.key)}
          >
            <span className="pf-round-time">
              <b>{round.time}</b>
              <small>{round.day}</small>
            </span>
            <span className="pf-round-title">
              {round.title}
              {round.remarks && (
                <small>
                  {round.remarks}
                  {round.hasPhoto ? ' · 📷' : ''}
                </small>
              )}
            </span>
            <span className={'pf-pill pf-pill-' + round.status}>
              {label[round.status]}
              {round.late ? ' · late' : ''}
            </span>
          </button>
          {canRecord && round.recordable && open === round.key && (
            <RoundForm projectId={projectId} round={round} />
          )}
        </li>
      ))}
    </ol>
  );
}

export function CuringPlanForm({
  projectId,
  stages,
  today,
}: {
  projectId: string;
  stages: { id: string; label: string }[];
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  return (
    <form
      className="pf-panel pf-grid-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setMessage(null);
        start(async () => {
          const result = await createCuringPlan(projectId, form);
          setMessage({ ok: result.saved, text: result.message });
          if (result.saved) router.refresh();
        });
      }}
    >
      <label className="pf-field">
        <span>Stage</span>
        <select name="stage_id" required>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="pf-field">
        <span>Title</span>
        <input
          name="title"
          required
          minLength={3}
          maxLength={160}
          placeholder="e.g. Ground floor slab curing"
        />
      </label>
      <label className="pf-field pf-span">
        <span>Approved specification</span>
        <input
          name="spec_reference"
          required
          minLength={3}
          maxLength={300}
          placeholder="Drawing / BOQ clause that sets the curing period"
        />
      </label>
      <label className="pf-field">
        <span>From</span>
        <input type="date" name="starts_on" required defaultValue={today} />
      </label>
      <label className="pf-field">
        <span>To</span>
        <input type="date" name="ends_on" required />
      </label>
      <label className="pf-field">
        <span>Round times</span>
        <input name="round_times" required placeholder="07:00, 12:00, 17:00" />
      </label>
      <label className="pf-field">
        <span>Grace (minutes)</span>
        <input name="grace_minutes" type="number" min={10} max={720} required />
      </label>
      <p className="pf-help pf-span">
        Enter the duration and frequency exactly as specified. The system never
        assumes a curing period or marks rounds done.
      </p>
      <button className="pf-btn pf-btn-primary" disabled={pending}>
        {pending ? 'Saving…' : 'Approve schedule'}
      </button>
      {message && (
        <p role="status" className={'pf-msg ' + (message.ok ? 'ok' : 'bad')}>
          {message.text}
        </p>
      )}
    </form>
  );
}
