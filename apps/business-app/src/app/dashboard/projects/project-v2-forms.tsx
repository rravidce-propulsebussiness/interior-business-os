'use client';
import { useActionState, useTransition, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { saveProjectSite, uploadProjectSiteMedia } from './[id]/site/actions';
import {
  recordHomeownerDirectSupplierCashPayment,
  saveProjectMaterials,
} from './[id]/site/stage-checklist-actions';
import {
  syncConstructionFromProjectAgreement,
  assignConstructionRole,
} from './[id]/site/construction-actions';
import {
  createAgreementException,
  saveSignedAgreement,
} from './[id]/site/agreement-actions';
import { prepareAgreementFromProjectQuote } from './project-agreement-actions';
import { financeCommand } from '../finance/actions';
import { submitProjectDrawing } from './project-design-actions';

type Result = { saved: boolean; message: string };
const initial: Result = { saved: false, message: '' };
export function ProjectForm({
  projectId,
  operation,
  label,
  children,
  media = false,
}: {
  projectId: string;
  operation: string;
  label: string;
  children: ReactNode;
  media?: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (_prev: Result, form: FormData): Promise<Result> => {
      const result = media
        ? await uploadProjectSiteMedia(projectId, form)
        : await saveProjectSite(projectId, operation, form);
      if (result.saved) router.refresh();
      return result;
    },
    initial,
  );
  return (
    <form action={action} className="pv2-form" encType={undefined}>
      <div className="pv2-form-fields">{children}</div>
      <button
        className="pv2-button pv2-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? 'Saving…' : label}
      </button>
      {state.message && (
        <p
          role="status"
          className={'pv2-form-feedback ' + (state.saved ? 'good' : 'bad')}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
/** Creates the existing Finance contract from the immutable Final quotation.
 * It does not claim customer acceptance or generate an agreement PDF. */
export function PrepareAgreement({
  projectId,
  revisionId,
}: {
  projectId: string;
  revisionId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [prepared, setPrepared] = useState(false);
  return (
    <div className="pv2-prepare-agreement">
      <button
        type="button"
        disabled={pending || prepared}
        className="pv2-button pv2-primary"
        onClick={() =>
          start(async () => {
            const result = await prepareAgreementFromProjectQuote(
              projectId,
              revisionId,
            );
            setMessage(result.message);
            if (result.saved) {
              setPrepared(true);
              router.refresh();
            }
          })
        }
      >
        {pending
          ? 'Preparing…'
          : prepared
            ? 'Project prepared'
            : 'Prepare project from Final quotation'}
      </button>
      {message && (
        <p
          role="status"
          className={'pv2-form-feedback ' + (prepared ? 'good' : '')}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/** The existing Finance contract is activated here, never by creating a second
 * agreement or navigating to a parallel contract-detail workspace. */
export function ProjectContractActivation({
  contractId,
  version,
  offlineAgreement = false,
}: {
  contractId: string;
  version: number;
  offlineAgreement?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [activated, setActivated] = useState(false);
  return (
    <div className="pv2-contract-activation">
      <button
        type="button"
        className="pv2-button pv2-primary"
        disabled={pending || activated}
        onClick={() =>
          start(async () => {
            const result = await financeCommand({
              action: 'contract_status',
              id: contractId,
              version,
              status: 'active',
              reason: offlineAgreement
                ? 'Owner confirmed that the final quotation is the agreed scope and the separate agreement is handled offline or skipped.'
                : 'Signed agreement evidence has been recorded for this project.',
            });
            setMessage(result.message);
            if (result.id) {
              setActivated(true);
              router.refresh();
            }
          })
        }
      >
        {pending
          ? 'Activating…'
          : activated
            ? 'Contract activated'
            : offlineAgreement
              ? 'Activate quote-based project'
              : 'Activate signed contract'}
      </button>
      {message && (
        <p
          role="status"
          className={'pv2-form-feedback ' + (activated ? 'good' : 'bad')}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/** Owner-only record that the homeowner approved the final quote/agreement offline.
 * This records the owner's confirmation without claiming a digital signature. */
export function SkipAgreementUpload({
  projectId,
  contractId,
}: {
  projectId: string;
  contractId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="pv2-offline-agreement">
      <p className="pv2-hint">
        If the homeowner approved the final quotation or agreement offline, the
        company owner can record that approval here. No separate signed upload
        or digital signature is required.
      </p>
      <label className="pv2-offline-agreement-ack">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
          disabled={pending || saved}
        />
        I am the company owner and confirm the homeowner approved this final
        quotation or agreement offline.
      </label>
      <button
        type="button"
        className="pv2-button"
        disabled={pending || saved || !confirmed}
        onClick={() => {
          start(async () => {
            const form = new FormData();
            form.set(
              'reason',
              'Company owner confirms the homeowner approved the final quotation offline; no separate signed agreement upload or digital signature was used.',
            );
            form.set('reference', 'Owner-recorded offline homeowner approval');
            const result = await createAgreementException(
              projectId,
              contractId,
              form,
            );
            setMessage(result.message);
            if (result.saved) {
              setSaved(true);
              router.refresh();
            }
          });
        }}
      >
        {pending
          ? 'Recording owner decision…'
          : saved
            ? 'Offline approval recorded'
            : 'Record offline homeowner approval'}
      </button>
      {message && (
        <p
          role="status"
          className={'pv2-form-feedback ' + (saved ? 'good' : 'bad')}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export function SyncStages({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  return (
    <div className="pv2-sync">
      <button
        className="pv2-button pv2-primary"
        disabled={pending}
        onClick={() => {
          start(async () => {
            const result = await syncConstructionFromProjectAgreement(id);
            setMessage(result.message);
            if (result.saved) router.refresh();
          });
        }}
      >
        {' '}
        {pending ? 'Checking quotation…' : 'Import stages from Final quotation'}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
export function AssignRole({
  projectId,
  users,
}: {
  projectId: string;
  users: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [state, submit, pending] = useActionState(
    async (_prev: Result, form: FormData): Promise<Result> => {
      const r = await assignConstructionRole(projectId, form);
      if (r.saved) router.refresh();
      return r;
    },
    initial,
  );
  return (
    <form action={submit} className="pv2-form">
      <div className="pv2-form-fields pv2-two">
        <label>
          Team member
          <select name="user_id" required>
            <option value="">Select employee</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Project role
          <select name="role" defaultValue="site_engineer">
            {[
              'project_manager',
              'architect',
              'structural_engineer',
              'site_engineer',
              'supervisor',
              'quality_inspector',
              'watchman',
              'procurement',
              'storekeeper',
              'quantity_surveyor',
              'accounts_officer',
            ].map((role) => (
              <option value={role} key={role}>
                {role.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="pv2-button pv2-primary" disabled={pending}>
        Assign to project
      </button>
      {state.message && (
        <p role="status" className="pv2-form-feedback">
          {state.message}
        </p>
      )}
    </form>
  );
}
/** Primary next action after recording the agreement choice: a floor plan,
 * followed by technical review, structural/3D drawings and final client
 * design confirmation. Not a physical construction authorization. */
export function ProjectDrawingForm({
  id,
  kind,
  label,
}: {
  id: string;
  kind?: string;
  label: string;
}) {
  const router = useRouter();
  const [state, submit, pending] = useActionState(
    async (_prev: Result, form: FormData): Promise<Result> => {
      const result = await submitProjectDrawing(id, form);
      if (result.saved || result.uploaded) router.refresh();
      return result;
    },
    initial,
  );
  return (
    <form action={submit} className="pv2-form pv2-drawing-form">
      {kind ? (
        <input type="hidden" name="kind" value={kind} />
      ) : (
        <label>
          Drawing type
          <select name="kind" defaultValue="architectural_plan">
            {[
              'architectural_plan',
              '3d_design',
              'structural_design',
              'interior_layout',
              'electrical_plan',
              'plumbing_plan',
            ].map((k) => (
              <option key={k} value={k}>
                {k.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Upload drawing (PDF or image, up to 8 MB)
        <input
          name="file"
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
        />
      </label>
      <label>
        Drawing number or existing WhatsApp / offline share reference
        <input
          name="reference"
          maxLength={1500}
          placeholder="Upload the drawing or record its existing share/reference"
        />
      </label>
      <label>
        Revision notes
        <textarea
          name="notes"
          rows={2}
          maxLength={3000}
          placeholder="Floor, requested layout and revision details"
        />
      </label>
      <p className="pv2-hint">
        If the plan was already shared in WhatsApp or offline, record the
        date/message/file reference here instead of uploading it again. This
        records submission for technical review; it does not record homeowner
        approval.
      </p>
      <button
        className="pv2-button pv2-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? 'Saving drawing…' : label}
      </button>
      {state.message && (
        <p
          role="status"
          className={'pv2-form-feedback ' + (state.saved ? 'good' : 'bad')}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
export function ProjectLifecycle({
  id,
  stage,
  canManage,
  designs,
  agreementCleared,
  industry,
  executionReady = false,
}: {
  id: string;
  stage: string;
  canManage: boolean;
  agreementCleared: boolean;
  industry: string;
  executionReady?: boolean;
  designs: { id: string; kind: string; status: string }[];
}) {
  if (!canManage) return null;
  if (stage === 'not_started')
    return (
      <section className="pv2-panel pv2-lifecycle">
        <h2>Enable project design workspace</h2>
        <p>
          This project already exists from its approved quotation. Enable its
          drawing and site registers without creating a second project.
        </p>
        <InitializeSite id={id} />
      </section>
    );
  if (stage === 'design') {
    const interior = /interior/i.test(industry);
    const initialKind = interior ? 'interior_layout' : 'architectural_plan';
    const required = interior
      ? ['interior_layout', 'structural_design', '3d_design']
      : [
          'architectural_plan',
          'structural_design',
          '3d_design',
          'electrical_plan',
          'plumbing_plan',
        ];
    const latest = (kind: string) => designs.find((x) => x.kind === kind);
    const first = latest(initialKind);
    const nextKind = required.find(
      (kind) => kind !== initialKind && latest(kind)?.status !== 'approved',
    );
    const submitted = designs.filter((x) => x.status === 'submitted');
    const allApproved = required.every(
      (kind) => latest(kind)?.status === 'approved',
    );
    const canSubmitPrimary = !first || first.status === 'changes_requested';
    return (
      <section className="pv2-panel pv2-lifecycle pv2-design-workflow">
        <div className="pv2-design-step-head">
          <span className="pv2-design-step-index">01</span>
          <div>
            <h2>
              {canSubmitPrimary
                ? 'Floor Plan Preparation'
                : first?.status === 'submitted'
                  ? 'Floor Plan Under Review'
                  : 'Floor Plan & Design Revisions'}
            </h2>
            <p>
              Progress in order: floor plan and homeowner changes → structural
              design → 3D elevation → electrical and plumbing / MEP plans →
              final homeowner confirmation.
            </p>
          </div>
        </div>
        {!agreementCleared ? (
          <p className="pv2-stage-setup-notice">
            Record the agreement choice before submitting drawings: upload the
            offline signed copy or use the owner-authorized Final quotation
            option.
          </p>
        ) : (
          <>
            {canSubmitPrimary ? (
              <ProjectDrawingForm
                id={id}
                kind={initialKind}
                label="Submit floor plan for review"
              />
            ) : (
              <p className="pv2-design-step-state">
                Floor plan:{' '}
                <strong>
                  {first?.status === 'approved'
                    ? 'Technically approved'
                    : 'Submitted for technical review'}
                </strong>
              </p>
            )}
            {submitted.map((x) => (
              <details className="pv2-edit-drawer" key={x.id}>
                <summary>Review {x.kind.replaceAll('_', ' ')} drawing</summary>
                <ProjectForm
                  projectId={id}
                  operation="design_decide"
                  label="Save technical review"
                >
                  <input type="hidden" name="id" value={x.id} />
                  <label>
                    Technical decision
                    <select name="decision">
                      <option value="approved">Approve</option>
                      <option value="changes_requested">Request changes</option>
                    </select>
                  </label>
                  <label>
                    Review note
                    <textarea name="note" rows={2} />
                  </label>
                </ProjectForm>
              </details>
            ))}
            {first?.status === 'approved' &&
              nextKind &&
              !submitted.some((x) => x.kind === nextKind) && (
                <div className="pv2-design-next">
                  <h3>Next drawing: {nextKind.replaceAll('_', ' ')}</h3>
                  <ProjectDrawingForm
                    id={id}
                    kind={nextKind}
                    label="Submit next design for review"
                  />
                </div>
              )}
            {allApproved ? (
              <details className="pv2-edit-drawer">
                <summary>Record final client design confirmation</summary>
                <ProjectForm
                  projectId={id}
                  operation="client_approve"
                  label="Record client design confirmation"
                >
                  <label>
                    Client confirmation reference
                    <textarea
                      name="evidence"
                      required
                      minLength={10}
                      maxLength={3000}
                      placeholder="Date and recorded approval of latest plans"
                    />
                  </label>
                  <p className="pv2-hint">
                    A manager-recorded approval is not an authenticated digital
                    signature.
                  </p>
                </ProjectForm>
              </details>
            ) : (
              <p className="pv2-hint">
                Final homeowner confirmation becomes available after required
                plans pass technical review. Record a reference for plans
                already shared externally; design stages must still be reviewed
                before site execution.
              </p>
            )}
          </>
        )}
      </section>
    );
  }
  // The backend is the authority for signed current contract, active schedule,
  // actual recorded receipt where required and any owner-authorized exception.
  // Do not present a clickable Start button until Finance reports clearance.
  if (stage === 'client_approved')
    return executionReady ? (
      <div className="pv2-ready-to-execute">
        <ProjectForm
          projectId={id}
          operation="execution_start"
          label="Start site execution"
        >
          <p className="pv2-hint">
            Financial clearance confirmed. Start physical work when the site and
            safety team are ready.
          </p>
        </ProjectForm>
      </div>
    ) : null;
  return null;
}
/** One form handles either a new signed PDF or a previously uploaded copy. */
export function SignedAgreementUploadForm({
  projectId,
  contractId,
  media,
  recorded = false,
}: {
  projectId: string;
  contractId: string;
  media: { id: string; name: string }[];
  recorded?: boolean;
}) {
  const router = useRouter();
  const [state, submit, pending] = useActionState(
    async (_prev: Result, form: FormData) => {
      const result = await saveSignedAgreement(projectId, contractId, form);
      if (result.saved || result.uploaded) router.refresh();
      return result;
    },
    initial,
  );
  return (
    <form action={submit} className="pv2-form pv2-signed-agreement-form">
      <label>
        Upload signed agreement PDF
        <input type="file" name="file" accept="application/pdf" />
      </label>
      {media.length > 0 && (
        <label>
          Or use a signed PDF already uploaded
          <select name="media_id" defaultValue="">
            <option value="">Select existing signed PDF (optional)</option>
            {media.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Signing details
        <textarea
          name="note"
          rows={3}
          required
          minLength={12}
          maxLength={3000}
          placeholder="Who signed, signing date, and how the signed copy was received"
        />
      </label>
      <p className="pv2-hint">
        Choose one PDF option only. Select an existing file only if it contains
        the actual signatures. A PDF by itself is not evidence of signing until
        you save these details. Maximum upload size 8 MB.
      </p>
      <button
        type="submit"
        className="pv2-button pv2-primary"
        disabled={pending}
      >
        {pending
          ? 'Saving signed agreement…'
          : recorded
            ? 'Save replacement signed agreement'
            : 'Save signed agreement'}
      </button>
      {state.message && (
        <p
          role="status"
          className={'pv2-form-feedback ' + (state.saved ? 'good' : 'bad')}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
export function SiteReportForm({ id }: { id: string }) {
  const indiaToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return (
    <ProjectForm
      projectId={id}
      operation="report_add"
      label="Save daily work update"
    >
      <div className="pv2-two">
        <label>
          Work date
          <input
            type="date"
            name="report_date"
            required
            defaultValue={indiaToday}
          />
        </label>
        <label>
          Workers on site
          <input
            name="worker_count"
            type="number"
            min="0"
            max="10000"
            defaultValue="0"
            required
          />
        </label>
      </div>
      <label>
        Today's completed work
        <textarea
          name="completed_work"
          rows={3}
          required
          minLength={5}
          placeholder="Example: Column reinforcement, 12 columns completed"
        />
      </label>
      <label>
        Next work plan
        <textarea
          name="tomorrow_plan"
          rows={3}
          required
          minLength={5}
          placeholder="What should happen next? Example: Begin shuttering and vertical-alignment check"
        />
      </label>
      <div className="pv2-two">
        <label>
          Workers needed tomorrow
          <input name="tomorrow_workers" type="number" min="0" max="10000" />
        </label>
        <label>
          Blockers / delays
          <input name="blockers" maxLength={2000} placeholder="Optional" />
        </label>
      </div>
      <div className="pv2-two">
        <label>
          Checks completed
          <textarea name="checks_done" rows={2} />
        </label>
        <label>
          Checks required
          <textarea name="checks_required" rows={2} />
        </label>
      </div>
    </ProjectForm>
  );
}
type MaterialLine = {
  item: string;
  quantity: string;
  unit: string;
  notes: string;
};
/** Suggested units are editable; the approved BOQ remains the authoritative quantity/unit. */
function proposedUnitFor(name: string): string {
  const value = name.toLowerCase();
  if (/cement|tile adhesive|grout|putty|plaster mix/.test(value)) return 'bags';
  if (
    /bricks|blocks|pegs|stakes|spacers|frames|hinges|locks|handles|boxes|clips|props|shutters|fittings|stoppers|sheets/.test(
      value,
    )
  )
    return 'nos';
  if (/ready-mix concrete|aggregates|sand|murram|filling soil/.test(value))
    return 'cum';
  if (/tiles|safety net|waterproofing membrane|plywood/.test(value))
    return 'sqft';
  if (/paint|primer|chemical|admixture/.test(value)) return 'litres';
  if (/pipes|hoses|conduits|thread|tape|line/.test(value)) return 'metres';
  return 'kg';
}
const newMaterial = (): MaterialLine => ({
  item: '',
  quantity: '',
  unit: 'kg',
  notes: '',
});
const materialUnits = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'tonnes', label: 'Metric tonnes' },
  { value: 'bags', label: 'Bags' },
  { value: 'nos', label: 'Pieces / numbers' },
  { value: 'litres', label: 'Litres' },
  { value: 'sqft', label: 'Square feet' },
  { value: 'sqm', label: 'Square metres' },
  { value: 'cft', label: 'Cubic feet' },
  { value: 'cum', label: 'Cubic metres' },
  { value: 'yards', label: 'Yards' },
  { value: 'metres', label: 'Metres' },
  { value: 'feet', label: 'Feet' },
];
export function MaterialRequestForm({
  id,
  stageId,
  activityIndex,
  activityLabel,
  suggestions = [],
}: {
  id: string;
  stageId?: string;
  activityIndex?: number;
  activityLabel?: string;
  suggestions?: readonly string[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<MaterialLine[]>([newMaterial()]);
  const [state, submit, pending] = useActionState(
    async (_prev: Result, form: FormData) => {
      const result = await saveProjectMaterials(
        id,
        form,
        stageId,
        activityIndex,
      );
      if (result.saved) {
        setItems([newMaterial()]);
        router.refresh();
      }
      return result;
    },
    initial,
  );
  const edit = (index: number, key: keyof MaterialLine, value: string) =>
    setItems((current) =>
      current.map((row, i) => (index === i ? { ...row, [key]: value } : row)),
    );
  return (
    <form action={submit} className="pv2-form pv2-batch-material-form">
      <p className="pv2-hint">
        {activityLabel
          ? 'Request materials for ' +
            activityLabel +
            '. Quantity approval, marketplace sourcing and delivery tracking use the existing procurement workflow.'
          : 'Request stage materials. Approval is required before marketplace sourcing. No order is placed automatically.'}
      </p>
      {items.map((row, i) => (
        <div className="pv2-material-line" key={i}>
          <div className="pv2-material-line-head">
            <strong>Material {i + 1}</strong>
            {items.length > 1 && (
              <button
                type="button"
                className="pv2-button pv2-outline"
                onClick={() => setItems((v) => v.filter((_, n) => i !== n))}
              >
                Remove
              </button>
            )}
          </div>
          {!!suggestions.length && (
            <label>
              Choose material from this stage (or enter your own)
              <select
                aria-label={'Suggested material ' + (i + 1)}
                value=""
                onChange={(e) => {
                  if (e.target.value)
                    setItems((current) =>
                      current.map((item, index) =>
                        index === i
                          ? {
                              ...item,
                              item: e.target.value,
                              unit: proposedUnitFor(e.target.value),
                            }
                          : item,
                      ),
                    );
                }}
              >
                <option value="">Select a material</option>
                {suggestions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="pv2-two">
            <label>
              Material / size
              <input
                required
                minLength={2}
                maxLength={200}
                value={row.item}
                onChange={(e) => edit(i, 'item', e.target.value)}
                placeholder="Example: TMT steel 8 mm, cement"
              />
            </label>
            <label>
              Quantity
              <input
                type="number"
                required
                min=".001"
                step=".001"
                max="100000000"
                value={row.quantity}
                onChange={(e) => edit(i, 'quantity', e.target.value)}
              />
            </label>
          </div>
          <label>
            Unit
            <select
              value={row.unit}
              onChange={(e) => edit(i, 'unit', e.target.value)}
            >
              {materialUnits.map((unit) => (
                <option value={unit.value} key={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Instructions (optional)
            <input
              maxLength={3000}
              value={row.notes}
              onChange={(e) => edit(i, 'notes', e.target.value)}
              placeholder="Grade, brand, delivery instructions"
            />
          </label>
        </div>
      ))}
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          items.map((row) => ({
            item: row.item,
            quantity: row.quantity,
            unit: row.unit,
            notes: row.notes,
          })),
        )}
      />
      <div className="pv2-material-line-controls">
        {items.length < 12 && (
          <button
            type="button"
            className="pv2-button pv2-outline"
            onClick={() => setItems((v) => [...v, newMaterial()])}
          >
            + Add another material
          </button>
        )}
        <button
          type="submit"
          className="pv2-button pv2-primary"
          disabled={pending}
        >
          {pending
            ? 'Saving…'
            : 'Send ' +
              items.length +
              ' material' +
              (items.length === 1 ? '' : 's') +
              ' for approval'}
        </button>
      </div>
      {state.message && (
        <p
          role="status"
          className={'pv2-form-feedback ' + (state.saved ? 'good' : 'bad')}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
/** Approval only. Orders and site receipts require explicit delivery actions. */
export function MaterialUpdateForm({
  id,
  material,
}: {
  id: string;
  material: {
    id: string;
    status: string;
    source?: string;
    vendorReference?: string;
  };
}) {
  if (material.status !== 'requested') return null;
  return (
    <details className="pv2-subaction">
      <summary>Approve / reject</summary>
      <ProjectForm
        projectId={id}
        operation="material_update"
        label="Save decision"
      >
        <input type="hidden" name="id" value={material.id} />
        <input type="hidden" name="source" value="undecided" />
        <input type="hidden" name="vendor_reference" value="" />
        <label>
          Material decision
          <select name="status" defaultValue="approved">
            <option value="approved">Approve for ordering</option>
            <option value="rejected">Reject request</option>
          </select>
        </label>
        <p className="pv2-hint">
          Approval permits an authorized employee to place an order. No order or
          client delivery estimate is created yet.
        </p>
      </ProjectForm>
    </details>
  );
}
/** Records the direct homeowner-to-supplier cash payment on the existing material request. */
export function DirectSupplierCashPaymentForm({
  id,
  materialId,
}: {
  id: string;
  materialId: string;
}) {
  const router = useRouter();
  const [state, submit, pending] = useActionState(
    async (_prev: Result, form: FormData) => {
      const result = await recordHomeownerDirectSupplierCashPayment(id, form);
      if (result.saved) router.refresh();
      return result;
    },
    initial,
  );
  return (
    <details className="pv2-subaction pv2-direct-supplier-payment">
      <summary>Record homeowner cash paid directly to supplier</summary>
      <form action={submit} className="pv2-form">
        <input type="hidden" name="material_id" value={materialId} />
        <p className="pv2-hint">
          Cash settlement only. This records the homeowner paying the supplier
          directly; it does not add a company receipt, invoice, or company cash
          expense.
        </p>
        <label>
          Supplier name
          <input name="supplier" required minLength={2} maxLength={200} />
        </label>
        <div className="pv2-two">
          <label>
            Amount paid (₹)
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              max="100000000"
              required
            />
          </label>
          <label>
            Date paid
            <input name="paid_date" type="date" required />
          </label>
        </div>
        <label>
          Supplier receipt / cash reference (optional)
          <input name="reference" maxLength={200} />
        </label>
        <label>
          Owner note
          <textarea
            name="note"
            rows={2}
            minLength={3}
            maxLength={1500}
            required
            placeholder="TEST ONLY — owner records homeowner's direct cash payment to supplier"
          />
        </label>
        <button
          className="pv2-button pv2-primary"
          type="submit"
          disabled={pending}
        >
          {pending ? 'Saving…' : 'Mark supplier as paid in cash'}
        </button>
        {state.message && (
          <p
            role="status"
            className={'pv2-form-feedback ' + (state.saved ? 'good' : 'bad')}
          >
            {state.message}
          </p>
        )}
      </form>
    </details>
  );
}
export function QualityForm({ id }: { id: string }) {
  return (
    <ProjectForm projectId={id} operation="check_add" label="Add check">
      <label>
        Inspection title
        <input
          name="title"
          required
          minLength={3}
          maxLength={200}
          placeholder="Column steel binding check"
        />
      </label>
      <label>
        Due date
        <input name="due_date" type="date" />
      </label>
      <label>
        Checklist / notes
        <textarea name="notes" rows={3} />
      </label>
    </ProjectForm>
  );
}
export function ReviewCheck({ id, checkId }: { id: string; checkId: string }) {
  return (
    <details className="pv2-subaction">
      <summary>Record inspection result</summary>
      <ProjectForm projectId={id} operation="check_update" label="Save result">
        <input type="hidden" name="id" value={checkId} />
        <label>
          Decision
          <select name="status">
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="recheck">Recheck required</option>
          </select>
        </label>
        <label>
          Review note
          <textarea name="notes" rows={2} />
        </label>
      </ProjectForm>
    </details>
  );
}
export function SiteMediaForm({
  id,
  category = 'daily',
}: {
  id: string;
  category?: string;
}) {
  return (
    <ProjectForm
      projectId={id}
      operation="upload"
      label="Upload to project"
      media
    >
      <label>
        File
        <input
          required
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
        />
      </label>
      <label>
        Category
        <select name="category" defaultValue={category}>
          {['daily', 'site', 'inspection', 'design', 'curing'].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Caption
        <input
          name="caption"
          maxLength={500}
          placeholder="Description of photo or file"
        />
      </label>
      <p className="pv2-hint">
        Private file · maximum 8 MB · access limited by project permissions
      </p>
    </ProjectForm>
  );
}
export function GateForm({ id }: { id: string }) {
  return (
    <ProjectForm projectId={id} operation="gate_add" label="Save site entry">
      <label>
        Entry type
        <select name="kind">
          {[
            'labour',
            'curing',
            'material_delivery',
            'security_round',
            'visitor',
          ].map((v) => (
            <option key={v} value={v}>
              {v.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Description
        <textarea name="description" minLength={3} required rows={2} />
      </label>
      <label>
        Notes
        <textarea name="notes" rows={2} />
      </label>
    </ProjectForm>
  );
}
export function InitializeSite({ id }: { id: string }) {
  return (
    <ProjectForm
      projectId={id}
      operation="initialize"
      label="Initialize project delivery"
    >
      <p className="pv2-hint">
        Creates the existing project delivery state, not a duplicate project.
      </p>
    </ProjectForm>
  );
}
