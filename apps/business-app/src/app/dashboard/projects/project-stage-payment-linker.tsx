'use client';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { linkConstructionStageRecord } from './[id]/site/stage-record-actions';

type Milestone = {
  id: string;
  label: string;
  amount: string;
  currency: string;
  contract_id: string;
  contract_number: string;
};
type Result = { saved: boolean; message: string };

/** For historical signed quotations with no immutable stage associations.
 * Assign the EXISTING milestone to its final QC-certified stage.
 * Never create a new quotation schedule or an invoice here.
 */
export function ProjectStagePaymentLinker({
  projectId,
  stageId,
  milestones,
}: {
  projectId: string;
  stageId: string;
  milestones: Milestone[];
}) {
  const router = useRouter();
  const [state, submit, pending] = useActionState(
    async (_prev: Result, form: FormData) => {
      const selected = milestones.find(
        (m) => m.id === String(form.get('milestone') ?? ''),
      );
      if (!selected)
        return {
          saved: false,
          message: 'Choose an existing agreed milestone.',
        };
      const result = await linkConstructionStageRecord(
        projectId,
        stageId,
        'payment',
        selected.id,
        selected.contract_id,
      );
      if (result.saved) router.refresh();
      return result;
    },
    { saved: false, message: '' },
  );
  if (!milestones.length) return null;
  return (
    <details className="pv2-stage-secondary">
      <summary>Link agreed payment milestone to this final stage</summary>
      <p className="pv2-hint">
        For older quotations without stage links, choose the milestone that
        becomes payable when this stage passes independent quality
        certification. This reuses the signed quotation schedule and never marks
        money as received.
      </p>
      <form action={submit} className="pv2-stage-associate-form">
        <label>
          Quotation payment milestone
          <select name="milestone" defaultValue="" required>
            <option value="" disabled>
              Choose the existing milestone
            </option>
            {milestones.map((m) => (
              <option value={m.id} key={m.id}>
                {m.label} · ₹{Number(m.amount).toLocaleString('en-IN')}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="pv2-button pv2-outline"
          disabled={pending}
        >
          {pending ? 'Linking…' : 'Link milestone'}
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
