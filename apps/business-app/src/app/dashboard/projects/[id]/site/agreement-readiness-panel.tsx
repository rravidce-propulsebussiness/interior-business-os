'use client';

import { useState, useTransition } from 'react';
import { ProjectSiteMediaForm } from './forms';
import {
  recordSignedAgreement,
  createAgreementException,
  revokeAgreementClearance,
} from './agreement-actions';

export type ProjectAgreementState = {
  contract_id: string | null;
  contract_number: string | null;
  contract_status: string | null;
  contract_value: string | null;
  currency: string | null;
  active_contract_count: number;
  active_schedule: boolean;
  clearance_event_id: string | null;
  clearance_type: string | null;
  clearance_media_id: string | null;
  clearance_recorded_at: string | null;
  current_scope: boolean;
  execution_authorized: boolean;
  can_authorize_exception: boolean;
};

type FileChoice = {
  id: string;
  filename: string;
  category: string;
  mime: string;
};

const inputClass =
  'block w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 focus-visible:outline-blue-600';
const buttonClass =
  'rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';

export function AgreementReadinessPanel({
  projectId,
  state,
  files,
}: {
  projectId: string;
  state: ProjectAgreementState;
  files: FileChoice[];
}) {
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const pdfs = files.filter(
    (item) => item.mime === 'application/pdf' && item.category === 'agreement',
  );
  const canRecord =
    Boolean(state.contract_id) &&
    ['pending', 'active', 'on_hold'].includes(state.contract_status ?? '');
  const contractId = state.contract_id ?? '';
  return (
    <section
      id="agreement-readiness"
      className="sc-panel rounded-2xl border p-5 sm:p-7"
      aria-label="Agreement readiness"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
            Contractual start clearance
          </p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">
            Agreement & payment prerequisites
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Quotation acceptance is not a signed agreement. Physical work
            requires an active canonical contract, activated payment schedule,
            and current signed-copy evidence or an explicitly authorized owner
            exception.
          </p>
        </div>
        <span
          className={
            'rounded-full px-3 py-1.5 text-xs font-semibold ' +
            (state.execution_authorized
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-amber-50 text-amber-900')
          }
        >
          {state.execution_authorized
            ? 'Contractually cleared'
            : 'Start blocked'}
        </span>
      </header>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500">
            Canonical contract
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {state.contract_number ?? 'Not prepared'}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {state.contract_status ?? 'Unavailable'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500">
            Payment schedule
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {state.active_schedule ? 'Activated' : 'Not active'}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Canonical billing schedule only
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500">
            Agreement evidence
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {state.clearance_type === 'signed_copy_recorded'
              ? 'PDF recorded'
              : state.clearance_type === 'owner_exception'
                ? 'Owner exception'
                : state.clearance_type === 'revoked'
                  ? 'Revoked'
                  : 'Not recorded'}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {state.current_scope
              ? 'Matches recorded scope'
              : 'Review current scope'}
          </p>
        </div>
      </div>
      {state.active_contract_count > 1 && (
        <p className="mt-4 text-sm font-medium text-amber-800">
          Multiple active contracts exist for this project. Resolve the
          commercial contract selection before authorizing site execution.
        </p>
      )}
      <details className="mt-5 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-blue-900">
          Upload a private signed agreement PDF
        </summary>
        <p className="my-3 text-xs text-slate-600">
          Only authorized commercial project managers can upload or read these documents.
          They are not shared with architects, engineers or site security staff.
        </p>
        <ProjectSiteMediaForm project={projectId} phase="agreement" />
      </details>
      {canRecord && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <form
            className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const payload = new FormData(event.currentTarget);
              start(async () => {
                const result = await recordSignedAgreement(
                  projectId,
                  contractId,
                  payload,
                );
                setFeedback(result.message);
              });
            }}
          >
            <h3 className="text-sm font-bold text-slate-900">
              Record received signed PDF
            </h3>
            <p className="text-xs leading-5 text-slate-600">
              Select a private Agreement PDF. Recording its receipt does not cryptographically verify signatures.
            </p>
            <label className="block text-xs font-semibold text-slate-800">
              Uploaded PDF
              <select
                required
                className={'mt-2 ' + inputClass}
                name="media_id"
                defaultValue=""
              >
                <option value="">Choose project PDF</option>
                {pdfs.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.filename}
                  </option>
                ))}
              </select>
            </label>
            {pdfs.length === 0 && (
              <p className="text-xs text-amber-900">
                No private PDF is available in the permitted Design uploads.
                Upload the signed agreement while the project remains in the
                Design phase.
              </p>
            )}
            <label className="block text-xs font-semibold text-slate-800">
              Receipt and identity checks performed
              <textarea
                name="note"
                required
                minLength={12}
                maxLength={3000}
                rows={3}
                className={'mt-2 ' + inputClass}
                placeholder="Record where the paper agreement came from and who checked the copy."
              />
            </label>
            <button
              disabled={pending || pdfs.length === 0}
              className={buttonClass}
            >
              Record signed-copy evidence
            </button>
          </form>
          {state.can_authorize_exception && (
            <form
              className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                const payload = new FormData(event.currentTarget);
                start(async () => {
                  const result = await createAgreementException(
                    projectId,
                    contractId,
                    payload,
                  );
                  setFeedback(result.message);
                });
              }}
            >
              <h3 className="text-sm font-bold text-slate-900">
                Exceptional owner authorization
              </h3>
              <p className="text-xs leading-5 text-slate-600">
                Reserved for documented contractual exceptions, not routine
                unsigned agreements. This is an auditable owner action, not a
                customer signature.
              </p>
              <label className="block text-xs font-semibold text-slate-800">
                Written reason
                <textarea
                  name="reason"
                  required
                  minLength={30}
                  maxLength={3000}
                  rows={3}
                  className={'mt-2 ' + inputClass}
                  placeholder="Explain the contractual basis, risks and authorization."
                />
              </label>
              <label className="block text-xs font-semibold text-slate-800">
                Supporting reference
                <input
                  name="reference"
                  required
                  minLength={8}
                  maxLength={1000}
                  className={'mt-2 ' + inputClass}
                  placeholder="Internal approval record ID"
                />
              </label>
              <button disabled={pending} className={buttonClass}>
                Record exceptional owner clearance
              </button>
            </form>
          )}
        </div>
      )}
      {state.clearance_event_id &&
        state.clearance_type !== 'revoked' &&
        canRecord && (
          <details className="mt-5 rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              Revoke recorded clearance
            </summary>
            <div className="mt-3 flex flex-col items-start gap-3">
              <textarea
                className={inputClass}
                rows={2}
                aria-label="Reason for revoking agreement clearance"
                minLength={10}
                maxLength={3000}
                value={revokeReason}
                onChange={(event) => setRevokeReason(event.target.value)}
                placeholder="Reason for revocation"
              />
              <button
                type="button"
                disabled={pending || revokeReason.trim().length < 10}
                className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
                onClick={() =>
                  start(async () => {
                    const result = await revokeAgreementClearance(
                      projectId,
                      contractId,
                      state.clearance_event_id!,
                      revokeReason,
                    );
                    setFeedback(result.message);
                    if (result.saved) setRevokeReason('');
                  })
                }
              >
                Revoke clearance
              </button>
            </div>
          </details>
        )}
      {feedback && (
        <p role="status" className="mt-4 text-sm font-semibold text-blue-800">
          {feedback}
        </p>
      )}
    </section>
  );
}
