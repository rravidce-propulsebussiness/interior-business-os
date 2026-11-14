import { formatMoney, pretty, type WorkspaceData } from './project-v2-data';
import {
  PrepareAgreement,
  ProjectDrawingForm,
  ProjectForm,
  SkipAgreementUpload,
} from './project-v2-forms';
import { DesignDecisionForm } from './project-flow-controls';

const PLAN_TITLES: Record<string, string> = {
  architectural_plan: 'Architectural floor plan',
  interior_layout: 'Interior floor plan',
  structural_design: 'Structural drawings',
  electrical_plan: 'Electrical / MEP plan',
  plumbing_plan: 'Plumbing / MEP plan',
};

export function ProjectDesignPaymentAndAgreement({
  data,
}: {
  data: WorkspaceData;
}) {
  const agreement = data.agreement;
  const revisionId = agreement?.revisionId ?? data.quotations[0]?.revisionId;
  const hasOwnerAccess = data.site?.canManage === true;

  return (
    <section
      className="pmt-design-gate"
      aria-label="Design payment and agreement"
    >
      <header>
        <div>
          <strong>Payment & agreement</strong>
          <p>Use the accepted quotation and its existing payment schedule.</p>
        </div>
        <span className={agreement?.authorized ? 'is-ready' : ''}>
          {agreement?.authorized
            ? 'Authorized'
            : agreement
              ? pretty(agreement.status)
              : 'Not prepared'}
        </span>
      </header>

      {agreement?.authorized ? (
        <p className="pmt-design-note">
          The agreement is authorized. Drawing submissions follow the project’s
          existing advance policy.
        </p>
      ) : agreement?.canAuthorizeException && hasOwnerAccess ? (
        <SkipAgreementUpload
          projectId={data.project.id}
          contractId={agreement.contractId}
        />
      ) : revisionId && hasOwnerAccess ? (
        <PrepareAgreement projectId={data.project.id} revisionId={revisionId} />
      ) : (
        <p className="pmt-design-note">
          The project owner can prepare the agreement from the accepted
          quotation.
        </p>
      )}

      <div className="pmt-design-payment">
        <div>
          <small>Design payment stage</small>
          <strong>
            {data.advance?.invoiceNumber
              ? data.advance.invoiceNumber +
                ' · ' +
                pretty(data.advance.invoiceStatus)
              : data.advance?.scheduleActive
                ? 'Payment schedule active'
                : 'Awaiting payment schedule'}
          </strong>
        </div>
        {data.advance && (
          <div>
            <small>Received / requested</small>
            <strong>
              {formatMoney(data.advance.received)} /{' '}
              {formatMoney(data.advance.invoiceTotal)}
            </strong>
          </div>
        )}
        {data.permissions.finance && (
          <a href={'/dashboard/projects/' + data.project.id + '/payments'}>
            Open payment details
          </a>
        )}
      </div>
    </section>
  );
}

export function ProjectDesignPlansWorkflow({ data }: { data: WorkspaceData }) {
  const design = data.flow.design;
  const revisions = design?.designs ?? [];
  const floorPlanKind = design?.floorPlanKind || 'architectural_plan';
  const planKinds = [
    floorPlanKind,
    'structural_design',
    'electrical_plan',
    'plumbing_plan',
  ];
  const latest = (kind: string) =>
    revisions
      .filter((row) => row.kind === kind)
      .sort((a, b) => b.revision - a.revision)[0];
  const ready = (kind: string) => {
    const row = latest(kind);
    return row?.status === 'approved' && Boolean(row.clientApprovedAt);
  };
  const currentIndex = planKinds.findIndex((kind) => !ready(kind));
  const liveDesignPhase = data.site?.stage === 'design';
  const canManage = data.site?.canManage === true;
  const role = data.site?.role ?? '';
  const canTechnicalReview = canManage || role === 'manager';
  const allApproved = currentIndex < 0;

  return (
    <section
      className="pmt-design-plans"
      aria-label="Plans and owner approvals"
    >
      <div className="pmt-design-plans-intro">
        <div>
          <strong>Plans</strong>
          <p>
            Floor plan → structural drawings → electrical and plumbing / MEP
            plans. Each current revision needs technical review and an owner
            decision.
          </p>
        </div>
        <span>
          {allApproved
            ? 'All plans approved'
            : 'Step ' + (currentIndex + 1) + ' of ' + planKinds.length}
        </span>
      </div>

      {!revisions.length && !liveDesignPhase && (
        <p className="pmt-design-note">
          Design submissions become available after the project agreement and
          design phase are active.
        </p>
      )}

      <div className="pmt-design-plan-list">
        {planKinds.map((kind, index) => {
          const row = latest(kind);
          const previousReady =
            index === 0 || planKinds.slice(0, index).every(ready);
          const isCurrent = index === currentIndex;
          const canUpload =
            canManage ||
            role === 'manager' ||
            (kind === 'structural_design' && role === 'structural_designer') ||
            (kind !== 'structural_design' && role === 'architect');
          const canSubmit =
            liveDesignPhase &&
            canUpload &&
            previousReady &&
            isCurrent &&
            (!row || row.status === 'changes_requested');

          return (
            <article className="pmt-design-plan" key={kind}>
              <div className="pmt-design-plan-heading">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{PLAN_TITLES[kind] ?? pretty(kind)}</strong>
                  <small>
                    {row
                      ? 'Revision ' +
                        row.revision +
                        ' · ' +
                        (row.clientApprovedAt
                          ? 'Owner approved'
                          : row.status === 'approved'
                            ? 'Awaiting owner approval'
                            : pretty(row.status))
                      : 'Waiting for previous plan approval'}
                  </small>
                </div>
              </div>

              {row?.reference && (
                <p className="pmt-design-reference">
                  Drawing / offline share reference: {row.reference}
                </p>
              )}
              {row?.reviewNote && (
                <p className="pmt-design-note">Review note: {row.reviewNote}</p>
              )}

              {liveDesignPhase &&
                isCurrent &&
                row?.status === 'submitted' &&
                canTechnicalReview && (
                  <details className="pmt-design-review">
                    <summary>Technical review</summary>
                    <ProjectForm
                      projectId={data.project.id}
                      operation="design_decide"
                      label="Save technical review"
                    >
                      <input type="hidden" name="id" value={row.id} />
                      <label>
                        Review result
                        <select name="decision" defaultValue="approved">
                          <option value="approved">Technically approved</option>
                          <option value="changes_requested">
                            Request designer changes
                          </option>
                        </select>
                      </label>
                      <label>
                        Review note
                        <textarea name="note" rows={2} maxLength={3000} />
                      </label>
                    </ProjectForm>
                  </details>
                )}

              {liveDesignPhase &&
                isCurrent &&
                row?.status === 'approved' &&
                !row.clientApprovedAt &&
                canManage && (
                  <div className="pmt-design-owner-decision">
                    <p>
                      Record the owner’s decision. For an offline decision,
                      enter the meeting, call, or message reference.
                    </p>
                    <DesignDecisionForm
                      projectId={data.project.id}
                      designId={row.id}
                    />
                  </div>
                )}

              {canSubmit && (
                <ProjectDrawingForm
                  id={data.project.id}
                  kind={kind}
                  label={
                    row ? 'Upload requested revision' : 'Upload and submit plan'
                  }
                />
              )}
            </article>
          );
        })}
      </div>

      {allApproved && liveDesignPhase && canManage && (
        <details className="pmt-design-release">
          <summary>Release approved plans for site marking</summary>
          <ProjectForm
            projectId={data.project.id}
            operation="client_approve"
            label="Confirm plan set and release site preparation"
          >
            <label>
              Owner release reference
              <textarea
                name="evidence"
                required
                minLength={10}
                maxLength={3000}
                placeholder="Record the date and reference for the approved drawing set"
              />
            </label>
          </ProjectForm>
        </details>
      )}
    </section>
  );
}
