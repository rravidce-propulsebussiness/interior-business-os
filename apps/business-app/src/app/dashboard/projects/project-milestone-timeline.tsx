import type { WorkspaceData, Stage } from './project-v2-data';
import { stringValue, pretty, shortDate } from './project-v2-data';
import { projectTimelineStages, } from './project-visible-stages';
import { projectWorkItems, flowRole, measurementPrompts, stageLabel, type WorkItem } from './project-flow';
import { WorkItemCard, type WorkItemView } from './project-work-item-card';
import { StageChecklistItem } from './project-stage-checklist-item';
import { StageOnsiteQcReview } from './project-onsite-qc-review';
import { ProjectItemSchedule } from './project-item-schedule';
import { StageButton } from './project-flow-controls';
import { PrepareAgreement } from './project-v2-forms';
import { CuringRounds, CuringPlanForm, type CuringRoundView } from './project-curing-card';
import './project-milestone-timeline.css';

const zone = 'Asia/Kolkata';
const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const displayDay = (value: string) => value ? new Date(value + 'T12:00:00Z').toLocaleDateString('en-IN', {
  timeZone: zone, day: 'numeric', month: 'short', year: 'numeric',
}) : 'Not scheduled';
const addDays = (value: string, days: number) => {
  const d = new Date(value + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dayDistance = (later: string, earlier: string) =>
  Math.round((Date.parse(later + 'T00:00:00Z') - Date.parse(earlier + 'T00:00:00Z')) / 86400000);
const durationByCode: Record<string, number> = {
  PRECONSTRUCTION: 10, DESIGN: 8, SITE_PREP: 18, FOUNDATION: 10, PLINTH: 10,
  RCC: 18, MASONRY: 55, INTERNAL_PLASTER: 25, EXTERNAL_PLASTER: 25,
  TILES: 18, DOORS: 18, PLUMBING_PAINT: 18, HANDOVER: 7,
};
const isComplete = (status: string) => ['completed', 'passed', 'certified', 'skipped'].includes(status);
const itemPlanKey = (stageId: string, kind: string, index: number) => stageId + ':' + kind + ':' + index;
function milestoneNumber(stage: Stage, floorCodes: string[]) {
  const code = stage.template_code.split('/')[0] ?? '';
  if (['QUOTED_SCOPE','PRECONSTRUCTION','DESIGN','SITE_PREP','SITE_SURVEY','DESIGN_APPROVAL'].includes(code)) return 1;
  if (['FOUNDATION','PLINTH'].includes(code)) return 2;
  const floorIndex = Math.max(0, floorCodes.indexOf(stage.floor_code ?? ''));
  const count = Math.max(floorCodes.length, 1);
  const groupIndex: Record<string, number> = {
    RCC: 0, MASONRY: 1, INTERNAL_PLASTER: 2, EXTERNAL_PLASTER: 3,
    TILES: 4, DOORS: 5, PLUMBING_PAINT: 6, HANDOVER: 7,
  };
  return 3 + (groupIndex[code] ?? 0) * count + floorIndex;
}
function milestoneFamily(stage: Stage) {
  const code = stage.template_code.split('/')[0] ?? '';
  const names: Record<string, string> = {
    PRECONSTRUCTION: 'Advance & project confirmation',
    DESIGN: 'Advance & project confirmation',
    SITE_PREP: 'Advance & project confirmation',
    FOUNDATION: 'Foundation & plinth',
    PLINTH: 'Foundation & plinth',
    RCC: 'Floor slab structure',
    MASONRY: 'Room marking & brickwork',
    INTERNAL_PLASTER: 'Plastering & concealed services',
    EXTERNAL_PLASTER: 'Outer plaster & elevation',
    TILES: 'Tiles selection & installation',
    DOORS: 'Doors, painting & electrical wiring',
    PLUMBING_PAINT: 'Plumbing, final wiring & finishing',
    HANDOVER: 'Handover',
  };
  return names[code] ?? stage.title;
}

export function ProjectMilestoneTimeline({ d }: { d: WorkspaceData }) {
  const stages = projectTimelineStages(d.stages);
  const site = d.site;
  const role = flowRole({
    canManage: site?.canManage === true,
    siteRole: site?.role ?? '',
    qcReviewer: d.stageQc.canReview && !site?.canManage,
  });
  const executing = site?.stage === 'execution';
  const canWork = executing && (role === 'owner' || role === 'engineer');
  const canRequest = canWork || site?.role === 'procurement';
  const canPlan = d.permissions.manage || ['manager', 'project_manager', 'site_engineer', 'site_supervisor', 'supervisor'].includes(site?.role ?? '');
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86400000));
  const photos = (site?.media ?? [])
    .filter((row) => stringValue(row.mime).startsWith('image/'))
    .map((row) => ({ id: row.id, filename: stringValue(row.filename) }));
  const people = new Map((site?.memberOptions ?? []).map((person) => [person.id, person.label]));
  const engineers = (site?.team ?? []).filter((person) => person.active === true &&
    ['site_engineer', 'manager'].includes(stringValue(person.role))).map((person) => ({
      id: stringValue(person.user_id),
      label: people.get(stringValue(person.user_id)) ?? pretty(stringValue(person.role)),
    }));
  const materials = site?.materials ?? [];
  const materialStage = new Map(d.links.filter((link) => link.kind === 'material')
    .map((link) => [link.record_id, link.stage_id]));
  const items = projectWorkItems({
    stages, work: d.stageProgress.work, optional: d.flow.optional,
    plans: d.itemPlans, execution: d.stageExecution,
  });
  const startDate = dayKey(new Date(d.project.createdAt));
  const floorCodes = [...new Set(stages.map((stage) => stage.floor_code).filter((code): code is string => Boolean(code)))];
  const estimated = new Map<string, { start: string; finish: string }>();
  const floorIndex = (stage: Stage) => Math.max(0, floorCodes.indexOf(stage.floor_code ?? ''));
  const prior = (code: string, stage: Stage) => {
    const matches = stages.filter((row) => row.template_code.split('/')[0] === code);
    const match = stage.floor_code
      ? matches.find((row) => row.floor_code === stage.floor_code) ?? matches.find((row) => !row.floor_code)
      : matches.find((row) => !row.floor_code) ?? matches[0];
    return match ? estimated.get(match.id) : undefined;
  };
  const estimateRank: Record<string, number> = {
    PRECONSTRUCTION: 0, DESIGN: 1, SITE_PREP: 2, FOUNDATION: 3, PLINTH: 4,
    RCC: 5, MASONRY: 6, INTERNAL_PLASTER: 7, EXTERNAL_PLASTER: 8,
    TILES: 9, DOORS: 10, PLUMBING_PAINT: 11, HANDOVER: 12,
  };
  const estimateStages = [...stages].sort((a, b) =>
    (estimateRank[a.template_code.split('/')[0] ?? ''] ?? 20) -
    (estimateRank[b.template_code.split('/')[0] ?? ''] ?? 20) ||
    floorIndex(a) - floorIndex(b) || a.sequence - b.sequence);
  for (const stage of estimateStages) {
    const code = stage.template_code.split('/')[0] ?? '';
    const days = durationByCode[code] ?? 10;
    let start = startDate;
    if (code === 'DESIGN') start = addDays(prior('PRECONSTRUCTION', stage)?.finish ?? startDate, 1);
    else if (code === 'SITE_PREP') start = addDays(prior('DESIGN', stage)?.finish ?? startDate, 1);
    else if (code === 'FOUNDATION') start = addDays(prior('SITE_PREP', stage)?.finish ?? startDate, 1);
    else if (code === 'PLINTH') start = addDays(prior('FOUNDATION', stage)?.finish ?? startDate, 1);
    else if (code === 'RCC') start = addDays(prior('PLINTH', stage)?.finish ?? startDate, 1 + floorIndex(stage) * 12);
    else if (code === 'MASONRY') start = addDays(prior('RCC', stage)?.finish ?? startDate, 1);
    else if (code === 'INTERNAL_PLASTER') start = addDays(prior('MASONRY', stage)?.start ?? startDate, 30);
    else if (code === 'EXTERNAL_PLASTER') start = addDays(prior('INTERNAL_PLASTER', stage)?.start ?? startDate, 10);
    else if (code === 'TILES') start = addDays(prior('INTERNAL_PLASTER', stage)?.finish ?? startDate, 1);
    else if (code === 'DOORS') start = addDays(prior('TILES', stage)?.finish ?? startDate, 1);
    else if (code === 'PLUMBING_PAINT') start = addDays(prior('DOORS', stage)?.finish ?? startDate, 1);
    else if (code === 'HANDOVER') {
      const finish = [...estimated.values()].map((row) => row.finish).sort().at(-1) ?? startDate;
      start = addDays(finish, 1);
    } else if (code !== 'PRECONSTRUCTION') start = addDays(startDate, Math.max(stage.sequence, 0) * 5);
    const finish = addDays(start, Math.max(days - 1, 0));
    estimated.set(stage.id, { start, finish });
  }
  const plansByKey = new Map(d.itemPlans.map((plan) =>
    [itemPlanKey(plan.stageId, plan.kind, plan.index), plan]));
  const estimatedItemDate = (item: WorkItem) => {
    const window = estimated.get(item.stage.id);
    if (!window) return startDate;
    const rows = grouped.get(item.stage.id) ?? [];
    const days = durationByCode[item.stage.template_code.split('/')[0] ?? ''] ?? 10;
    const slot = rows.length ? Math.floor(item.index * days / rows.length) : 0;
    return addDays(window.start, Math.min(slot, Math.max(days - 1, 0)));
  };
  const windowFor = (stage: Stage) => {
    const planned = d.itemPlans.filter((plan) => plan.stageId === stage.id &&
      plan.plannedStart && plan.plannedFinish);
    if (!planned.length) return estimated.get(stage.id)!;
    return {
      start: planned.map((plan) => plan.plannedStart).sort()[0]!,
      finish: planned.map((plan) => plan.plannedFinish).sort().at(-1)!,
    };
  };
  const checkBaselineDate = (stage: Stage, index: number, count: number) => {
    const range = estimated.get(stage.id) ?? { start: startDate, finish: startDate };
    const span = Math.max(0, dayDistance(range.finish, range.start));
    return addDays(range.start, count > 1 ? Math.floor(index * span / (count - 1)) : span);
  };
  const workVariance = (item: WorkItem, baseline: string) => {
    if (item.status === 'skipped') return { label: 'Not applicable', tone: 'neutral' };
    const completion = d.flow.events
      .filter((event) => event.stageId === item.stage.id && event.index === item.index && event.action === 'complete')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (item.status === 'completed') {
      if (!completion?.createdAt) return { label: 'Completed', tone: 'done' };
      const delta = dayDistance(dayKey(new Date(completion.createdAt)), baseline);
      return delta < 0
        ? { label: Math.abs(delta) + 'd early', tone: 'early' }
        : delta > 0
          ? { label: delta + 'd late', tone: 'late' }
          : { label: 'On baseline', tone: 'done' };
    }
    const delta = dayDistance(today, baseline);
    return delta > 0
      ? { label: 'Delayed ' + delta + 'd', tone: 'late' }
      : delta === 0
        ? { label: 'Due today', tone: 'due' }
        : { label: 'On track', tone: 'neutral' };
  };
  const grouped = new Map<string, WorkItem[]>();
  for (const item of items) grouped.set(item.stage.id, [...(grouped.get(item.stage.id) ?? []), item]);
  const view = (item: WorkItem): WorkItemView => {
    const p = plansByKey.get(itemPlanKey(item.stage.id, 'work', item.index));
    return {
      key: item.key, stageId: item.stage.id, index: item.index, title: item.title,
      stageLabel: stageLabel(item.stage), status: item.status, stageStatus: item.stageStatus,
      blockers: item.blockers, optional: item.optional, assigneeId: item.assigneeId,
      assigneeLabel: item.assigneeId ? (item.assigneeId === d.flow.userId ? 'You' : people.get(item.assigneeId) ?? 'Assigned') : '',
      crew: item.crew, skipReason: item.skipReason, measurements: item.measurements,
      prompts: measurementPrompts(item.title), planned: p?.plannedStart ? shortDate(p.plannedStart) : displayDay(estimatedItemDate(item)),
      hasPhoto: Boolean(item.photoId),
      openMaterials: materials.filter((material) => materialStage.get(material.id) === item.stage.id &&
        Number(material.activity_index) === item.index &&
        ['requested', 'approved', 'ordered'].includes(stringValue(material.status))).length,
    };
  };
  const card = (item: WorkItem) => {
    const p = plansByKey.get(itemPlanKey(item.stage.id, 'work', item.index));
    const baseline = estimatedItemDate(item);
    const variance = workVariance(item, baseline);
    return <div className="pmt-work" key={item.key}>
      <WorkItemCard projectId={d.project.id} item={view(item)} canWork={canWork}
        canOwn={role === 'owner'} canRequest={canRequest} engineers={engineers}
        boq={d.flow.boq} tomorrow={tomorrow}/>
      <div className="pmt-work-timing"><span>Baseline · {displayDay(baseline)}</span>
        <span className={'pmt-variance ' + variance.tone}>{variance.label}</span></div>
      <ProjectItemSchedule projectId={d.project.id} stageId={item.stage.id} kind="work"
        index={item.index} title={item.title} item={p} canPlan={canPlan}
        baselineStart={baseline} baselineFinish={baseline}
        planningMode={role === 'engineer' ? 'site' : 'full'} today={today}/>
    </div>;
  };
  const todayItems = items.filter((item) => {
    const plan = plansByKey.get(itemPlanKey(item.stage.id, 'work', item.index));
    const when = plan?.plannedStart ?? estimatedItemDate(item);
    return when === today && !isComplete(item.status);
  });
  const tomorrowItems = items.filter((item) => {
    const plan = plansByKey.get(itemPlanKey(item.stage.id, 'work', item.index));
    const when = plan?.plannedStart ?? estimatedItemDate(item);
    return when === tomorrow && !isComplete(item.status);
  });
  const workDone = items.filter((item) => isComplete(item.status)).length;
  const progress = items.length ? Math.round(workDone * 100 / items.length) : 0;
  const current = stages.find((stage) => {
    const status = d.stageExecution.find((row) => row.stageId === stage.id)?.status ?? stage.status;
    return !isComplete(status);
  });
  if (!stages.length) {
    const quote = d.quotations[0];
    const canPrepare = Boolean(quote && d.permissions.manage && d.permissions.finance && !d.agreement);
    let quoteOffset = 0;
    const quoteStages = (d.quotePlan?.stages ?? []).map((stage) => {
      const code = stage.code.split('/')[0] ?? stage.code;
      const days = durationByCode[code] ?? 10;
      const start = addDays(startDate, quoteOffset);
      const finish = addDays(start, Math.max(days - 1, 0));
      quoteOffset += days;
      return { ...stage, start, finish };
    });
    return <div className="pmt">
      <header className="pmt-hero"><div><span className="pmt-kicker">Construction project · quotation plan</span>
        <h1>Project milestones</h1>
        <p>Estimated dates are calculated from project creation. Execution begins after the project agreement is confirmed.</p></div>
        <div className="pmt-progress"><strong>{d.quotePlan?.floors.length ?? 0} floors</strong><span>{d.quotePlan?.quoteNumber ?? 'Accepted quotation'}</span></div>
      </header>
      {!d.agreement && <section className="pmt-curing">
        <div className="pmt-section-title"><div><h2>Confirm the project to activate milestones</h2>
          <p>The owner can upload the offline agreement or record the homeowner’s agreement to the final quotation.</p></div></div>
        {canPrepare && quote ? <PrepareAgreement projectId={d.project.id} revisionId={quote.revisionId}/> :
          <p className="pmt-empty">Project manager and Finance permissions are required to prepare the project agreement.</p>}
      </section>}
      <section className="pmt-timeline"><div className="pmt-timeline-head"><div><h2>Quotation-based timeline</h2>
        <p>Scope and floors come from the accepted quotation. Dates are estimates until the project schedule is confirmed.</p></div>
        <span>{quoteStages.length} milestones</span></div>
        {quoteStages.map((stage,index) => <details className="pmt-stage" key={stage.code + ':' + index} open={index===0}>
          <summary><span className="pmt-number">{String(milestoneNumber({template_code:stage.code,floor_code:stage.floor} as Stage, d.quotePlan?.floors.map((floor)=>floor.code) ?? [])).padStart(2,'0')}</span>
            <span className="pmt-stage-name"><strong>{stage.floor ? pretty(stage.floor) + ' · ' : ''}{stage.title}</strong>
              <small>{stage.activities.length} works · {stage.checks.length} checks · {stage.phase}</small></span>
            <span className="pmt-dates">{displayDay(stage.start)} – {displayDay(stage.finish)}<small>Estimated dates</small></span>
            <span className="pmt-status">Not started</span><span className="pmt-chevron">⌄</span></summary>
          <div className="pmt-stage-body"><ul className="pmt-quote-items">{stage.activities.map((item,i)=><li key={i}>{item}</li>)}</ul>
            {!!stage.checks.length && <p className="pmt-explanation">Checks: {stage.checks.join(' · ')}</p>}
          </div>
        </details>)}
      </section>
    </div>;
  }
  const rounds: CuringRoundView[] = (d.flow.curing?.rounds ?? []).map((round) => {
    const age = Date.now() - new Date(round.roundAt).getTime();
    return {
      key: round.planId + round.roundAt, planId: round.planId, title: round.title,
      roundAt: round.roundAt,
      time: new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(new Date(round.roundAt)),
      day: dayKey(new Date(round.roundAt)) === today ? 'Today' :
        dayKey(new Date(round.roundAt)) === tomorrow ? 'Tomorrow' : shortDate(round.roundAt),
      status: round.status, late: round.late, remarks: round.remarks,
      hasPhoto: round.hasPhoto,
      recordable: round.status !== 'recorded' && age <= 86400000 && age >= -30 * 60000,
    };
  });
  const roundSlots = ['Morning', 'Afternoon', 'Evening'];
  const checkStatus = (stageId: string, title: string) => d.stageProgress.checks.find((row) =>
    stringValue(row.stage_id) === stageId && stringValue(row.title).toLowerCase() === title.toLowerCase());
  return <div className="pmt">
    <header className="pmt-hero">
      <div><span className="pmt-kicker">One project · one live timeline</span>
        <h1>Project milestones</h1>
        <p>Work, site checks, QC, curing and dates in one project flow.</p></div>
      <div className="pmt-progress"><strong>{progress}%</strong><span>{workDone} of {items.length} work items complete</span><i><b style={{ width: progress + '%' }}/></i></div>
    </header>

    <section className="pmt-days">
      <article><h2>Today <time>{displayDay(today)}</time></h2>
        {todayItems.length ? todayItems.slice(0, 5).map((item) => <p key={item.key}>◦ {item.title}<small>{stageLabel(item.stage)}</small></p>) :
          <p className="pmt-empty">No work scheduled for today.</p>}
      </article>
      <article><h2>Tomorrow <time>{displayDay(tomorrow)}</time></h2>
        {tomorrowItems.length ? tomorrowItems.slice(0, 5).map((item) => <p key={item.key}>◦ {item.title}<small>{stageLabel(item.stage)}</small></p>) :
          <p className="pmt-empty">No work scheduled for tomorrow.</p>}
      </article>
    </section>

    <section className="pmt-curing">
      <div className="pmt-section-title"><div><h2>Daily curing</h2><p>Three regular rounds each day. Record the round and attach site evidence.</p></div><span>Morning · Afternoon · Evening</span></div>
      {rounds.length ? <CuringRounds projectId={d.project.id} rounds={rounds}
        canRecord={d.flow.curing?.canRecord ?? false}/> :
        <div className="pmt-curing-empty">
          <p>No daily curing rounds are active yet. Set up the routine once for a concrete stage.</p>
          {d.flow.curing?.canPlan && executing && <details><summary>Set up daily curing rounds</summary>
            <CuringPlanForm projectId={d.project.id} today={today}
              stages={stages.filter((stage) => !['PRECONSTRUCTION','DESIGN','SITE_SURVEY','DESIGN_APPROVAL','QUOTED_SCOPE'].includes(stage.template_code))
                .map((stage) => ({ id: stage.id, label: stageLabel(stage) }))}/>
          </details>}
          {!d.flow.curing?.canPlan && <div className="pmt-round-slots">{roundSlots.map((slot) =>
            <span key={slot}>{slot}<small>Awaiting routine setup</small></span>)}</div>}
        </div>}
    </section>

    <section className="pmt-timeline" id="project-timeline">
      <div className="pmt-timeline-head"><div><h2>All stages</h2><p>Default dates are estimates from project creation. Saved item dates take precedence and remain editable.</p></div>
        <span>{stages.length} stages</span></div>
      {stages.map((stage, index) => {
        const range = windowFor(stage);
        const stageItems = grouped.get(stage.id) ?? [];
        const completed = stageItems.filter((item) => isComplete(item.status)).length;
        const execution = d.stageExecution.find((row) => row.stageId === stage.id);
        const stageStatus = execution?.status ?? stage.status ?? 'not_started';
        const siteChecks = stage.inspectionTopics.map((title, i) => {
          const record = checkStatus(stage.id, title);
          return { title, index: i, status: stringValue(record?.status) || 'pending',
            notes: stringValue(record?.notes), photoId: stringValue(record?.photo_id) };
        });
        const stagePhotos = photos;
        const actualQc = d.stageQc.records.filter((record) => record.stage_id === stage.id);
        const baselineRange = estimated.get(stage.id) ?? range;
        const savedRange = d.itemPlans.some((plan) => plan.stageId === stage.id && plan.plannedStart && plan.plannedFinish);
        const stageVariance = isComplete(stageStatus) && execution?.fieldFinishedAt
          ? (() => { const delta = dayDistance(dayKey(new Date(execution.fieldFinishedAt)), baselineRange.finish);
              return delta < 0 ? Math.abs(delta) + 'd early' : delta > 0 ? delta + 'd late' : 'On baseline'; })()
          : dayDistance(today, baselineRange.finish) > 0 && !isComplete(stageStatus)
            ? 'Delayed ' + dayDistance(today, baselineRange.finish) + 'd'
            : 'On track';
        return <details className="pmt-stage" key={stage.id} open={index === 0 || stage.id === current?.id}>
          <summary><span className="pmt-number">{String(milestoneNumber(stage, floorCodes)).padStart(2,'0')}</span>
            <span className="pmt-stage-name"><strong>{stage.floor_code ? pretty(stage.floor_code) + ' · ' : ''}{stage.title}</strong>
              <small>{milestoneFamily(stage)} · {stage.activities.length} works · {siteChecks.length} checks · {completed}/{stageItems.length} complete</small></span>
            <span className="pmt-dates">{displayDay(baselineRange.start)} – {displayDay(baselineRange.finish)}<small>Auto baseline</small>
              {savedRange && <small className="pmt-current-date">Current plan: {displayDay(range.start)} – {displayDay(range.finish)}</small>}
              <small className="pmt-stage-variance">{stageVariance}</small></span>
            <span className={'pmt-status ' + (stageStatus === 'in_progress' ? 'active' : isComplete(stageStatus) ? 'done' : '')}>{pretty(stageStatus)}</span>
            <span className="pmt-chevron">⌄</span>
          </summary>
          <div className="pmt-stage-body">
            {stage.explanation && <p className="pmt-explanation">{stage.explanation}</p>}
            {stageItems.length ? <div className="pmt-work-list">{stageItems.map(card)}</div> :
              <p className="pmt-empty">No work items are available for this stage.</p>}
            {!!siteChecks.length && <section className="pmt-subsection">
              <h3>Site checks <small>Photo evidence required · notes optional</small></h3>
              {siteChecks.map((check) => {
                const plan = plansByKey.get(itemPlanKey(stage.id, 'check', check.index));
                return <div className="pmt-check" key={check.index}>
                  <StageChecklistItem projectId={d.project.id} stageId={stage.id} kind="check"
                    index={check.index} title={check.title} status={check.status}
                    notes={check.notes} photoId={check.photoId} photos={stagePhotos}
                    canEdit={canWork}/>
                  <ProjectItemSchedule projectId={d.project.id} stageId={stage.id} kind="check"
                    index={check.index} title={check.title} item={plan} canPlan={canPlan}
                    baselineStart={checkBaselineDate(stage, check.index, siteChecks.length)}
                    baselineFinish={checkBaselineDate(stage, check.index, siteChecks.length)}
                    planningMode={role === 'engineer' ? 'site' : 'full'} today={today}/>
                </div>;
              })}
            </section>}
            {!!stage.inspectionTopics.length && <section className="pmt-subsection">
              <StageOnsiteQcReview projectId={d.project.id} stageId={stage.id}
                stageName={stageLabel(stage)} topics={stage.inspectionTopics}
                topicIndices={stage.inspectionTopics.map((_, i) => i)}
                stageStatus={stageStatus} canReview={d.stageQc.canReview || d.stageQc.isOwner}
                canManage={site?.canManage === true} inspectorAssigned={d.stageQc.inspectorAssigned}
                isOwner={d.stageQc.isOwner} records={actualQc} photos={stagePhotos}
                existingChecks={siteChecks.map((check) => ({ title: check.title, photoId: check.photoId, status: check.status }))}/>
            </section>}
            {canWork && stageStatus === 'not_started' && (execution?.blockers.length ?? 0) === 0 &&
              !['QUOTED_SCOPE','PRECONSTRUCTION','DESIGN','DESIGN_APPROVAL','SITE_SURVEY'].includes(stage.template_code) &&
              <StageButton projectId={d.project.id} stageId={stage.id} action="start" label="Start this stage"/>}
            {canWork && ['in_progress','ready_for_qc'].includes(stageStatus) && stageStatus === 'in_progress' &&
              <StageButton projectId={d.project.id} stageId={stage.id} action="submit_for_qc" label="Submit stage for QC"/>}
          </div>
        </details>;
      })}
    </section>
  </div>;
}
