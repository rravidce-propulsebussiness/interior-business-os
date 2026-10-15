'use client';

import { useState, useTransition } from 'react';
import {
  certifyConstructionStage,
  linkStageInspection,
  reviewStageInspection,
} from './construction-quality-actions';

export type ConstructionQualityData = {
  available_inspections: {
    id: string;
    number: string;
    status: string;
    mandatory: boolean;
    is_final: boolean;
  }[];
  stages: {
    stage_id: string;
    title: string;
    instance_code: string;
    hold_point: string | null;
    cleared: boolean;
    inspections: {
      id: string;
      number: string;
      status: string;
      mandatory: boolean;
      inspector_id: string;
      approved_by: string | null;
      current: boolean;
    }[];
    reviews: {
      id: string;
      review_kind: 'quality' | 'structural';
      decision: 'approved' | 'rejected';
      reviewer_id: string;
      notes: string;
      inspections_id: string;
      reviewed_at: string;
    }[];
  }[];
};

const formInput =
  'mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-blue-600';

export function ConstructionStageQuality({
  projectId,
  stageId,
  canManage,
  quality,
  choices,
}: {
  projectId: string;
  stageId: string;
  canManage: boolean;
  quality: ConstructionQualityData['stages'][number];
  choices: ConstructionQualityData['available_inspections'];
}) {
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  const eligible = choices.filter(
    (choice) =>
      choice.mandatory &&
      (quality.hold_point === 'handover' || !choice.is_final),
  );
  const latestQuality = quality.reviews.find(
    (entry) => entry.review_kind === 'quality',
  );
  const latestStructural = quality.reviews.find(
    (entry) => entry.review_kind === 'structural',
  );
  return (
    <details className="mt-4 rounded-xl border border-blue-200 bg-white p-4">
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-slate-900">
        <span>Formal quality checks & structural clearance</span>
        <span
          className={
            'rounded-full px-2.5 py-1 text-xs font-bold ' +
            (quality.cleared
              ? 'bg-emerald-50 text-emerald-900'
              : 'bg-amber-50 text-amber-900')
          }
        >
          {quality.cleared ? 'Certified' : 'Not cleared'}
        </span>
      </summary>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        These checks use the existing Operations inspection engine. Each
        attached mandatory inspection must pass, assigned work must be
        completed, and separate authorised reviewers must approve. This does not
        generate an invoice.
      </p>
      <div className="mt-4 space-y-2">
        {quality.inspections.length === 0 ? (
          <p className="text-sm font-medium text-amber-900">
            No formal inspections attached yet.
          </p>
        ) : (
          quality.inspections.map((inspection) => (
            <div
              key={inspection.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {inspection.number}
                </p>
                <p className="text-xs text-slate-600">
                  Status: {inspection.status.replaceAll('_', ' ')}
                  {inspection.current
                    ? ' · Current passing result'
                    : ' · Not a current pass'}
                </p>
              </div>
              <span className="text-xs font-medium text-slate-700">
                {inspection.mandatory ? 'Mandatory' : 'Optional'}
              </span>
            </div>
          ))
        )}
      </div>
      {canManage && (
        <form
          className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const payload = new FormData(event.currentTarget);
            start(async () => {
              const result = await linkStageInspection(
                projectId,
                stageId,
                payload,
              );
              setFeedback(result.message);
            });
          }}
        >
          <label className="block text-xs font-semibold text-slate-800">
            Attach existing mandatory Operations inspection
            <select
              name="inspection_id"
              defaultValue=""
              required
              className={formInput}
            >
              <option value="">Select inspection</option>
              {eligible.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.number} — {item.status.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={pending || eligible.length === 0}
            className="rounded-xl border border-blue-300 px-4 py-2 text-xs font-semibold text-blue-800 disabled:opacity-50"
          >
            Link inspection to this stage
          </button>
        </form>
      )}
      {quality.inspections.length > 0 && (
        <form
          className="mt-4 space-y-3 rounded-xl border border-slate-200 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const payload = new FormData(event.currentTarget);
            start(async () => {
              const result = await reviewStageInspection(
                projectId,
                stageId,
                payload,
              );
              setFeedback(result.message);
            });
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Independent reviewer
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-800">
              Inspection
              <select
                name="inspection_id"
                required
                defaultValue=""
                className={formInput}
              >
                <option value="">Choose attached inspection</option>
                {quality.inspections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.number} — {item.status}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-800">
              Reviewer discipline
              <select
                name="review_kind"
                defaultValue="quality"
                className={formInput}
              >
                <option value="quality">Quality inspector</option>
                {quality.hold_point === 'structural' && (
                  <option value="structural">Structural engineer</option>
                )}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-800">
              Decision
              <select
                name="decision"
                defaultValue=""
                required
                className={formInput}
              >
                <option value="">Choose decision</option>
                <option value="approved">Passed / approved</option>
                <option value="rejected">Failed / requires rework</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-800 sm:col-span-2">
              Findings and supporting notes
              <textarea
                className={formInput}
                name="notes"
                required
                minLength={12}
                maxLength={2500}
                rows={3}
                placeholder="Include measured checks, evidence and observed defects."
              />
            </label>
          </div>
          <button
            disabled={pending}
            className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Submit signed-in reviewer decision
          </button>
          <p className="text-xs text-slate-600">
            Only individually assigned quality inspectors or structural
            engineers may sign their respective review. Managers cannot
            impersonate reviewers.
          </p>
        </form>
      )}
      <div className="mt-4 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
        <p>
          <strong>QC:</strong>{' '}
          {latestQuality
            ? `${latestQuality.decision} — ${latestQuality.notes}`
            : 'Awaiting independent review'}
        </p>
        {quality.hold_point === 'structural' && (
          <p>
            <strong>Structural:</strong>{' '}
            {latestStructural
              ? `${latestStructural.decision} — ${latestStructural.notes}`
              : 'Awaiting structural sign-off'}
          </p>
        )}
      </div>
      {canManage && !quality.cleared && (
        <form
          className="mt-4 space-y-3 border-t border-slate-200 pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const payload = new FormData(event.currentTarget);
            start(async () => {
              const result = await certifyConstructionStage(
                projectId,
                stageId,
                payload,
              );
              setFeedback(result.message);
            });
          }}
        >
          <label className="block text-xs font-semibold text-slate-800">
            Project manager certification note
            <textarea
              className={formInput}
              name="notes"
              required
              minLength={12}
              maxLength={3000}
              rows={2}
              placeholder="Why this stage is complete, with linked quality checks."
            />
          </label>
          <button
            disabled={pending}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Issue audited stage clearance
          </button>
        </form>
      )}
      {feedback && (
        <p className="mt-3 text-sm font-semibold text-blue-800" role="status">
          {feedback}
        </p>
      )}
    </details>
  );
}
