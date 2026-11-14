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
  const [showAll, setShowAll] = useState(false);
  const todayRounds = rounds.filter((round) => round.day === 'Today');
  const visibleRounds = showAll ? rounds : todayRounds;
  const hasOtherDays = rounds.some((round) => round.day !== 'Today');
  if (!rounds.length)
    return (
      <p className="pf-empty">No curing rounds scheduled for these days.</p>
    );
  return (
    <div className="pf-round-list">
      {hasOtherDays && <div className="pf-rounds-toolbar">
        <span>{showAll ? 'All available curing days' : 'Today’s curing log'}</span>
        <button type="button" aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Show today only' : 'Show all days'}
        </button>
      </div>}
      {!visibleRounds.length
        ? <p className="pf-empty pf-rounds-empty">No curing rounds scheduled for today.</p>
        : <ol className="pf-rounds">
      {visibleRounds.map((round) => (
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
    </ol>}
    </div>
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
  const recurringUntil = new Date(today + 'T00:00:00.000Z');
  recurringUntil.setUTCFullYear(recurringUntil.getUTCFullYear() + 10);
  const recurringEnd = recurringUntil.toISOString().slice(0, 10);
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
      <input type="hidden" name="starts_on" value={today} />
      <input type="hidden" name="ends_on" value={recurringEnd} />
      <input type="hidden" name="round_times" value="07:00,12:00,17:00" />
      <input type="hidden" name="grace_minutes" value="60" />
      <p className="pf-help pf-span">
        This routine repeats every day with morning, afternoon and evening rounds.
        Dates and times are set automatically; each round still needs a site record and photo.
      </p>
      <button className="pf-btn pf-btn-primary" disabled={pending}>
        {pending ? 'Saving…' : 'Start daily curing routine'}
      </button>
      {message && (
        <p role="status" className={'pf-msg ' + (message.ok ? 'ok' : 'bad')}>
          {message.text}
        </p>
      )}
    </form>
  );
}
