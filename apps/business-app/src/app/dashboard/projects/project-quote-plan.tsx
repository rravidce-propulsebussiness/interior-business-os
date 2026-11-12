import Link from 'next/link';
import { OwnerIcon } from '../owner-shell';
import { floorName } from './project-flow';
import type { QuotePlan } from './project-v2-data';

/** The construction plan generated automatically from the project's quotation.
 * It is a read-only preview until the agreement freezes it into live stages;
 * no stage, payment or progress record is created by viewing it. */
export function QuotePlanView({
  plan,
  projectId,
  canPrepare,
}: {
  plan: QuotePlan;
  projectId: string;
  canPrepare: boolean;
}) {
  const groups = new Map<string, QuotePlan['stages']>();
  // Building-wide stages before the first floor are site & foundation work;
  // those after the floors (external finishes, handover) close the project.
  let seenFloor = false;
  for (const stage of plan.stages) {
    if (stage.floor) seenFloor = true;
    const key = stage.floor ?? (seenFloor ? '__after' : '');
    groups.set(key, [...(groups.get(key) ?? []), stage]);
  }
  const floorLabel = (code: string) =>
    code === '__after'
      ? 'Whole building & handover'
      : code
        ? (plan.floors.find((f) => f.code === code)?.name ?? floorName(code))
        : 'Site & foundation';
  let n = 0;
  return (
    <section
      className="pf-section pf-quote-plan"
      id="flow-quote-plan"
      aria-labelledby="pf-quote-plan-title"
    >
      <header className="pf-section-head">
        <span className="pf-icon pf-icon-orange">
          <OwnerIcon name="quotations" size={18} />
        </span>
        <div>
          <h2 id="pf-quote-plan-title">
            Project plan from {plan.quoteNumber}
            <span className="pf-count">{plan.stages.length} stages</span>
          </h2>
          <p>
            {plan.frozen
              ? 'Generated from the signed quotation. Live stages are being prepared from it.'
              : 'Generated automatically from the quotation and its payment stages. It becomes the live timeline as soon as the agreement is prepared — nothing to enter by hand.'}
          </p>
        </div>
      </header>
      {plan.otherPayments.length > 0 && (
        <ul
          className="pf-quote-pay-strip"
          aria-label="Payments not tied to a construction stage"
        >
          {plan.otherPayments.map((p) => (
            <li key={p.name}>
              {p.name} · <b>{p.percent}%</b>
            </li>
          ))}
        </ul>
      )}
      <div className="pf-quote-floors">
        {[...groups].map(([floor, stages]) => (
          <div key={floor || 'site'} className="pf-quote-floor">
            <h3>{floorLabel(floor)}</h3>
            <ol>
              {stages.map((stage) => {
                n += 1;
                return (
                  <li key={stage.code}>
                    <details>
                      <summary>
                        <span className="pf-quote-num">{n}</span>
                        <span className="pf-quote-title">
                          <b>{stage.title}</b>
                          <small>
                            {stage.activities.length} work items
                            {stage.checks.length
                              ? ' · ' + stage.checks.length + ' checks'
                              : ''}
                          </small>
                        </span>
                        {stage.payments.map((p) => (
                          <span key={p.name} className="pf-quote-pay">
                            ₹ {p.name} · {p.percent}%
                          </span>
                        ))}
                      </summary>
                      <div className="pf-quote-detail">
                        <ul>
                          {stage.activities.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                        {stage.checks.length > 0 && (
                          <p className="pf-help">
                            Checks: {stage.checks.join(' · ')}
                          </p>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      {!plan.frozen && canPrepare && (
        <Link
          className="pf-btn pf-btn-primary pf-quote-cta"
          href={'/dashboard/projects/' + projectId + '/milestones'}
        >
          Prepare agreement to start this timeline
        </Link>
      )}
    </section>
  );
}
