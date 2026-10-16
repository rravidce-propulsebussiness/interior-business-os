'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { quotationCommand } from './actions';
import { savedStagePaymentPlan } from '@business-os/core/quotation-payment-plan';

type Milestone = { name: string; percent: string };
const START = '[STAGE_PAYMENT_PLAN]';
const END = '[/STAGE_PAYMENT_PLAN]';

const templates: Record<string, Milestone[]> = {
  construction: [
    { name: 'Agreement & advance', percent: '10' },
    { name: 'Foundation & plinth', percent: '20' },
    { name: 'RCC structure', percent: '25' },
    { name: 'Brickwork & roofing', percent: '15' },
    { name: 'Finishing works', percent: '20' },
    { name: 'Handover', percent: '10' },
  ],
  interior: [
    { name: 'Agreement & advance', percent: '20' },
    { name: 'Design approval', percent: '20' },
    { name: 'Material procurement', percent: '30' },
    { name: 'Installation', percent: '20' },
    { name: 'Handover', percent: '10' },
  ],
};

function readPlan(terms: string, industry: string, editable: boolean): Milestone[] {
  const saved = savedStagePaymentPlan(terms);
  if (saved) return saved.map((row) => ({name: row.name, percent: String(row.percent)}));
  // Suggestions are NOT silently saved. Read-only / issued revisions with no
  // confirmed schedule must not display suggested terms as agreed payments.
  return editable ? (templates[industry] ?? templates.interior)!.map((x) => ({ ...x })) : [];
}

export function PaymentScheduleEditor({
  industry, total, currency, editable, initial,
}: {
  industry: string;
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
}) {
  const [rows, setRows] = useState<Milestone[]>(() => readPlan(initial.terms, industry, editable));
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const savedPlan = savedStagePaymentPlan(initial.terms) !== null;
  const percentTotal = useMemo(() => rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0), [rows]);
  const valid = rows.length > 0 && rows.length <= 40
    && rows.every((row) => row.name.trim().length >= 2 && row.name.trim().length <= 100
      && Number.isFinite(Number(row.percent)) && Number(row.percent) > 0
      && Number(row.percent) <= 100 && /^\d+(?:\.\d{1,2})?$/.test(row.percent))
    && Math.abs(percentTotal - 100) < 0.001;
  const amount = Number(total);
  const money = (value: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format(value);
  const update = (index: number, key: keyof Milestone, value: string) =>
    setRows((all) => all.map((row, i) => i === index ? { ...row, [key]: value } : row));

  function save() {
    if (!valid || pending) return;
    setMessage('');
    const plan = START + '\n'
      + rows.map((row) => row.name.trim().replaceAll('|', '-') + '|' + Number(row.percent).toFixed(2)).join('\n')
      + '\n' + END;
    const existing = initial.terms.replace(/\[STAGE_PAYMENT_PLAN\][\s\S]*?\[\/STAGE_PAYMENT_PLAN\]/g, '').trim();
    const terms = (existing ? existing + '\n\n' : '') + plan;
    start(async () => {
      const result = await quotationCommand({
        ...initial, action: 'edit_revision', terms,
      });
      setMessage(result.message);
      if (result.id) router.refresh();
    });
  }

  return (
    <section className="qs-card" aria-label="Quotation stage-wise payments">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-orange-600">Proposed customer payment schedule</p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-950">Stage-wise payments</h2>
          <p className="mt-2 text-sm text-slate-600">
            These proposed milestones print in the customer PDF only after you save them.
          </p>
          <p role="status" className={'mt-3 rounded-xl border px-3 py-2 text-sm font-bold ' +
            (savedPlan ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
              'border-amber-200 bg-amber-50 text-amber-800')}>
            {savedPlan ? '✓ Stage-wise payment schedule saved in this quotation.' :
              editable ? 'Not saved yet — the percentages below are suggestions. Save to include them in the PDF.' :
              'No stage-wise payment schedule was saved in this issued quotation.'}
          </p>
        </div>
        {editable && <button type="button" className="qs-btn" onClick={() => {
          setRows((templates[industry] ?? templates.interior)!.map((x) => ({ ...x })));
        }}>Reset suggestions</button>}
      </div>
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr><th className="p-3">Milestone</th><th className="p-3">%</th><th className="p-3 text-right">Estimated payment</th>{editable && <th className="p-3"> </th>}</tr>
          </thead>
          <tbody>{rows.map((row, index) => (
            <tr className="border-t border-slate-100" key={index}>
              <td className="p-2"><input aria-label={'Milestone ' + (index + 1)} value={row.name} maxLength={100} disabled={!editable} onChange={(e) => update(index, 'name', e.target.value)} className="w-full min-w-40 rounded-lg border border-slate-200 px-3 py-2 disabled:border-transparent disabled:bg-transparent" /></td>
              <td className="p-2"><input aria-label={'Percent ' + (index + 1)} type="number" step="0.01" min="0.01" max="100" value={row.percent} disabled={!editable} onChange={(e) => update(index, 'percent', e.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-2 disabled:border-transparent disabled:bg-transparent" /></td>
              <td className="p-2 text-right font-semibold tabular-nums">{money(Math.round(amount * Number(row.percent || 0)) / 100)}</td>
              {editable && <td className="p-2"><button type="button" aria-label={'Remove milestone ' + (index + 1)} onClick={() => setRows((all) => all.filter((_, i) => i !== index))} className="text-red-600">Remove</button></td>}
            </tr>
          ))}</tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-extrabold">
            <tr><td className="p-3">Total</td><td className="p-3 tabular-nums">{percentTotal.toFixed(2)}%</td><td className="p-3 text-right tabular-nums">{money(amount)}</td>{editable && <td />}</tr>
          </tfoot>
        </table>
      </div>
      {editable && <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="qs-btn" disabled={rows.length >= 40} onClick={() => setRows((all) => [...all, { name: 'New milestone', percent: '0' }])}>+ Add stage</button>
        <button type="button" className="qs-btn primary" disabled={!valid || pending} onClick={save}>{pending ? 'Saving…' : savedPlan ? 'Save Updated Payment Schedule' : 'Save Stage-wise Payments to PDF'}</button>
        {!valid && <span className="text-sm font-semibold text-amber-700">Set positive percentages totaling exactly 100%.</span>}
      </div>}
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
      <p className="mt-3 text-xs text-slate-500">These are proposed milestones, not an invoice or payment receipt. The formal contract and billing schedule are created after quotation acceptance.</p>
    </section>
  );
}
