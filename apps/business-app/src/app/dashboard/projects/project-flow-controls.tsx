'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveConstructionStageExecution } from './[id]/site/stage-execution-actions';
import {
  recordDesignClientDecision,
  setAdvanceBeforeDesign,
} from './[id]/site/work-item-actions';

type Feedback = { ok: boolean; text: string } | null;
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<Feedback>(null);
  const run = (fn: () => Promise<{ saved: boolean; message: string }>) => {
    setMessage(null);
    start(async () => {
      const result = await fn();
      setMessage({ ok: result.saved, text: result.message });
      if (result.saved) router.refresh();
    });
  };
  return { pending, message, run };
}
const Msg = ({ m }: { m: Feedback }) =>
  m ? (
    <p role="status" className={'pf-msg ' + (m.ok ? 'ok' : 'bad')}>
      {m.text}
    </p>
  ) : null;

/** Starts a stage (the database checks dependencies and hold points) or
 * submits finished field work for independent QC. */
export function StageButton({
  projectId,
  stageId,
  action,
  label,
}: {
  projectId: string;
  stageId: string;
  action: 'start' | 'submit_for_qc';
  label: string;
}) {
  const { pending, message, run } = useAction();
  return (
    <div className="pf-inline-action">
      <button
        type="button"
        className="pf-btn pf-btn-primary"
        disabled={pending}
        onClick={() =>
          run(() => saveConstructionStageExecution(projectId, stageId, action))
        }
      >
        {pending ? 'Saving…' : label}
      </button>
      <Msg m={message} />
    </div>
  );
}

/** Owner records an offline homeowner decision on the current drawing. */
export function DesignDecisionForm({
  projectId,
  designId,
}: {
  projectId: string;
  designId: string;
}) {
  const { pending, message, run } = useAction();
  return (
    <form
      className="pf-row pf-decision"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        form.set('design_id', designId);
        form.set(
          'decision',
          (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ??
            'approved',
        );
        run(() => recordDesignClientDecision(projectId, form));
      }}
    >
      <input
        name="evidence"
        required
        minLength={10}
        maxLength={2000}
        placeholder="Evidence: meeting, email or call reference"
      />
      <button
        className="pf-btn pf-btn-primary"
        value="approved"
        disabled={pending}
      >
        Homeowner approved
      </button>
      <button className="pf-btn" value="changes_requested" disabled={pending}>
        Changes requested
      </button>
      <Msg m={message} />
    </form>
  );
}

export function AdvancePolicyToggle({
  projectId,
  beforeDesign,
}: {
  projectId: string;
  beforeDesign: boolean;
}) {
  const { pending, message, run } = useAction();
  return (
    <div className="pf-inline-action">
      <label className="pf-switch">
        <input
          type="checkbox"
          defaultChecked={beforeDesign}
          disabled={pending}
          onChange={(event) =>
            run(() => setAdvanceBeforeDesign(projectId, event.target.checked))
          }
        />
        <span>Hold design until the advance is verified by Finance</span>
      </label>
      <Msg m={message} />
    </div>
  );
}
