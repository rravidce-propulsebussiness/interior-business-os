'use client';

import { useRef, useState, useTransition } from 'react';
import {
  recordLaborGateEvent,
  reviewLaborGateDay,
  type LaborGateResult,
} from './construction-gate-actions';

export type ConstructionGateData = {
  can_review: boolean;
  events: {
    id: string;
    work_date: string;
    trade: string;
    direction: 'arrival' | 'departure';
    workers: number;
    notes: string;
    recorded_at: string;
  }[];
  comparison: {
    work_date: string;
    trade: string;
    planned: number;
    arrived: number;
    departed: number;
    on_site: number;
  }[];
  reviews: {
    work_date: string;
    decision: 'verified' | 'discrepancy';
    reason: string;
    reviewed_at: string;
    is_current: boolean;
  }[];
};

const fieldClass =
  'mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus-visible:outline-blue-600';
const btnClass =
  'rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-xs font-bold text-blue-800 disabled:opacity-50';

export function ConstructionGatePanel({
  projectId,
  data,
}: {
  projectId: string;
  data: ConstructionGateData;
}) {
  const [pending, start] = useTransition();
  const pendingGateRequestId = useRef<string | null>(null);
  const [notice, setNotice] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const run = (
    task: () => Promise<LaborGateResult>,
    onSuccess?: () => void,
  ) => {
    start(async () => {
      const result = await task();
      setNotice(result.message);
      if (result.saved) onSuccess?.();
    });
  };
  const dateOptions = [...new Set(data.comparison.map((row) => row.work_date))];
  const reviews = new Map(
    data.reviews.map((review) => [review.work_date, review]),
  );

  return (
    <section
      id="construction-labor-gate"
      aria-label="Site security labour register"
      className="sc-panel rounded-2xl border p-5 sm:p-7"
    >
      <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
        Site security & worker entry
      </p>
      <h2 className="mt-2 text-xl font-bold text-slate-900">
        Labour arrivals, departures & daily reconciliation
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        The watchman records actual worker groups entering and leaving the site.
        Every entry is linked to the existing security gate history. Managers
        compare these counts with approved work plans, without generating
        payroll, supplier orders or construction progress.
      </p>
      <form
        className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
        onChange={() => {
          pendingGateRequestId.current = null;
        }}
        onSubmit={(event) => {
          event.preventDefault();
          const payload = new FormData(event.currentTarget);
          pendingGateRequestId.current ??= crypto.randomUUID();
          payload.set('request_id', pendingGateRequestId.current);
          run(
            () => recordLaborGateEvent(projectId, payload),
            () => {
              pendingGateRequestId.current = null;
            },
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-800">
            Site work date
            <input
              name="work_date"
              type="date"
              required
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-semibold text-slate-800">
            Gate movement
            <select
              name="direction"
              defaultValue="arrival"
              required
              className={fieldClass}
            >
              <option value="arrival">Workers arrived</option>
              <option value="departure">Workers departed</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-800">
            Labour trade
            <input
              name="trade"
              required
              maxLength={70}
              className={fieldClass}
              placeholder="Helpers, Masons, Bar benders..."
            />
          </label>
          <label className="text-xs font-semibold text-slate-800">
            Number of workers
            <input
              name="workers"
              type="number"
              min={1}
              max={500}
              required
              className={fieldClass}
            />
          </label>
        </div>
        <label className="block text-xs font-semibold text-slate-800">
          Gate observation / safety notes
          <textarea
            name="notes"
            rows={2}
            maxLength={1500}
            className={fieldClass}
            placeholder="Site access, PPE, group identification or reason for departure"
          />
        </label>
        <button
          disabled={pending}
          className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          Record gate movement
        </button>
        <p className="text-xs text-slate-600">
          Departures cannot exceed previously logged arrivals for the same trade
          and date. These are group counts, not employee identity or wage
          records.
        </p>
      </form>

      {data.can_review && (
        <div className="mt-6">
          <h3 className="text-base font-bold text-slate-900">
            Planned vs actual workforce
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Plans are derived from the latest approved tomorrow-work revisions.
            Arrivals and departures are counted from real security gate entries
            only.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[540px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-3 font-bold">Date / trade</th>
                  <th className="px-3 py-3 font-bold">Planned</th>
                  <th className="px-3 py-3 font-bold">Arrived</th>
                  <th className="px-3 py-3 font-bold">Departed</th>
                  <th className="px-3 py-3 font-bold">On site</th>
                </tr>
              </thead>
              <tbody>
                {data.comparison.map((entry, index) => (
                  <tr
                    key={entry.work_date + entry.trade + index}
                    className="border-t border-slate-200"
                  >
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      {entry.work_date}
                      <span className="block font-normal capitalize text-slate-600">
                        {entry.trade}
                      </span>
                    </td>
                    <td className="px-3 py-3">{entry.planned}</td>
                    <td className="px-3 py-3">{entry.arrived}</td>
                    <td className="px-3 py-3">{entry.departed}</td>
                    <td className="px-3 py-3 font-bold">{entry.on_site}</td>
                  </tr>
                ))}
                {data.comparison.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-5 text-sm text-slate-600"
                    >
                      No approved labour forecasts or structured gate events
                      available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-3">
            {dateOptions.map((date) => {
              const review = reviews.get(date);
              const hasActual = data.comparison.some(
                (entry) => entry.work_date === date && entry.arrived > 0,
              );
              return (
                <div
                  key={date}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">{date}</p>
                    <span
                      className={
                        'rounded-full px-2 py-1 text-xs font-semibold ' +
                        (review?.is_current && review.decision === 'verified'
                          ? 'bg-emerald-50 text-emerald-900'
                          : 'bg-amber-50 text-amber-900')
                      }
                    >
                      {!review
                        ? 'Awaiting review'
                        : !review.is_current
                          ? 'Review outdated by newer gate activity'
                          : review.decision === 'verified'
                            ? 'Reconciled'
                            : 'Discrepancy noted'}
                    </span>
                  </div>
                  {review && (
                    <p className="mt-2 text-xs text-slate-600">
                      {review.reason}
                    </p>
                  )}
                  {hasActual && (
                    <div className="mt-3 space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Manager reconciliation note
                        <input
                          className={fieldClass}
                          minLength={12}
                          maxLength={2500}
                          placeholder="Describe verification or unresolved headcount discrepancy"
                          value={reviewNotes[date] ?? ''}
                          onChange={(event) =>
                            setReviewNotes((old) => ({
                              ...old,
                              [date]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={btnClass}
                          type="button"
                          disabled={
                            pending ||
                            (reviewNotes[date] ?? '').trim().length < 12
                          }
                          onClick={() =>
                            run(() =>
                              reviewLaborGateDay(
                                projectId,
                                date,
                                'verified',
                                reviewNotes[date] ?? '',
                              ),
                            )
                          }
                        >
                          Verify counts
                        </button>
                        <button
                          className={btnClass}
                          type="button"
                          disabled={
                            pending ||
                            (reviewNotes[date] ?? '').trim().length < 12
                          }
                          onClick={() =>
                            run(() =>
                              reviewLaborGateDay(
                                projectId,
                                date,
                                'discrepancy',
                                reviewNotes[date] ?? '',
                              ),
                            )
                          }
                        >
                          Flag discrepancy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-base font-bold text-slate-900">
          {data.can_review ? 'Recent gate log' : 'Your recent security entries'}
        </h3>
        <div className="mt-3 space-y-2">
          {data.events.slice(0, 35).map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"
            >
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {entry.trade} — {entry.workers}{' '}
                  {entry.direction === 'arrival' ? 'arrived' : 'departed'}
                </p>
                <p className="mt-1 text-xs text-slate-600">{entry.work_date}</p>
                {entry.notes && (
                  <p className="mt-2 text-xs text-slate-600">{entry.notes}</p>
                )}
              </div>
              <span
                className={
                  'rounded-full px-2 py-1 text-xs font-bold ' +
                  (entry.direction === 'arrival'
                    ? 'bg-blue-50 text-blue-900'
                    : 'bg-slate-100 text-slate-700')
                }
              >
                {entry.direction === 'arrival' ? 'IN' : 'OUT'}
              </span>
            </div>
          ))}
          {data.events.length === 0 && (
            <p className="text-sm text-slate-600">
              No structured workforce gate events logged yet.
            </p>
          )}
        </div>
      </div>
      {notice && (
        <p role="status" className="mt-4 text-sm font-semibold text-blue-800">
          {notice}
        </p>
      )}
    </section>
  );
}
