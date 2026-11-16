'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  savedStagePaymentPlan,
  savedStagePaymentLinks,
} from '@business-os/core/quotation-payment-plan';
import { ConstructionProgramEditor } from './construction-program-editor';

type Milestone = { name: string; percent: string; stageCodes: string[] };
type Props = {
  industry: string;
  floorNames?: string[];
  companyDefaults?: unknown;
  total: string;
  currency: string;
  editable: boolean;
  initial: {
    revision_id: string;
    version: number;
    terms: string;
    valid_until: string;
    customer_notes: string;
    internal_notes: string;
    discount: unknown;
  };
};

const defaultInteriorStages: Milestone[] = [
  { name: 'Agreement & advance', percent: '20', stageCodes: [] },
  { name: 'Design approval', percent: '20', stageCodes: [] },
  { name: 'Material procurement', percent: '30', stageCodes: [] },
  { name: 'Installation', percent: '20', stageCodes: [] },
  { name: 'Handover', percent: '10', stageCodes: [] },
];

function GenericPaymentSchedule({ total, currency, editable, initial }: Props) {
  const saved = savedStagePaymentPlan(initial.terms);
  const links = savedStagePaymentLinks(initial.terms);
  const [rows, setRows] = useState<Milestone[]>(
    saved
      ? saved.map((row, index) => ({
          name: row.name,
          percent: String(row.percent),
          stageCodes: links?.[index] ?? [],
        }))
      : editable
        ? defaultInteriorStages
        : [],
  );
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const amount = Number(total) || 0;
  const percentTotal = rows.reduce(
    (sum, row) => sum + (Number(row.percent) || 0),
    0,
  );
  const valid =
    rows.length > 0 &&
    rows.every(
      (row) => row.name.trim().length >= 2 && Number(row.percent) > 0,
    ) &&
    Math.abs(percentTotal - 100) < 0.001;
  const amounts = useMemo(
    () => rows.map((row) => (amount * Number(row.percent)) / 100),
    [amount, rows],
  );
  const money = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  const save = () => {
    if (!editable || pending || !valid) return;
    start(async () => {
      try {
        const response = await fetch(
          `/dashboard/quotations/${initial.revision_id}/conditions`,
          {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'payments',
              stages: rows,
              stageRequirements: {},
              milestoneFlow: {},
            }),
          },
        );
        const result = (await response.json().catch(() => null)) as {
          id?: string;
          message?: string;
        } | null;
        if (!response.ok || !result?.id) {
          setMessage(
            result?.message ?? 'Could not save this payment schedule.',
          );
          return;
        }
        setMessage('Payment schedule saved to this quotation.');
        router.refresh();
      } catch {
        setMessage('Network error saving this payment schedule.');
      }
    });
  };

  return (
    <section className="qs-card qs-payment-panel">
      <header className="qs-payment-heading">
        <div>
          <h2>Payment schedule</h2>
          <p>Payment milestones and amounts for this quotation.</p>
        </div>
      </header>
      <div className="qs-payment-stages">
        <div className="qs-payment-table-head">
          <span>Milestone</span>
          <span>Share</span>
          <span>Amount</span>
        </div>
        {rows.map((row, index) => (
          <div className="qs-payment-row" key={index}>
            <label className="qs-payment-stage-name">
              <input
                aria-label="Milestone name"
                value={row.name}
                disabled={!editable}
                onChange={(event) =>
                  setRows((all) =>
                    all.map((item, i) =>
                      i === index
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </label>
            <label className="qs-payment-percent">
              <input
                aria-label="Payment percentage"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={row.percent}
                disabled={!editable}
                onChange={(event) =>
                  setRows((all) =>
                    all.map((item, i) =>
                      i === index
                        ? { ...item, percent: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <span>%</span>
            </label>
            <div className="qs-payment-amount">
              <output>{money(amounts[index] ?? 0)}</output>
            </div>
            {editable && (
              <button
                className="qs-payment-remove"
                type="button"
                aria-label="Remove milestone"
                onClick={() =>
                  setRows((all) => all.filter((_, i) => i !== index))
                }
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <div className="qs-payment-actions">
          <button
            type="button"
            onClick={() =>
              setRows((all) => [
                ...all,
                { name: '', percent: '', stageCodes: [] },
              ])
            }
          >
            + Add payment stage
          </button>
          <button
            className="qs-payment-save"
            type="button"
            disabled={pending || !valid}
            onClick={save}
          >
            {pending ? 'Saving…' : 'Save payment schedule'}
          </button>
        </div>
      )}
      <div className="qs-payment-summary">
        <strong>Total: {percentTotal.toFixed(2)}%</strong>
        <strong>Quoted amount: {money(amount)}</strong>
      </div>
      {message && (
        <p className="qs-payment-feedback" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

export function PaymentScheduleEditor(props: Props) {
  if (props.industry === 'construction')
    return (
      <ConstructionProgramEditor
        total={props.total}
        currency={props.currency}
        editable={props.editable}
        floorNames={props.floorNames ?? []}
        companyDefaults={props.companyDefaults}
        initial={{
          revision_id: props.initial.revision_id,
          terms: props.initial.terms,
        }}
      />
    );
  return <GenericPaymentSchedule {...props} />;
}
