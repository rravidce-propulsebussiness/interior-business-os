'use client';

import { useState, useTransition } from 'react';
import {
  attachDailyReportToStage,
  recordCuringRound,
  registerCuringPour,
  verifyCuringRound,
  type SiteActionResult,
} from './construction-field-actions';

export type ConstructionFieldData = {
  can_manage: boolean;
  can_verify: boolean;
  plans: {
    id: string;
    stage_id: string;
    pour_reference: string;
    pour_date: string;
    minimum_days: number;
    method: string;
    notes: string;
    required_until: string;
    ready: boolean;
    observations: {
      id: string;
      date: string;
      result: 'wet' | 'insufficient';
      note: string;
      observed_by: string;
      verified: boolean;
    }[];
  }[];
  stage_reports: {
    stage_id: string;
    report_id: string;
    report_date: string;
    completed_work: string;
    tomorrow_plan: string;
    blockers: string;
    worker_count: number;
    created_by: string;
  }[];
};
type ReportChoice = { id: string; date: string };
const control =
  'mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900';
const action =
  'rounded-xl border border-blue-300 px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-50';

export function ConstructionFieldPanel({
  projectId,
  stageId,
  phase,
  data,
  reports,
}: {
  projectId: string;
  stageId: string;
  phase: string;
  data: ConstructionFieldData;
  reports: ReportChoice[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [selectedReport, setSelectedReport] = useState('');
  const [verifyNotes, setVerifyNotes] = useState<Record<string, string>>({});
  const plans = data.plans.filter((plan) => plan.stage_id === stageId);
  const links = data.stage_reports.filter((item) => item.stage_id === stageId);
  const handle = (actionCall: () => Promise<SiteActionResult>) => {
    start(async () => {
      const result = await actionCall();
      setMessage(result.message);
    });
  };
  const isConcrete = ['foundation', 'plinth', 'superstructure'].includes(phase);
  return (
    <details className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50/30 p-4">
      <summary className="cursor-pointer text-sm font-bold text-slate-900">
        Curing rounds & floor-linked daily work
        {isConcrete && (
          <span className="ml-2 text-xs font-semibold text-amber-800">
            Required for stage clearance
          </span>
        )}
      </summary>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        Pour date, method and number of curing days are defined by the project
        engineer, not guessed by this software. Every required day needs an
        actual site observation and a separate verification before a concrete
        stage can be cleared.
      </p>
      {data.can_manage && (
        <form
          className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            handle(() => registerCuringPour(projectId, stageId, form));
          }}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Register actual pour / curing program
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">
              Pour reference
              <input
                name="pour_reference"
                required
                maxLength={140}
                className={control}
                placeholder="Ground floor slab pour A"
              />
            </label>
            <label className="text-xs font-semibold">
              Concrete placement date
              <input
                name="pour_date"
                type="date"
                required
                className={control}
              />
            </label>
            <label className="text-xs font-semibold">
              Required curing days
              <input
                name="minimum_days"
                type="number"
                min="1"
                max="60"
                required
                className={control}
              />
            </label>
            <label className="text-xs font-semibold">
              Method
              <select
                name="method"
                defaultValue="sprinkling"
                className={control}
              >
                <option value="sprinkling">Sprinkling</option>
                <option value="ponding">Ponding</option>
                <option value="wet_covering">Wet covering</option>
                <option value="membrane">Curing membrane</option>
                <option value="other">Other approved method</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold">
            Engineer-approved curing instructions
            <textarea
              name="notes"
              rows={2}
              minLength={12}
              maxLength={3000}
              required
              className={control}
              placeholder="Specify coverage, method, inspection and supervision requirements."
            />
          </label>
          <button className={action} disabled={pending}>
            Record pour & curing schedule
          </button>
        </form>
      )}
      {plans.length === 0 && isConcrete && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          No curing plan recorded. Concrete-stage certification remains blocked.
        </p>
      )}
      <div className="mt-4 space-y-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="rounded-xl border border-slate-200 bg-white p-3"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {plan.pour_reference}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {plan.pour_date} · {plan.minimum_days} scheduled days ·{' '}
                  {plan.method.replaceAll('_', ' ')}
                </p>
              </div>
              <span
                className={
                  'rounded-lg px-2 py-1 text-xs font-bold ' +
                  (plan.ready
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'bg-amber-50 text-amber-900')
                }
              >
                {plan.ready ? 'Stage curing ready' : 'Verification pending'}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-700">
              {plan.notes}
            </p>
            <form
              className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                handle(() => recordCuringRound(projectId, plan.id, form));
              }}
            >
              <label className="text-xs font-semibold">
                Observation date
                <input
                  type="date"
                  required
                  className={control}
                  name="observed_on"
                />
              </label>
              <label className="text-xs font-semibold">
                Site observation
                <select name="result" defaultValue="wet" className={control}>
                  <option value="wet">Wet/curing maintained</option>
                  <option value="insufficient">
                    Insufficient — action needed
                  </option>
                </select>
              </label>
              <button disabled={pending} className={action}>
                Log curing round
              </button>
              <label className="text-xs font-semibold sm:col-span-3">
                Actual observation details
                <textarea
                  name="note"
                  required
                  minLength={12}
                  maxLength={3000}
                  rows={2}
                  className={control}
                  placeholder="Document what was checked, where and by whom."
                />
              </label>
            </form>
            <div className="mt-3 space-y-2">
              {plan.observations.map((observation) => (
                <div
                  key={observation.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                >
                  <p className="text-xs font-semibold text-slate-800">
                    {observation.date} ·{' '}
                    {observation.result === 'wet'
                      ? 'Moisture maintained'
                      : 'Attention required'}
                    {' · '}
                    {observation.verified ? 'Verified' : 'Unverified'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {observation.note}
                  </p>
                  {data.can_verify && !observation.verified && (
                    <div className="mt-2 space-y-2">
                      <input
                        className={control}
                        minLength={12}
                        maxLength={2500}
                        aria-label="Independent curing verification note"
                        placeholder="Independent verification notes"
                        value={verifyNotes[observation.id] ?? ''}
                        onChange={(event) =>
                          setVerifyNotes((all) => ({
                            ...all,
                            [observation.id]: event.target.value,
                          }))
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={action}
                          disabled={
                            pending ||
                            (verifyNotes[observation.id] ?? '').trim().length <
                              12
                          }
                          onClick={() =>
                            handle(() =>
                              verifyCuringRound(
                                projectId,
                                observation.id,
                                'verified',
                                verifyNotes[observation.id] ?? '',
                              ),
                            )
                          }
                        >
                          Verify round
                        </button>
                        <button
                          type="button"
                          className={action}
                          disabled={
                            pending ||
                            (verifyNotes[observation.id] ?? '').trim().length <
                              12
                          }
                          onClick={() =>
                            handle(() =>
                              verifyCuringRound(
                                projectId,
                                observation.id,
                                'rejected',
                                verifyNotes[observation.id] ?? '',
                              ),
                            )
                          }
                        >
                          Reject observation
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {(data.can_manage || links.length > 0) && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <h4 className="text-sm font-bold text-slate-900">
            Daily progress & tomorrow’s work
          </h4>
          <p className="mt-1 text-xs text-slate-600">
            Uses existing Site Delivery daily reports; no second report or
            fabricated completion value.
          </p>
          {links.map((link) => (
            <div
              key={link.report_id}
              className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-700"
            >
              <p className="font-bold">
                {link.report_date} · {link.worker_count} workers
              </p>
              <p className="mt-1">Completed: {link.completed_work}</p>
              <p className="mt-1">Tomorrow: {link.tomorrow_plan}</p>
              {link.blockers && (
                <p className="mt-1 text-amber-900">Blockers: {link.blockers}</p>
              )}
            </div>
          ))}
          {data.can_manage && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-[180px] flex-1 text-xs font-semibold">
                Link an existing daily report to this stage
                <select
                  value={selectedReport}
                  onChange={(event) => setSelectedReport(event.target.value)}
                  className={control}
                >
                  <option value="">Choose report</option>
                  {reports.map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.date}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={action}
                disabled={pending || !selectedReport}
                onClick={() =>
                  handle(() =>
                    attachDailyReportToStage(
                      projectId,
                      stageId,
                      selectedReport,
                    ),
                  )
                }
              >
                Link daily report
              </button>
            </div>
          )}
        </div>
      )}
      {message && (
        <p className="mt-3 text-sm font-semibold text-blue-800" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
