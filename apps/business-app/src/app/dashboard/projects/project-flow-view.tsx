import Link from 'next/link';
import type { ReactNode } from 'react';
import { OwnerIcon, type OwnerIconName } from '../owner-shell';
import {
  chronologicalGroups,
  floorName,
  flowBuckets,
  flowRole,
  isDone,
  measurementPrompts,
  nextAction,
  projectWorkItems,
  stageLabel,
  type FlowBuckets,
  type FlowRole,
  type WorkItem,
} from './project-flow';
import { WorkItemCard, type WorkItemView } from './project-work-item-card';
import {
  CuringPlanForm,
  CuringRounds,
  type CuringRoundView,
} from './project-curing-card';
import {
  AdvancePolicyToggle,
  DesignDecisionForm,
  StageButton,
} from './project-flow-controls';
import { StageChecklistItem } from './project-stage-checklist-item';
import { StageOnsiteQcReview } from './project-onsite-qc-review';
import { GateForm } from './project-v2-forms';
import { projectTimelineStages } from './project-visible-stages';
import { ProjectQuotePaymentFlow } from './project-quote-payment-flow';
import {
  formatMoney,
  pretty,
  shortDate,
  stringValue,
  type WorkspaceData,
} from './project-v2-data';
import './project-flow.css';

/** One project, one flow. Every role sees the same canonical records, ordered
 * for what that person must do next. Specialist pages stay linked below. */

const zone = 'Asia/Kolkata';
const ymd = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
const hm = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
const roleName: Record<FlowRole, string> = {
  owner: 'Owner view',
  engineer: 'Site engineer',
  watchman: 'Watchman',
  qc: 'Quality inspector',
  designer: 'Design team',
  viewer: 'Project team',
};
const kindName: Record<string, string> = {
  architectural_plan: 'Floor plan',
  interior_layout: 'Interior layout',
  structural_design: 'Structural design',
  '3d_design': '3D visualisation',
  electrical_plan: 'Electrical plan',
  plumbing_plan: 'Plumbing plan',
};

function Section({
  id,
  icon,
  title,
  count,
  tone = 'orange',
  children,
  hint,
}: {
  id: string;
  icon: OwnerIconName;
  title: string;
  count?: number;
  tone?: 'orange' | 'violet' | 'green' | 'red' | 'grey';
  children: ReactNode;
  hint?: string | undefined;
}) {
  return (
    <section className="pf-section" id={id} aria-labelledby={id + '-title'}>
      <header className="pf-section-head">
        <span className={'pf-icon pf-icon-' + tone}>
          <OwnerIcon name={icon} size={18} />
        </span>
        <div>
          <h2 id={id + '-title'}>
            {title}
            {typeof count === 'number' && (
              <span className="pf-count">{count}</span>
            )}
          </h2>
          {hint && <p>{hint}</p>}
        </div>
      </header>
      <div className="pf-section-body">{children}</div>
    </section>
  );
}

export function ProjectFlow({ d }: { d: WorkspaceData }) {
  const site = d.site;
  const role = flowRole({
    canManage: site?.canManage === true,
    siteRole: site?.role ?? '',
    qcReviewer: d.stageQc.canReview && !site?.canManage,
  });
  const now = new Date();
  const today = ymd(now),
    tomorrow = ymd(new Date(now.getTime() + 86400000));
  const stages = projectTimelineStages(d.stages);
  const items = projectWorkItems({
    stages,
    work: d.stageProgress.work,
    optional: d.flow.optional,
    plans: d.itemPlans,
    execution: d.stageExecution,
  });
  const b = flowBuckets(
    items,
    { today, tomorrow },
    { userId: d.flow.userId, owner: role === 'owner' },
  );
  const curing = d.flow.curing;
  const action = nextAction(role, b, curing);
  const executing = site?.stage === 'execution';
  const people = new Map(
    (site?.memberOptions ?? []).map((m) => [m.id, m.label]),
  );
  const engineers = (site?.team ?? [])
    .filter(
      (t) =>
        t.active === true &&
        ['site_engineer', 'manager'].includes(stringValue(t.role)),
    )
    .map((t) => ({
      id: stringValue(t.user_id),
      label: people.get(stringValue(t.user_id)) ?? pretty(t.role),
    }));
  const materials = site?.materials ?? [];
  const materialStage = new Map(
    d.links
      .filter((l) => l.kind === 'material')
      .map((l) => [l.record_id, l.stage_id]),
  );
  const view = (item: WorkItem): WorkItemView => ({
    key: item.key,
    stageId: item.stage.id,
    index: item.index,
    title: item.title,
    stageLabel: stageLabel(item.stage),
    status: item.status,
    stageStatus: item.stageStatus,
    blockers: item.blockers,
    optional: item.optional,
    assigneeId: item.assigneeId,
    assigneeLabel: item.assigneeId
      ? item.assigneeId === d.flow.userId
        ? 'You'
        : (people.get(item.assigneeId) ?? 'Assigned')
      : '',
    crew: item.crew,
    skipReason: item.skipReason,
    measurements: item.measurements,
    prompts: measurementPrompts(item.title),
    planned: item.plannedStart ? shortDate(item.plannedStart) : '',
    hasPhoto: Boolean(item.photoId),
    openMaterials: materials.filter(
      (m) =>
        materialStage.get(m.id) === item.stage.id &&
        Number(m.activity_index) === item.index &&
        ['requested', 'approved', 'ordered'].includes(stringValue(m.status)),
    ).length,
  });
  const canWork = executing && (role === 'owner' || role === 'engineer');
  const canRequest = canWork || site?.role === 'procurement';
  const card = (item: WorkItem) => (
    <WorkItemCard
      key={item.key}
      projectId={d.project.id}
      item={view(item)}
      canWork={canWork}
      canOwn={role === 'owner'}
      canRequest={canRequest}
      engineers={engineers}
      boq={d.flow.boq}
      tomorrow={tomorrow}
    />
  );

  const rounds: CuringRoundView[] = (curing?.rounds ?? []).map((r) => {
    const at = new Date(r.roundAt);
    const age = now.getTime() - at.getTime();
    return {
      key: r.planId + r.roundAt,
      planId: r.planId,
      title: r.title,
      roundAt: r.roundAt,
      time: hm(at),
      day:
        ymd(at) === today
          ? 'Today'
          : ymd(at) === tomorrow
            ? 'Tomorrow'
            : shortDate(r.roundAt),
      status: r.status,
      late: r.late,
      remarks: r.remarks,
      hasPhoto: r.hasPhoto,
      recordable:
        r.status !== 'recorded' && age <= 86400000 && age >= -30 * 60000,
    };
  });
  const missed =
    curing?.missedTotal ?? rounds.filter((r) => r.status === 'missed').length;
  const due = rounds.filter((r) => r.status === 'due').length;
  const photos = (site?.media ?? [])
    .filter((m) => stringValue(m.mime).startsWith('image/'))
    .map((m) => ({ id: m.id, filename: stringValue(m.filename) }));

  // Site checks that must pass (with photo) before a stage can go to QC.
  const checksFor = (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    return (stage?.inspectionTopics ?? []).map((title, index) => {
      const rec = d.stageProgress.checks.find(
        (c) =>
          stringValue(c.stage_id) === stageId &&
          stringValue(c.title).toLowerCase() === title.toLowerCase(),
      );
      return {
        title,
        index,
        status: stringValue(rec?.status) || 'pending',
        photoId: stringValue(rec?.photo_id),
        notes: stringValue(rec?.notes),
      };
    });
  };
  const checkStages = b.active.filter((s) =>
    checksFor(s.id).some((c) => c.status !== 'passed'),
  );
  const startable = stages
    .filter(
      (s) =>
        ![
          'QUOTED_SCOPE',
          'PRECONSTRUCTION',
          'DESIGN',
          'DESIGN_APPROVAL',
          'SITE_SURVEY',
        ].includes(s.template_code),
    )
    .filter((s) => {
      const e = d.stageExecution.find((x) => x.stageId === s.id);
      return (
        (e?.status ?? 'not_started') === 'not_started' &&
        (e?.blockers.length ?? 1) === 0
      );
    });
  const tomorrowMaterials = materials.filter(
    (m) => stringValue(m.required_date) === tomorrow,
  );

  const stats = [
    { label: 'Today', value: b.today.length },
    { label: 'Tomorrow', value: b.tomorrow.length },
    { label: 'Awaiting QC', value: b.awaitingQc.length },
    ...(curing
      ? [
          {
            label: missed ? 'Curing missed' : 'Curing due',
            value: missed || due,
          },
        ]
      : []),
  ];

  return (
    <div className={'pf-flow pf-role-' + role}>
      <section
        className={'pf-hero pf-tone-' + action.tone}
        aria-label="Your next action"
      >
        <div className="pf-hero-copy">
          <span className="pf-role">{roleName[role]}</span>
          <small>Next action</small>
          <h1>{action.title}</h1>
          <p>{action.detail}</p>
        </div>
        <a className="pf-hero-go" href={action.anchor}>
          Go <OwnerIcon name="arrow" size={16} />
        </a>
        {role !== 'watchman' && (
          <ul className="pf-stats">
            {stats.map((s) => (
              <li key={s.label}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {role !== 'watchman' && <ProjectQuotePaymentFlow d={d} />}

      {role === 'watchman' && (
        <>
          <Section
            id="flow-curing"
            icon="check"
            title="Curing rounds"
            count={rounds.filter((r) => r.recordable).length}
            hint="Tap a due round, add a remark and a photo."
          >
            {curing ? (
              <CuringRounds
                projectId={d.project.id}
                rounds={rounds}
                canRecord={curing.canRecord}
              />
            ) : (
              <p className="pf-empty">No curing schedule assigned.</p>
            )}
          </Section>
          {executing && (
            <Section
              id="flow-security"
              icon="building"
              title="Security & gate"
              tone="grey"
              hint="Security rounds, deliveries and visitors."
            >
              <details className="pf-drawer">
                <summary>＋ Add security / gate entry</summary>
                <GateForm id={d.project.id} />
              </details>
            </Section>
          )}
        </>
      )}

      {(role === 'engineer' || role === 'owner') && (
        <>
          {d.flow.design && d.flow.design.stage === 'design' && (
            <DesignJourney d={d} role={role} />
          )}
          <Section
            id="flow-today"
            icon="calendar"
            title="Today's work"
            count={b.today.length}
            hint={
              b.active.length > 1
                ? b.active.length +
                  ' stages running in parallel: ' +
                  b.active.map(stageLabel).join(' · ')
                : undefined
            }
          >
            {b.today.length ? (
              <div className="pf-list">{b.today.map(card)}</div>
            ) : (
              <p className="pf-empty">
                {executing
                  ? 'No work scheduled for today. Start an eligible stage below.'
                  : 'Site work starts after agreement, design, payment and safety gates pass.'}
              </p>
            )}
          </Section>
          {canWork && startable.length > 0 && (
            <Section
              id="flow-start"
              icon="projects"
              title="Ready to start"
              count={startable.length}
              tone="green"
              hint="All prerequisites and hold points are clear. Stages on different floors can run together."
            >
              <ul className="pf-plain">
                {startable.map((s) => (
                  <li key={s.id}>
                    <span>
                      <b>{stageLabel(s)}</b>
                      <small>{s.activities.length} work items</small>
                    </span>
                    <StageButton
                      projectId={d.project.id}
                      stageId={s.id}
                      action="start"
                      label="Start stage"
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {checkStages.length > 0 && (
            <Section
              id="flow-checks"
              icon="check"
              title="Required checks"
              tone="violet"
              hint="Pass each check with a photo before requesting QC."
            >
              {checkStages.map((s) => (
                <div key={s.id} className="pf-check-group">
                  <h3>{stageLabel(s)}</h3>
                  {checksFor(s.id).map((c) => (
                    <StageChecklistItem
                      key={c.index}
                      projectId={d.project.id}
                      stageId={s.id}
                      kind="check"
                      index={c.index}
                      title={c.title}
                      status={c.status}
                      notes={c.notes}
                      photoId={c.photoId}
                      photos={photos}
                      canEdit={canWork}
                    />
                  ))}
                </div>
              ))}
            </Section>
          )}
          {(b.readyForQc.length > 0 || b.awaitingQc.length > 0) && (
            <Section
              id="flow-qc"
              icon="check"
              title="Submit for QC"
              tone="violet"
              count={b.readyForQc.length}
              hint="An independent QC inspector decides pass or fail. Corrections reopen only the failed item."
            >
              <ul className="pf-plain">
                {b.readyForQc.map((s) => (
                  <li key={s.id}>
                    <span>
                      <b>{stageLabel(s)}</b>
                      <small>All work done</small>
                    </span>
                    {canWork && (
                      <StageButton
                        projectId={d.project.id}
                        stageId={s.id}
                        action="submit_for_qc"
                        label="Submit for QC"
                      />
                    )}
                  </li>
                ))}
                {b.awaitingQc.map((s) => (
                  <li key={s.id}>
                    <span>
                      <b>{stageLabel(s)}</b>
                      <small>Waiting for QC inspector</small>
                    </span>
                    <span className="pf-pill pf-pill-on_hold">Awaiting QC</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section
            id="flow-tomorrow"
            icon="calendar"
            title="Tomorrow"
            count={b.tomorrow.length + tomorrowMaterials.length}
            tone="violet"
          >
            {b.tomorrow.length + tomorrowMaterials.length ? (
              <ul className="pf-plain">
                {b.tomorrow.map((i) => (
                  <li key={i.key}>
                    <span>
                      <b>{i.title}</b>
                      <small>{stageLabel(i.stage)}</small>
                    </span>
                    <span className="pf-pill">Planned</span>
                  </li>
                ))}
                {tomorrowMaterials.map((m) => (
                  <li key={m.id}>
                    <span>
                      <b>{stringValue(m.item)}</b>
                      <small>
                        {stringValue(m.quantity)} {stringValue(m.unit)} needed
                      </small>
                    </span>
                    <span
                      className={
                        'pf-pill pf-pill-' +
                        (stringValue(m.status) === 'received'
                          ? 'completed'
                          : 'on_hold')
                      }
                    >
                      {pretty(m.status)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pf-empty">
                Nothing planned yet. Plan dates in the stage schedule or request
                tomorrow&apos;s material from a work item.
              </p>
            )}
          </Section>
        </>
      )}

      {(role === 'engineer' || role === 'owner') &&
        curing &&
        (curing.plans.length > 0 || curing.canPlan) && (
          <Section
            id="flow-curing"
            icon="check"
            title="Curing"
            tone={missed ? 'red' : 'green'}
            count={rounds.filter((r) => r.recordable).length}
            hint={
              missed
                ? missed +
                  ' scheduled round(s) were missed — no round is ever assumed.'
                : 'Rounds come from approved specifications only.'
            }
          >
            <CuringRounds
              projectId={d.project.id}
              rounds={rounds}
              canRecord={curing.canRecord}
            />
            {curing.canPlan && executing && (
              <details className="pf-drawer">
                <summary>＋ Approve a curing schedule</summary>
                <CuringPlanForm
                  projectId={d.project.id}
                  today={today}
                  stages={stages
                    .filter(
                      (s) =>
                        ![
                          'QUOTED_SCOPE',
                          'PRECONSTRUCTION',
                          'DESIGN',
                          'DESIGN_APPROVAL',
                          'SITE_SURVEY',
                        ].includes(s.template_code),
                    )
                    .map((s) => ({ id: s.id, label: stageLabel(s) }))}
                />
              </details>
            )}
          </Section>
        )}

      {(role === 'qc' || role === 'owner') && (
        <Section
          id={role === 'qc' ? 'flow-qc' : 'flow-qc-review'}
          icon="check"
          title="Inspections awaiting decision"
          tone="violet"
          count={b.awaitingQc.length}
          hint="Inspect on site, record pass or fail with a photo. You cannot approve work you checked yourself."
        >
          {b.awaitingQc.length ? (
            b.awaitingQc.map((s) =>
              role === 'qc' || d.stageQc.canReview ? (
                <StageOnsiteQcReview
                  key={s.id}
                  projectId={d.project.id}
                  stageId={s.id}
                  stageName={stageLabel(s)}
                  topics={s.inspectionTopics}
                  topicIndices={s.inspectionTopics.map((_, i) => i)}
                  stageStatus="ready_for_qc"
                  canReview={d.stageQc.canReview}
                  isOwner={d.stageQc.isOwner}
                  canManage={site?.canManage === true}
                  inspectorAssigned={d.stageQc.inspectorAssigned}
                  records={d.stageQc.records.filter((r) => r.stage_id === s.id)}
                  photos={photos}
                  existingChecks={d.stageProgress.checks
                    .filter((c) => stringValue(c.stage_id) === s.id)
                    .map((c) => ({
                      title: stringValue(c.title),
                      photoId: stringValue(c.photo_id),
                      status: stringValue(c.status),
                    }))}
                />
              ) : (
                <p key={s.id}>{stageLabel(s)}</p>
              ),
            )
          ) : (
            <p className="pf-empty">Nothing is waiting for inspection.</p>
          )}
        </Section>
      )}

      {role === 'designer' && <DesignJourney d={d} role={role} />}

      {role === 'owner' && (
        <OwnerOverview
          d={d}
          items={items}
          blocked={b.blocked}
          people={people}
        />
      )}
    </div>
  );
}

function DesignJourney({ d, role }: { d: WorkspaceData; role: FlowRole }) {
  const flow = d.flow.design;
  if (!flow) return null;
  const latest = (kind: string) =>
    flow.designs
      .filter((x) => x.kind === kind)
      .sort((a, b) => b.revision - a.revision)[0];
  const plan = latest(flow.floorPlanKind);
  const planApproved =
    plan?.status === 'approved' && Boolean(plan.clientApprovedAt);
  const kinds = [
    flow.floorPlanKind,
    ...(flow.floorPlanKind === 'architectural_plan'
      ? ['structural_design']
      : []),
    '3d_design',
  ];
  const team = (d.site?.team ?? []).filter((t) => t.active === true);
  const who = (role: string) =>
    team.some((t) => stringValue(t.role) === role)
      ? 'Assigned'
      : 'Not assigned';
  const stepState = (kind: string) => {
    const x = latest(kind);
    if (!x)
      return kind !== flow.floorPlanKind && !planApproved
        ? 'Waits for floor plan approval'
        : 'To prepare';
    if (x.status === 'submitted') return 'Technical review';
    if (x.status === 'changes_requested') return 'Changes requested';
    return x.clientApprovedAt ? 'Homeowner approved' : 'With homeowner';
  };
  return (
    <Section
      id="flow-design"
      icon="quotations"
      title="Design"
      tone="violet"
      hint={
        flow.advanceBeforeDesign && !flow.agreementAuthorized
          ? 'Design starts after Finance verifies the advance.'
          : 'Every revision and homeowner decision is kept.'
      }
    >
      <ol className="pf-steps">
        {kinds.map((kind) => {
          const x = latest(kind);
          const state = stepState(kind);
          const ok = state === 'Homeowner approved';
          return (
            <li
              key={kind}
              className={
                ok ? 'done' : state.startsWith('Waits') ? 'locked' : 'open'
              }
            >
              <span className="pf-step-dot" aria-hidden="true">
                {ok ? '✓' : ''}
              </span>
              <div>
                <b>
                  {kindName[kind] ?? pretty(kind)}
                  {x ? ' · Rev ' + x.revision : ''}
                </b>
                <small>
                  {state}
                  {kind === flow.floorPlanKind
                    ? ' · Architect ' + who('architect').toLowerCase()
                    : kind === 'structural_design'
                      ? ' · Structural designer ' +
                        who('structural_designer').toLowerCase()
                      : ''}
                </small>
                {x?.status === 'changes_requested' && x.reviewNote && (
                  <p className="pf-note">“{x.reviewNote}”</p>
                )}
                {role === 'owner' &&
                  x &&
                  x.status === 'approved' &&
                  !x.clientApprovedAt &&
                  flow.stage === 'design' && (
                    <DesignDecisionForm
                      projectId={d.project.id}
                      designId={x.id}
                    />
                  )}
              </div>
            </li>
          );
        })}
      </ol>
      {role === 'owner' && (
        <AdvancePolicyToggle
          projectId={d.project.id}
          beforeDesign={flow.advanceBeforeDesign}
        />
      )}
      <Link
        className="pf-link"
        href={'/dashboard/projects/' + d.project.id + '/designs'}
      >
        All drawings and revisions →
      </Link>
    </Section>
  );
}

function OwnerOverview({
  d,
  items,
  blocked,
  people,
}: {
  d: WorkspaceData;
  items: WorkItem[];
  blocked: FlowBuckets['blocked'];
  people: Map<string, string>;
}) {
  const groups = chronologicalGroups(items);
  const team = (d.site?.team ?? []).filter((t) => t.active === true);
  const assigned = (id: string) =>
    items.filter((i) => i.assigneeId === id && !isDone(i.status)).length;
  const certified = new Set(
    d.stageExecution
      .filter((e) => e.status === 'certified')
      .map((e) => e.stageId),
  );
  const requests = d.stageRequests ?? [];
  const events = d.flow.events.slice(0, 8);
  return (
    <>
      {blocked.length > 0 && (
        <Section
          id="flow-blocked"
          icon="settings"
          title="Blocked"
          tone="red"
          count={blocked.length}
          hint="Held by dependencies, structural hold points or QC corrections."
        >
          <ul className="pf-plain">
            {blocked.map((x) => (
              <li key={x.stage.id}>
                <span>
                  <b>{stageLabel(x.stage)}</b>
                  <small>{x.blockers.join(' · ')}</small>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <div className="pf-two">
        <Section id="flow-team" icon="team" title="Staff" tone="grey">
          {team.length ? (
            <ul className="pf-plain">
              {team.map((t) => (
                <li key={stringValue(t.id)}>
                  <span>
                    <b>{people.get(stringValue(t.user_id)) ?? 'Team member'}</b>
                    <small>{pretty(t.role)}</small>
                  </span>
                  <span className="pf-pill">
                    {assigned(stringValue(t.user_id))} open
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pf-empty">Assign staff in Team & Access.</p>
          )}
          <Link
            className="pf-link"
            href={'/dashboard/projects/' + d.project.id + '/team'}
          >
            Team & access →
          </Link>
        </Section>
        <Section
          id="flow-money"
          icon="billing"
          title="Payment milestones"
          tone="green"
          hint="Requests are not receipts. Finance records actual money."
        >
          <ul className="pf-plain">
            {d.advance && (
              <li>
                <span>
                  <b>Advance</b>
                  <small>{d.advance.invoiceNumber ?? 'Not requested'}</small>
                </span>
                <span
                  className={
                    'pf-pill pf-pill-' +
                    (d.advance.invoiceTotal > 0 &&
                    d.advance.received >= d.advance.invoiceTotal
                      ? 'completed'
                      : 'on_hold')
                  }
                >
                  {d.advance.invoiceId
                    ? d.advance.received >= d.advance.invoiceTotal &&
                      d.advance.invoiceTotal > 0
                      ? 'Received'
                      : formatMoney(d.advance.received) + ' received'
                    : 'Pending'}
                </span>
              </li>
            )}
            {d.quotePaymentTriggers
              .filter((p) => p.stageCodes.length)
              .map((p) => {
                const done = p.stageCodes.every((code) => {
                  const s = d.stages.find((x) => x.instance_code === code);
                  return s && certified.has(s.id);
                });
                // Inferred groups that no single stage completes are not
                // requested automatically; say so instead of implying it.
                const manual = p.autoRequest === false;
                return (
                  <li key={p.name}>
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {p.percent}% ·{' '}
                        {manual
                          ? 'covers parallel stages — link it to the stage that completes it in Milestones'
                          : done
                            ? 'stages certified'
                            : 'on certification of ' +
                              p.stageCodes.length +
                              ' stage(s)'}
                      </small>
                    </span>
                    <span
                      className={
                        'pf-pill pf-pill-' +
                        (manual ? 'missed' : done ? 'completed' : 'pending')
                      }
                    >
                      {manual
                        ? 'Needs manual link'
                        : done
                          ? 'Eligible'
                          : 'Not due'}
                    </span>
                  </li>
                );
              })}
            {requests.map((r) => (
              <li key={r.id}>
                <span>
                  <b>{r.number}</b>
                  <small>{shortDate(r.date)}</small>
                </span>
                <span className="pf-pill">
                  {formatMoney(r.amount)} · {pretty(r.status)}
                </span>
              </li>
            ))}
          </ul>
          {d.permissions.finance && (
            <Link
              className="pf-link"
              href={'/dashboard/projects/' + d.project.id + '/payments'}
            >
              Payments →
            </Link>
          )}
        </Section>
      </div>
      <Section
        id="flow-timeline"
        icon="calendar"
        title="Whole project timeline"
        tone="grey"
        hint="All work by date and floor. Parallel floors sit side by side; dates never unlock work."
      >
        <div className="pf-feed">
          {groups.map((g) => (
            <div key={g.date || 'unscheduled'} className="pf-feed-day">
              <h3>{g.date ? shortDate(g.date) : 'Not yet scheduled'}</h3>
              {g.floors.map((f) => (
                <div key={f.floor || 'site'} className="pf-feed-floor">
                  <h4>{f.floor ? floorName(f.floor) : 'Site'}</h4>
                  <ul>
                    {f.items.map((i) => (
                      <li
                        key={i.key}
                        className={'pf-feed-item pf-feed-' + i.status}
                      >
                        <a href={'#work-' + i.key.replace(':', '-')}>
                          {i.title}
                        </a>
                        <small>{i.stage.title}</small>
                        <span className={'pf-pill pf-pill-' + i.status}>
                          {pretty(i.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>
      {events.length > 0 && (
        <Section
          id="flow-activity"
          icon="reports"
          title="Recent decisions"
          tone="grey"
          hint="Append-only audit of starts, completions, assignments and skips."
        >
          <ul className="pf-plain">
            {events.map((e, i) => (
              <li key={i}>
                <span>
                  <b>
                    {pretty(e.action)} ·{' '}
                    {items.find(
                      (x) => x.stage.id === e.stageId && x.index === e.index,
                    )?.title ?? 'Work item'}
                  </b>
                  <small>
                    {people.get(e.actorId) ??
                      (e.actorId === d.flow.userId
                        ? 'You'
                        : 'Team member')}{' '}
                    · {shortDate(e.createdAt)}
                    {stringValue(e.detail.reason)
                      ? ' · ' + stringValue(e.detail.reason)
                      : ''}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
