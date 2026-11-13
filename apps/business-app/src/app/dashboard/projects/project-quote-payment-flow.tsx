import Link from 'next/link';
import {
  pretty,
  shortDate,
  stringValue,
  type WorkspaceData,
} from './project-v2-data';
import type { QuotedTimelineStep } from './project-quote-milestone-projection';

/** One existing quotation payment = one group on the project timeline.
 * Work, checks and QC status are read from current project evidence.
 * No extra milestone or payable event is created by rendering this view. */
function stepEvidence(d: WorkspaceData, step: QuotedTimelineStep) {
  const stage = d.stages.find((s) => s.instance_code === step.code);
  if (!stage) return { label: 'Planned in quote', stageId: '', date: '' };
  const plan = d.itemPlans.find(
    (item) =>
      item.stageId === stage.id &&
      item.kind === step.kind &&
      item.index === step.index,
  );
  const date = plan?.plannedStart
    ? shortDate(plan.plannedStart) +
      (plan.plannedFinish && plan.plannedFinish !== plan.plannedStart
        ? ' – ' + shortDate(plan.plannedFinish)
        : '')
    : '';
  if (step.kind === 'material') {
    return { label: 'Required material', stageId: stage.id, date };
  }
  if (step.kind === 'qc') {
    const decision = d.stageQc.records.find(
      (row) => row.stage_id === stage.id && row.index === step.index,
    )?.decision;
    return {
      label: decision ? 'QC: ' + pretty(decision) : 'QC not recorded',
      stageId: stage.id,
      date,
    };
  }
  const records =
    step.kind === 'work' ? d.stageProgress.work : d.stageProgress.checks;
  const record = records.find(
    (row) =>
      stringValue(row.stage_id) === stage.id &&
      Number(row.index) === step.index,
  );
  return {
    label: record?.status ? pretty(stringValue(record.status)) : 'Not started',
    stageId: stage.id,
    date,
  };
}

const kindLabel: Record<QuotedTimelineStep['kind'], string> = {
  work: 'Work',
  material: 'Material',
  check: 'Site check',
  test: 'Test',
  qc: 'Independent QC',
};

export function ProjectQuotePaymentFlow({ d }: { d: WorkspaceData }) {
  const payments = d.quoteMilestoneTimeline ?? [];
  if (!payments.length) return null;
  const stageByCode = new Map(
    d.stages.map((stage) => [stage.instance_code, stage]),
  );
  const quotedStageByCode = new Map(
    (d.quotePlan?.stages ?? []).map((stage) => [stage.code, stage]),
  );
  const certified = new Set(
    d.stageExecution
      .filter((stage) => stage.status === 'certified')
      .map((stage) => stage.stageId),
  );
  const canSeePercent = d.permissions.finance || d.permissions.quotation;
  return (
    <section
      className="pf-section pq-payment-flow"
      id="flow-quotation-work"
      aria-labelledby="pq-flow-title"
    >
      <header className="pf-section-head">
        <div>
          <h2 id="pq-flow-title">
            Quotation-linked work timeline
            <span className="pf-count">
              {payments.length} agreed payment stages
            </span>
          </h2>
          <p>
            Each existing quotation payment remains one stage. Its saved work
            and checks appear in the same order; recorded site progress updates
            their status. No payment schedule or quotation is changed here.
          </p>
        </div>
      </header>
      <ol className="pq-payment-list">
        {payments.map((payment, index) => {
          const allStages = payment.stageCodes.map((code) =>
            stageByCode.get(code),
          );
          const allCertified =
            allStages.length > 0 &&
            allStages.every((stage) => stage && certified.has(stage.id));
          const inProgress = allStages.some(
            (stage) =>
              stage &&
              d.stageExecution.some(
                (row) =>
                  row.stageId === stage.id &&
                  ['in_progress', 'field_completed', 'awaiting_qc'].includes(
                    row.status,
                  ),
              ),
          );
          const state = allCertified
            ? 'Associated work certified'
            : inProgress
              ? 'Site work in progress'
              : 'Planned';
          return (
            <li className="pq-payment-group" key={index}>
              <details open={index === 0}>
                <summary>
                  <span className="pq-payment-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="pq-payment-title">
                    <strong>{payment.name}</strong>
                    <small>
                      {state}
                      {payment.durationHint ? ' · Reference: ' + payment.durationHint : ''}
                      {' · '}
                      {payment.steps.length
                        ? payment.steps.length + ' saved work/check steps'
                        : payment.stageCodes.length
                          ? payment.stageCodes.length + ' linked work stages'
                          : 'No work-stage link saved'}
                    </small>
                  </span>
                  {canSeePercent && (
                    <span className="pq-payment-share">{payment.percent}%</span>
                  )}
                </summary>
                <div className="pq-payment-content">
                  {payment.steps.length > 0 ? (
                    <ol className="pq-steps">
                      {payment.steps.map((step, position) => {
                        const evidence = stepEvidence(d, step);
                        return (
                          <li
                            key={
                              step.code +
                              '-' +
                              step.kind +
                              '-' +
                              step.index +
                              '-' +
                              position
                            }
                          >
                            <span className="pq-step-number">
                              {position + 1}
                            </span>
                            <div>
                              <small>{kindLabel[step.kind]}</small>
                              <strong>{step.title}</strong>
                              <p>
                                {evidence.label}
                                {evidence.date ? ' · ' + evidence.date : ''}
                              </p>
                            </div>
                            {evidence.stageId && (
                              <Link
                                href={
                                  '/dashboard/projects/' +
                                  d.project.id +
                                  '/milestones#project-stage-' +
                                  evidence.stageId
                                }
                              >
                                Open
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  ) : payment.stageCodes.length > 0 ? (
                    <ul className="pq-stage-links">
                      {payment.stageCodes.map((code) => {
                        const stage = stageByCode.get(code);
                        return (
                          <li key={code}>
                            {stage ? (
                              <Link
                                href={
                                  '/dashboard/projects/' +
                                  d.project.id +
                                  '/milestones#project-stage-' +
                                  stage.id
                                }
                              >
                                {stage.title}
                              </Link>
                            ) : (
                              <span>
                                {quotedStageByCode.get(code)?.title ??
                                  pretty(code.replaceAll('/', ' · '))}
                              </span>
                            )}
                            <small>
                              {stage
                                ? pretty(stage.status || 'not_started')
                                : 'Planned from quote'}
                            </small>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="pq-note">
                      This existing payment has no linked site work. Keep the
                      quotation terms unchanged; use the agreed Finance
                      schedule.
                    </p>
                  )}
                  <p className="pq-note">
                    Reference durations are planning guides based on the uploaded agreement schedule. Actual dates and progress come from site updates; the quoted payment group is unchanged.
                  </p>
                  <div className="pq-payment-footer">
                    <small>
                      Work certification is separate from an invoice, payment
                      request or receipt.
                    </small>
                    {d.permissions.finance && (
                      <Link
                        href={
                          '/dashboard/projects/' + d.project.id + '/payments'
                        }
                      >
                        Check payment in Finance
                      </Link>
                    )}
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
