'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  linkStageToPayment,
  requestCertifiedStagePayment,
  type PaymentActionResult,
} from './construction-payment-actions';

export type ConstructionPaymentData = {
  active_contract_id: string | null;
  currency: string | null;
  can_bind: boolean;
  can_issue: boolean;
  stage_options: {
    id: string;
    instance_code: string;
    title: string;
    current: boolean;
  }[];
  items: {
    id: string;
    contract_id: string;
    schedule_id: string;
    label: string;
    expected_amount: string;
    due_trigger: string;
    due_date: string | null;
    linked_stage_ids: string[];
    is_stage_milestone: boolean;
    eligible: boolean;
    issued_request_id: string | null;
  }[];
};

const formInput =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900';
const formButton =
  'rounded-xl border border-blue-300 px-4 py-2.5 text-xs font-bold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50';

export function ConstructionPaymentsPanel({
  projectId,
  data,
}: {
  projectId: string;
  data: ConstructionPaymentData;
}) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState('');
  const [stageChoices, setStageChoices] = useState<Record<string, string>>({});
  const onSave = (cb: () => Promise<PaymentActionResult>) => {
    start(async () => {
      const outcome = await cb();
      setNotice(outcome.message);
    });
  };
  const names = new Map(
    data.stage_options.map((stage) => [stage.id, stage.title]),
  );
  const formatAmount = (value: string) => {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
      : value;
  };

  return (
    <section
      id="construction-stage-payments"
      className="sc-panel rounded-2xl border p-5 sm:p-7"
      aria-label="Construction milestone payments"
    >
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
            Construction × Contract Billing
          </p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">
            Stage-wise payment eligibility
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Link each contractual payment milestone to its completed
            construction stages. A payment request is permitted only when every
            linked stage and prerequisite inspection, curing requirement and
            agreement are currently cleared. Actual payment and invoice status
            remain in the existing Billing workspace.
          </p>
        </div>
        <Link
          href="/dashboard/billing"
          className="self-start text-sm font-bold text-blue-700 underline"
        >
          Open Billing →
        </Link>
      </header>
      {!data.active_contract_id ? (
        <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          No single active contract has been verified. Resolve the signed
          agreement and contractual payment schedule before linking construction
          stages.
        </p>
      ) : data.items.length === 0 ? (
        <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          No active contractual payment schedule items. Create and activate the
          schedule in Billing first.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {data.items.map((item) => {
            const linked = item.linked_stage_ids.map((id) => ({
              id,
              name: names.get(id) ?? 'Associated stage',
              current: data.stage_options.some(
                (stage) => stage.id === id && stage.current,
              ),
            }));
            const canRequest =
              data.can_issue &&
              item.eligible &&
              item.is_stage_milestone &&
              !item.issued_request_id;
            return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {item.label}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {data.currency ? data.currency + ' ' : ''}
                      {formatAmount(item.expected_amount)}
                    </p>
                  </div>
                  <span
                    className={
                      'rounded-full px-3 py-1.5 text-xs font-semibold ' +
                      (item.issued_request_id
                        ? 'bg-slate-100 text-slate-700'
                        : item.eligible
                          ? 'bg-emerald-50 text-emerald-800'
                          : item.is_stage_milestone
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-blue-50 text-blue-800')
                    }
                  >
                    {item.issued_request_id
                      ? 'Request issued'
                      : item.eligible
                        ? 'Eligible to request'
                        : item.is_stage_milestone
                          ? 'Awaiting stages'
                          : 'Standard Billing milestone'}
                  </span>
                </div>
                {linked.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                    <p className="text-xs font-bold text-slate-700">
                      Required stages
                    </p>
                    {linked.map((stage) => (
                      <p
                        className="flex items-center justify-between gap-2 text-xs"
                        key={stage.id}
                      >
                        <span className="text-slate-700">{stage.name}</span>
                        <span
                          className={
                            stage.current
                              ? 'font-semibold text-emerald-700'
                              : 'font-semibold text-amber-800'
                          }
                        >
                          {stage.current
                            ? 'Current QC clearance'
                            : 'Pending or revoked'}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
                {item.due_trigger === 'construction_stage' &&
                  linked.length === 0 && (
                    <p className="mt-3 text-xs font-medium text-amber-900">
                      The contract requires stage clearance; select at least one
                      stage before requesting payment.
                    </p>
                  )}
                {data.can_bind && !item.issued_request_id && (
                  <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
                    <label className="flex-1 text-xs font-semibold text-slate-700">
                      Add required construction stage
                      <select
                        value={stageChoices[item.id] ?? ''}
                        onChange={(next) =>
                          setStageChoices((old) => ({
                            ...old,
                            [item.id]: next.target.value,
                          }))
                        }
                        className={'mt-2 ' + formInput}
                      >
                        <option value="">Select a stage</option>
                        {data.stage_options
                          .filter(
                            (stage) =>
                              !item.linked_stage_ids.includes(stage.id),
                          )
                          .map((stage) => (
                            <option value={stage.id} key={stage.id}>
                              {stage.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={formButton}
                      disabled={pending || !stageChoices[item.id]}
                      onClick={() =>
                        onSave(() =>
                          linkStageToPayment(
                            projectId,
                            item.id,
                            stageChoices[item.id] ?? '',
                          ),
                        )
                      }
                    >
                      Attach stage
                    </button>
                  </div>
                )}
                {item.issued_request_id ? (
                  <p className="mt-4 text-xs leading-5 text-slate-600">
                    A canonical payment request has already been issued. It is
                    not a payment receipt and must be reconciled in Billing.
                  </p>
                ) : canRequest ? (
                  <form
                    className="mt-4 space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const payload = new FormData(event.currentTarget);
                      onSave(() =>
                        requestCertifiedStagePayment(
                          projectId,
                          item.id,
                          payload,
                        ),
                      );
                    }}
                  >
                    <p className="text-xs font-bold text-slate-800">
                      Issue contractual payment request
                    </p>
                    <label className="block text-xs font-semibold text-slate-700">
                      Due date (optional)
                      <input
                        type="date"
                        name="due_date"
                        className={'mt-2 ' + formInput}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-700">
                      Note for Finance
                      <textarea
                        name="note"
                        rows={2}
                        maxLength={3000}
                        className={'mt-2 ' + formInput}
                        placeholder="Payment requested following recorded stage certification."
                      />
                    </label>
                    <button
                      className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                      disabled={pending}
                    >
                      Issue request through Billing
                    </button>
                  </form>
                ) : item.is_stage_milestone ? (
                  <p className="mt-4 text-xs font-medium text-amber-900">
                    Request blocked until every linked stage is currently
                    certified.
                  </p>
                ) : (
                  <p className="mt-4 text-xs text-slate-600">
                    This advance or ordinary commercial milestone continues
                    through the existing Billing workflow.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
