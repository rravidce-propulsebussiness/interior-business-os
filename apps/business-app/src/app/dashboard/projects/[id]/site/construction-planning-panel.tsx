'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { OwnerStageEditor } from './owner-stage-editor';
import {
  ConstructionStageQuality,
  type ConstructionQualityData,
} from './construction-stage-quality';
import {
  assignConstructionRole,
  deactivateConstructionRole,
  syncConstructionFromProjectAgreement,
} from './construction-actions';

export type ConstructionPlanningData = {
  can_manage: boolean;
  workflow: {
    id: string;
    template_code: string;
    template_version: string;
    status: string;
    version: number;
    floor_snapshot: { code: string; name: string }[];
  } | null;
  roles: {
    id: string;
    user_id: string;
    role: string;
    active: boolean;
    version: number;
  }[];
  stages: {
    id: string;
    instance_code: string;
    template_code: string;
    phase: string;
    floor_code: string | null;
    title: string;
    explanation: string;
    hold_point: string | null;
    activities: string[];
    inspection_topics: string[];
    dependencies: string[];
    status: string;
    task_count: number;
    display_order?: number;
    owner_version?: number;
  }[];
};

const roles = [
  ['project_director', 'Project Director'],
  ['project_manager', 'Project Manager'],
  ['architect', 'Architect / Designer'],
  ['structural_engineer', 'Structural Engineer'],
  ['site_engineer', 'Civil Site Engineer'],
  ['supervisor', 'Site Supervisor'],
  ['quality_inspector', 'Quality Control Inspector'],
  ['watchman', 'Watchman / Security'],
  ['procurement', 'Procurement Manager'],
  ['storekeeper', 'Storekeeper'],
  ['electrical_engineer', 'Electrical Engineer'],
  ['plumbing_engineer', 'Plumbing Engineer'],
  ['mep_engineer', 'MEP Engineer'],
  ['quantity_surveyor', 'Quantity Surveyor'],
  ['accounts_officer', 'Billing / Accounts Officer'],
  ['contractor', 'Contractor / Subcontractor'],
] as const;
const constructionPhases = [
  'preconstruction',
  'design',
  'site_preparation',
  'foundation',
  'plinth',
  'superstructure',
  'masonry',
  'finishes',
  'handover',
] as const;
const interiorPhases = [
  'preconstruction',
  'survey',
  'design',
  'procurement',
  'civil',
  'services',
  'fabrication',
  'installation',
  'finishes',
  'quality',
  'handover',
] as const;
const phaseTitles: Record<string, string> = {
  survey: 'Site measurement & survey',
  procurement: 'Materials, samples & procurement',
  civil: 'Interior civil preparation',
  services: 'Electrical, plumbing & services',
  fabrication: 'Carpentry & fabrication',
  installation: 'Interior installation by room',
  quality: 'Final functional checks & snagging',
  preconstruction: '01 · Agreement & preconstruction',
  design: '02 · Design and engineering',
  site_preparation: '03 · Site preparation',
  foundation: '04 · Foundation',
  plinth: '05 · Plinth',
  superstructure: '06 · RCC by floor',
  masonry: '07 · Masonry and services',
  finishes: '08 · Waterproofing and finishes',
  handover: '09 · Handover',
};
const inputStyle =
  'block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-blue-600';

function labelForRole(role: string) {
  return (
    roles.find((item) => item[0] === role)?.[1] ?? role.replaceAll('_', ' ')
  );
}

export function ConstructionPlanningPanel({
  projectId,
  data,
  memberOptions,
  quality,
  canOwnerEdit = false,
}: {
  projectId: string;
  data: ConstructionPlanningData;
  memberOptions: { id: string; label: string }[];
  quality?: ConstructionQualityData | null;
  canOwnerEdit?: boolean;
}) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const managers = data.can_manage;
  const isInterior = data.workflow?.template_code === 'INTERIOR_QUOTE';
  const phases: readonly string[] =
    data.workflow?.template_code === 'INTERIOR_QUOTE'
      ? interiorPhases
      : constructionPhases;
  const activeRoles = data.roles.filter((role) => role.active);
  const nameById = new Map(
    memberOptions.map((member) => [member.id, member.label]),
  );
  const countByPhase = new Map<string, ConstructionPlanningData['stages']>();
  for (const stage of data.stages) {
    const existing = countByPhase.get(stage.phase) ?? [];
    existing.push(stage);
    countByPhase.set(stage.phase, existing);
  }

  return (
    <section
      id="construction-planning"
      className="space-y-5"
      aria-label={isInterior ? 'Interior execution planning' : 'Construction execution planning'}
    >
      <div className="sc-panel rounded-2xl border p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
              {isInterior ? 'Connected interior project delivery' : 'Connected construction planning'}
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
              {data.workflow?.template_code === 'INTERIOR_QUOTE'
                ? 'Interior stages from accepted BOQ'
                : 'Construction stages from accepted quotation'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Quote-derived project planning. Physical progress, mandatory
              inspections and payments remain controlled by the existing
              Operations, Contract and Billing systems.
            </p>
          </div>
          {data.workflow && (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
              Planning · v{data.workflow.template_version}
            </span>
          )}
        </div>

        {!data.workflow ? (
          <div className="mt-5 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-4 sm:p-5">
            <h3 className="text-base font-bold text-slate-900">
              Stages come from the approved quotation
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Issue the quotation with the applicable room-wise BOQ or
              floor-wise construction scope, included areas, additional works
              and company-specific package specifications. After customer
              approval, create the agreement. The relevant interior or
              construction project timeline is generated from that accepted
              revision; no duplicate floor, room or stage setup is required.
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              The stage plan is initially planned only. Signed agreement, client
              design approvals, independent QC and payment release controls
              still apply before site execution.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/dashboard/quotations"
                className="inline-flex rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-sm font-semibold text-blue-800"
              >
                Open quotations
              </Link>
              {managers && (
                <button
                  disabled={pending}
                  className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  onClick={() => {
                    start(async () => {
                      const result =
                        await syncConstructionFromProjectAgreement(projectId);
                      setMessage(result.message);
                    });
                  }}
                >
                  {pending
                    ? 'Checking agreement…'
                    : 'Recover plan from accepted agreement'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500">
                  Planned stages
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.stages.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500">
                  {data.workflow.template_code === 'INTERIOR_QUOTE'
                    ? 'Rooms / areas'
                    : 'Floors / levels'}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.workflow.floor_snapshot.length}
                </p>
              </div>
              <div className="col-span-2 rounded-xl border border-slate-200 p-4 sm:col-span-1">
                <p className="text-xs font-semibold text-slate-500">
                  Recorded progress
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  In Operations only
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Stage progress is not inferred from the planning checklist. Each
              approved task must be linked to the canonical Operations schedule.
            </p>
            <div className="mt-5 space-y-3">
              {phases.map((phase) => {
                const items = countByPhase.get(phase) ?? [];
                if (!items.length) return null;
                return (
                  <details
                    key={phase}
                    className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-bold text-slate-900">
                      <span>{phaseTitles[phase]}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {items.length} {items.length === 1 ? 'stage' : 'stages'}
                      </span>
                    </summary>
                    <div className="mt-4 space-y-3">
                      {items.map((stage) => (
                        <div
                          key={stage.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-slate-900">
                                {stage.title}
                              </h4>
                              <p className="mt-1 text-xs text-slate-500">
                                {stage.instance_code}
                              </p>
                            </div>
                            <span className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                              Not started
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {stage.explanation}
                          </p>
                          {stage.dependencies.length > 0 && (
                            <p className="mt-2 text-xs text-slate-600">
                              <strong>Requires:</strong>{' '}
                              {stage.dependencies.join(', ')}
                            </p>
                          )}
                          {stage.hold_point && (
                            <p className="mt-2 text-xs font-semibold text-amber-800">
                              Approval hold point:{' '}
                              {stage.hold_point.replaceAll('_', ' ')}
                            </p>
                          )}
                          {canOwnerEdit && (
                            <OwnerStageEditor
                              projectId={projectId}
                              stage={stage}
                            />
                          )}
                          <details className="mt-3 text-sm text-slate-700">
                            <summary className="cursor-pointer font-semibold text-blue-800">
                              View {stage.activities.length} planned activities
                              & quality topics
                            </summary>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                              {stage.activities.map((activity, index) => (
                                <li key={index}>{activity}</li>
                              ))}
                            </ul>
                            {stage.inspection_topics.length > 0 && (
                              <div className="mt-3 border-t border-slate-200 pt-3">
                                <p className="font-semibold">
                                  Inspection topics
                                </p>
                                <ul className="mt-2 list-disc space-y-1 pl-5">
                                  {stage.inspection_topics.map(
                                    (topic, index) => (
                                      <li key={index}>{topic}</li>
                                    ),
                                  )}
                                </ul>
                              </div>
                            )}
                          </details>
                          {quality?.stages.find(
                            (entry) => entry.stage_id === stage.id,
                          ) && (
                            <ConstructionStageQuality
                              projectId={projectId}
                              stageId={stage.id}
                              canManage={managers}
                              quality={quality.stages.find(
                                (entry) => entry.stage_id === stage.id,
                              )!}
                              choices={quality.available_inspections}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </>
        )}
        <div className="mt-5">
          <Link
            href={'/dashboard/operations?project=' + projectId}
            className="text-sm font-bold text-blue-700 underline"
          >
            Open existing Operations schedule and inspections →
          </Link>
        </div>
      </div>

      {managers && (
        <div className="sc-panel rounded-2xl border p-5 sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
              Project-specific access
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              {isInterior ? 'Interior delivery team & roles' : 'Construction team & roles'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              One team member can hold several scoped roles. Only active company
              employees are assignable here; homeowners receive separate
              verified client access later.
            </p>
          </div>
          <form
            className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const target = event.currentTarget;
              const payload = new FormData(target);
              start(async () => {
                const result = await assignConstructionRole(projectId, payload);
                setMessage(result.message);
                if (result.saved) target.reset();
              });
            }}
          >
            <label className="block text-sm font-semibold text-slate-800">
              Company member
              <select
                required
                name="user_id"
                defaultValue=""
                className={'mt-2 ' + inputStyle}
              >
                <option value="">Select employee</option>
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              Project role
              <select
                required
                name="role"
                defaultValue=""
                className={'mt-2 ' + inputStyle}
              >
                <option value="">Choose role</option>
                {roles.map(([code, title]) => (
                  <option value={code} key={code}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={pending}
              className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              Assign role
            </button>
          </form>
          {activeRoles.length > 0 && (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {activeRoles.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {nameById.get(assignment.user_id) ?? 'Assigned employee'}
                    </p>
                    <p className="text-xs text-slate-600">
                      {labelForRole(assignment.role)}
                    </p>
                  </div>
                  <button
                    disabled={pending}
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() =>
                      start(async () => {
                        const result = await deactivateConstructionRole(
                          projectId,
                          assignment.id,
                          assignment.version,
                        );
                        setMessage(result.message);
                      })
                    }
                  >
                    Deactivate
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900"
        >
          {message}
        </p>
      )}
    </section>
  );
}
