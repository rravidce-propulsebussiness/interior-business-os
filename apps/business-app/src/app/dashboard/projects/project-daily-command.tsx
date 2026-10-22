import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { OwnerIcon } from '../owner-shell';
import { SiteMediaForm, SiteReportForm } from './project-v2-forms';
import { projectTimelineStages } from './project-visible-stages';
import { pretty, stringValue, type Stage, type WorkspaceData } from './project-v2-data';

/** Date labels are calculated on the server in the project's India time zone. */
const inIndia = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});
const displayDate = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
});
function indiaDay(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const parts = inIndia.formatToParts(date);
  const p = (type: string) => parts.find(x => x.type === type)?.value ?? '';
  return p('year') + '-' + p('month') + '-' + p('day');
}
function complete(status: string) {
  return status === 'completed' || status === 'passed' || status === 'certified';
}
function stageLabel(stage: Stage) {
  return stage.floor_code ? pretty(stage.floor_code) + ' · ' + stage.title : stage.title;
}
function Chip({ children, kind = 'neutral' }: { children: ReactNode; kind?: 'neutral' | 'orange' | 'green' | 'purple' | 'red' }) {
  return <span className={'daily-chip daily-chip-' + kind}>{children}</span>;
}
function StageDayCard({ d, stage, expanded }: { d: WorkspaceData; stage: Stage; expanded: boolean }) {
  const work = d.stageProgress.work.filter(x => stringValue(x.stage_id) === stage.id);
  const finished = stage.activities.filter((_, i) => work.some(row =>
    Number(row.index) === i && complete(stringValue(row.status)))).length;
  // Never attach an unrelated project's photo to this floor: only use stage-linked media.
  const stageMediaIds = new Set(d.links.filter(link => link.stage_id === stage.id && link.kind === 'media')
    .map(link => link.record_id));
  const photos = (d.site?.media ?? []).filter(row =>
    stageMediaIds.has(row.id) && stringValue(row.mime).startsWith('image/'));
  const progress = stage.activities.length ? Math.round(100 * finished / stage.activities.length) : 0;
  const execution = d.stageExecution.find(item => item.stageId === stage.id);
  return <details className="daily-stage" open={expanded}>
    <summary className="daily-stage-title">
      <span className="daily-stage-icon"><OwnerIcon name="projects" size={18}/></span>
      <strong>{stageLabel(stage)}</strong>
      <small>{stage.activities.length ? finished + '/' + stage.activities.length + ' completed' : pretty(execution?.status ?? stage.status)}</small>
      <span className="daily-chevron" aria-hidden>⌄</span>
    </summary>
    <div className="daily-stage-body">
      {stage.activities.length ? <ul className="daily-task-list">
        {stage.activities.map((title, i) => {
          const row = work.find(x => Number(x.index) === i);
          const done = complete(stringValue(row?.status));
          return <li key={i}>
            <span aria-label={done ? 'Completed' : 'Pending'} className={'daily-task-tick ' + (done ? 'done' : '')}>{done ? '✓' : ''}</span>
            <span>{title}</span>
          </li>;
        })}
      </ul> : <p className="daily-help">Open all stages to review prerequisites and next actions.</p>}
      {photos.length > 0 && <div className="daily-thumbs" aria-label="Recent project photos">
        {photos.slice(0, 3).map(photo => <Link key={photo.id} href={'/dashboard/projects/' + d.project.id + '/site/media/' + photo.id} target="_blank" aria-label="View project photo">
          <Image unoptimized src={'/dashboard/projects/' + d.project.id + '/site/media/' + photo.id} width={74} height={66} alt={stringValue(photo.caption) || 'Project site photo'}/>
        </Link>)}
        {photos.length > 3 && <span>+{photos.length - 3}</span>}
      </div>}
      <div className="daily-stage-foot">
        <span>{execution?.status === 'ready_for_qc' ? 'Field work submitted · QC pending' : 'Stage tasks remain independently editable below'}</span>
        <span className="daily-progress-track"><span style={{ width: progress + '%' }}/></span>
      </div>
    </div>
  </details>;
}
export function ProjectDailyCommand({ d, stageDetails, financialDetails }: {
  d: WorkspaceData; stageDetails: ReactNode; financialDetails: ReactNode;
}) {
  const now = new Date();
  const today = indiaDay(now);
  const tomorrowDate = new Date(now.getTime() + 86400000);
  const tomorrow = indiaDay(tomorrowDate);
  const yesterday = indiaDay(new Date(now.getTime() - 86400000));
  const allStages = projectTimelineStages(d.stages);
  const byId = new Map(allStages.map(stage => [stage.id, stage]));
  const active = d.stageExecution
    .filter(row => ['in_progress', 'ready_for_qc', 'on_hold'].includes(row.status))
    .map(row => byId.get(row.stageId)).filter((stage): stage is Stage => Boolean(stage));
  const recentReport = [...(d.site?.reports ?? [])].sort((a, b) =>
    stringValue(b.report_date).localeCompare(stringValue(a.report_date)) ||
    stringValue(b.created_at).localeCompare(stringValue(a.created_at)));
  const todayReports = recentReport.filter(row => indiaDay(stringValue(row.report_date)) === today);
  const yesterdayReports = recentReport.filter(row => indiaDay(stringValue(row.report_date)) === yesterday);
  const todayPlan = yesterdayReports.find(row => stringValue(row.tomorrow_plan).trim());
  const tomorrowPlan = todayReports.find(row => stringValue(row.tomorrow_plan).trim());
  const doneCount = active.reduce((sum, stage) => sum + stage.activities.filter((_, i) =>
    d.stageProgress.work.some(row => stringValue(row.stage_id) === stage.id &&
      Number(row.index) === i && complete(stringValue(row.status)))).length, 0);
  const totalCount = active.reduce((sum, stage) => sum + stage.activities.length, 0);
  const percent = totalCount ? Math.round(doneCount * 100 / totalCount) : 0;
  const qcPending = d.stageExecution.filter(row => row.status === 'ready_for_qc')
    .map(row => byId.get(row.stageId)).filter((stage): stage is Stage => Boolean(stage));
  const materialPending = (d.site?.materials ?? []).filter(row =>
    ['requested', 'approved'].includes(stringValue(row.status)));
  const tomorrowDeliveries = (d.site?.materials ?? []).filter(row =>
    indiaDay(stringValue(row.expected_delivery_date)) === tomorrow &&
    stringValue(row.status) === 'ordered');
  const clientRequests = (d.requests ?? []).filter(row =>
    !['resolved', 'declined'].includes(row.status));
  const nextStage = allStages.find(stage =>
    !['completed', 'certified', 'done', 'skipped'].includes(stage.status));
  const nextReadyStage = d.site?.stage === 'execution' ? allStages.find(stage => {
    if (['QUOTED_SCOPE', 'PRECONSTRUCTION', 'DESIGN', 'DESIGN_APPROVAL', 'SITE_SURVEY'].includes(stage.template_code))
      return false;
    const execution = d.stageExecution.find(item => item.stageId === stage.id);
    return execution?.status === 'not_started' && execution.blockers.length === 0;
  }) : undefined;
  const canUpdate = d.site?.stage === 'execution' &&
    (d.site.canManage || ['manager', 'project_manager', 'site_engineer', 'supervisor'].includes(d.site.role));
  const canUpload = d.site?.stage === 'execution' &&
    (d.site.canManage || ['manager', 'project_manager', 'site_engineer', 'supervisor'].includes(d.site.role));
  const needsCount = qcPending.length + materialPending.length + clientRequests.length +
    (nextReadyStage ? 1 : 0) +
    (d.site?.stage !== 'execution' && !d.agreement?.authorized ? 1 : 0);
  const progressStyle: CSSProperties = { background: 'conic-gradient(#ff6519 ' + percent + '%, #f0e9e6 0)' };
  const mostRecentPhotos = (d.site?.media ?? []).filter(row =>
    stringValue(row.mime).startsWith('image/'));
  return <div className="daily-workspace">
    <details className="daily-card daily-today" open>
      <summary className="daily-section-title">
        <span className="daily-section-symbol daily-orange"><OwnerIcon name="calendar" size={22}/></span>
        <span className="daily-section-copy"><strong>Today's Work</strong><small>{displayDate.format(now)}</small></span>
        <span className="daily-ring" style={progressStyle}><b>{totalCount ? doneCount + '/' + totalCount : '—'}</b></span>
        <Chip kind="orange">{active.length ? 'In Progress' : 'No active work'}</Chip>
        <span className="daily-chevron" aria-hidden>⌄</span>
      </summary>
      <div className="daily-section-body">
        {active.length ? active.map((stage, i) =>
          <StageDayCard d={d} stage={stage} key={stage.id} expanded={i === 0}/>) :
          <div className="daily-empty">
            <strong>{d.site?.stage === 'execution' ? 'No stage started yet' : 'Physical work has not started'}</strong>
            <p>{nextStage ? 'Next step: ' + stageLabel(nextStage) + '. Open All Project Stages to review its requirements and activation.' :
              'The next construction stage will appear here after its agreement and execution checks are satisfied.'}</p>
          </div>}
        {!!todayReports.length && <div className="daily-report-note">
          <strong>Today's recorded progress</strong>
          {todayReports.slice(0, 2).map(row =>
            <p key={row.id}>{stringValue(row.completed_work)}</p>)}
        </div>}
        {!todayReports.length && !!todayPlan && <p className="daily-help">Planned for today: {stringValue(todayPlan.tomorrow_plan)}</p>}
        <div className="daily-actions">
          {canUpdate && <details className="daily-action-drawer daily-action-primary" id="daily-report-update">
            <summary><OwnerIcon name="projects" size={17}/> Update Today's Progress</summary>
            <div className="daily-action-form">
              <p className="daily-help">Record today's work and tomorrow's plan together in the existing site report.</p>
              <SiteReportForm id={d.project.id}/>
            </div>
          </details>}
          {canUpload && <details className="daily-action-drawer daily-action-photo">
            <summary><OwnerIcon name="projects" size={17}/> Upload Photos</summary>
            <div className="daily-action-form"><SiteMediaForm id={d.project.id}/></div>
          </details>}
          {!canUpdate && <span className="daily-help">Project updates are available to authorized site staff.</span>}
        </div>
      </div>
    </details>

    <details className="daily-card daily-tomorrow" open>
      <summary className="daily-section-title">
        <span className="daily-section-symbol daily-purple"><OwnerIcon name="calendar" size={22}/></span>
        <span className="daily-section-copy"><strong>Tomorrow's Plan</strong><small>{displayDate.format(tomorrowDate)}</small></span>
        <Chip kind="purple">{tomorrowPlan ? 'Planned' : 'Not planned'}</Chip>
        <span className="daily-chevron" aria-hidden>⌄</span>
      </summary>
      <div className="daily-section-body">
        {tomorrowPlan ? <div className="daily-tomorrow-detail">
          <strong>Site work planned</strong>
          <p className="daily-multiline">{stringValue(tomorrowPlan.tomorrow_plan)}</p>
          <div className="daily-tomorrow-facts">
            {stringValue(tomorrowPlan.tomorrow_workers) &&
              <span><OwnerIcon name="team" size={16}/> {stringValue(tomorrowPlan.tomorrow_workers)} workers planned</span>}
            {tomorrowDeliveries.map(row =>
              <span key={row.id}><OwnerIcon name="purchases" size={16}/> {stringValue(row.item)} delivery expected</span>)}
            {stringValue(tomorrowPlan.checks_required) &&
              <span><OwnerIcon name="check" size={16}/> Checks: {stringValue(tomorrowPlan.checks_required)}</span>}
          </div>
        </div> : <div className="daily-empty">
          <strong>No plan recorded for tomorrow</strong>
          <p>Use Today's Progress above to record the next day's activities, workers and required checks. Work is not automatically marked complete.</p>
        </div>}
        {tomorrowPlan && <p className="daily-help">Plan comes from today's daily work report. Update it through the same report workflow to avoid duplicate plans.</p>}
      </div>
    </details>

    <details className="daily-card daily-attention" open>
      <summary className="daily-section-title">
        <span className="daily-section-symbol daily-alert"><OwnerIcon name="check" size={22}/></span>
        <span className="daily-section-copy"><strong>Needs Attention</strong><small>Items requiring an action or approval</small></span>
        <Chip kind={needsCount ? 'red' : 'green'}>{needsCount ? needsCount + ' pending' : 'All clear'}</Chip>
        <span className="daily-chevron" aria-hidden>⌄</span>
      </summary>
      <div className="daily-section-body daily-alert-list">
        {qcPending.map(stage => {
          const passed = stage.inspectionTopics.filter(topic =>
            d.stageProgress.checks.some(check => stringValue(check.stage_id) === stage.id &&
              stringValue(check.title).toLowerCase() === topic.toLowerCase() &&
              stringValue(check.status) === 'passed')).length;
          return <div className="daily-alert-row" key={stage.id}>
            <span className="daily-alert-icon"><OwnerIcon name="check" size={17}/></span>
            <span><strong>Site checks passed · Independent QC sign-off pending</strong>
              <small>{stageLabel(stage)} · {passed}/{stage.inspectionTopics.length} required site checks recorded</small>
              <small>Formal sign-off is a separate authorized review; no need to redo passed checks.</small>
            </span>
          </div>;
        })}
        {nextReadyStage && <Link className="daily-alert-row daily-next-ready"
          href={'/dashboard/projects/' + d.project.id + '/timeline#project-timeline'}>
          <span className="daily-alert-icon"><OwnerIcon name="projects" size={17}/></span>
          <span><strong>{stageLabel(nextReadyStage)} is ready to start</strong>
            <small>Its start prerequisites are clear. QC certification of other stages remains separate.</small>
          </span>
          <b>Open stage →</b>
        </Link>}
        {materialPending.map(row => <Link className="daily-alert-row" key={row.id}
          href={'/dashboard/projects/' + d.project.id + '/procurement'}>
          <span className="daily-alert-icon"><OwnerIcon name="purchases" size={17}/></span>
          <span><strong>{stringValue(row.item)} · {pretty(row.status)}</strong><small>Material request / sourcing</small></span>
          <b>Review →</b>
        </Link>)}
        {clientRequests.map(row => <div className="daily-alert-row" key={row.id}>
          <span className="daily-alert-icon"><OwnerIcon name="team" size={17}/></span>
          <span><strong>Client request awaiting response</strong><small>{stringValue(row.details) || pretty(row.kind)}</small></span>
          <span>Pending</span>
        </div>)}
        {d.site?.stage !== 'execution' && !d.agreement?.authorized &&
          <div className="daily-alert-row">
            <span className="daily-alert-icon"><OwnerIcon name="calendar" size={17}/></span>
            <span><strong>Preconstruction clearance required</strong><small>Complete agreement, design and payment prerequisites before execution.</small></span>
          </div>}
        {!needsCount && <p className="daily-help">No urgent QC, material or client follow-ups are currently recorded.</p>}
      </div>
    </details>

    <details className="daily-card daily-archive" id="daily-all-stages">
      <summary className="daily-section-title">
        <span className="daily-section-symbol daily-grey"><OwnerIcon name="projects" size={22}/></span>
        <span className="daily-section-copy"><strong>All Project Stages</strong>
          <small>Agreement, designs, foundation, slabs, finishes and handover</small></span>
        <span className="daily-archive-progress"><b>{allStages.filter(s =>
          ['completed', 'certified', 'skipped'].includes(s.status)).length}/{allStages.length}</b>
          <span><i style={{ width: allStages.length ?
            Math.round(100 * allStages.filter(s => ['completed','certified','skipped'].includes(s.status)).length / allStages.length) + '%' : '0%' }}/></span>
        </span>
        <span className="daily-chevron" aria-hidden>⌄</span>
      </summary>
      <div className="daily-archive-inner">{stageDetails}</div>
    </details>
    <details className="daily-finance-accordion">
      <summary><OwnerIcon name="billing" size={18}/> Project financial summary <span className="daily-chevron" aria-hidden>⌄</span></summary>
      <div>{financialDetails}</div>
    </details>
    {!!mostRecentPhotos.length && <p className="daily-help daily-photo-caption">{mostRecentPhotos.length} site photo{mostRecentPhotos.length === 1 ? '' : 's'} available through your project's existing media register.</p>}
  </div>;
}
