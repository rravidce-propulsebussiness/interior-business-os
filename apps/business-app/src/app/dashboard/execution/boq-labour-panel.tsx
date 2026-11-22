'use client';

import { useMemo, useState } from 'react';
import {
  COVERED_BY_DEFAULT,
  LABOUR_WORKS,
  evaluateLabour,
  extraCoveredWorks,
  isExtraAllowed,
  labourExtraQuantity,
  labourMeasurements,
  labourWorkName,
  measuredLabourQuantity,
  type LabourConfig,
  type LabourExtra,
  type LabourMethod,
  type LabourLine,
  type LabourWorkId,
} from './boq-labour';

type Props = {
  config: LabourConfig;
  onChange: (config: LabourConfig) => void;
  floors: { name: string; areaSqft: number }[];
  lines: LabourLine[];
  materialCost: number;
  existingLabourCost: number;
  canEdit: boolean;
  canViewCost: boolean;
  busy: boolean;
  onSave: () => void;
};
const money = (n: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(n || 0);
const number = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const clean = (n: number) => Number.isFinite(n) && n >= 0 ? n : 0;
const uid = () => 'extra-' + Math.random().toString(36).slice(2, 11);
const workOptions = LABOUR_WORKS.map((w) => ({ value: w.id, label: w.name }));

export function BoqLabourPanel({
  config, onChange, floors, lines, materialCost, existingLabourCost, canEdit,
  canViewCost, busy, onSave,
}: Props) {
  const measures = useMemo(() => labourMeasurements(lines), [lines]);
  const result = evaluateLabour(config, floors, measures);
  const builtUp = floors.reduce((sum, f) => sum + f.areaSqft, 0);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [extraMethod, setExtraMethod] = useState<'itemwise' | 'daily'>('itemwise');
  const [draft, setDraft] = useState<LabourExtra>({
    id: uid(), name: '', stage: floors[0]?.name ?? 'Foundation',
    work: 'excavation', includedWorks: [], method: 'itemwise', unit: 'm³',
    quantity: 0, quantitySource: 'manual', rate: 0, workers: 1, days: 1,
    outsideScope: false,
  });
  const change = (values: Partial<LabourConfig>) => onChange({ ...config, ...values });
  const setDraftValues = (values: Partial<LabourExtra>) => setDraft((previous) => ({ ...previous, ...values }));
  const stageNames = [...new Set(['Foundation', ...floors.map((f) => f.name),
    ...lines.map((l) => l.section), 'External works', 'General'])];
  const missingRates = config.method === 'itemwise' &&
    measures.some((m) => !(config.itemRates[m.work] && config.itemRates[m.work]! > 0));
  const sourceQty = measuredLabourQuantity(measures, draft.work, draft.stage, draft.unit);
  const overlapsExisting = draft.method === 'itemwise' && draft.quantitySource === 'boq' &&
    config.extras.some((item) => item.method === 'itemwise' &&
      item.quantitySource === 'boq' && item.stage === draft.stage &&
      extraCoveredWorks(item).some((work) => extraCoveredWorks(draft).includes(work)));
  const allowDraft = !overlapsExisting && isExtraAllowed(config, draft) && draft.name.trim().length > 0 &&
    draft.rate >= 0 && (
      draft.method === 'daily' ? draft.workers > 0 && draft.days > 0 :
      (draft.quantitySource === 'boq' && !draft.outsideScope ? sourceQty : draft.quantity) > 0
    );
  function addExtra() {
    if (!canEdit || !allowDraft) return;
    const item = { ...draft, id: uid(), name: draft.name.trim() };
    change({ extras: [...config.extras, item] });
    setFormOpen(false);
    setDraft({ id: uid(), name: '', stage: draft.stage, work: 'excavation',
      includedWorks: [], method: extraMethod, unit: 'm³', quantity: 0, quantitySource: 'manual',
      rate: 0, workers: 1, days: 1, outsideScope: false });
  }
  function modifyExtra(index: number, values: Partial<LabourExtra>) {
    change({ extras: config.extras.map((item, i) => i === index ? { ...item, ...values } : item) });
  }
  const packageMethods: { id: LabourMethod; label: string; description: string }[] = [
    { id: 'composite', label: 'Composite / Custom Package', description: 'One agreed rate for selected civil works' },
    { id: 'itemwise', label: 'Item-wise Labour', description: 'Each measured trade × its labour rate' },
    { id: 'daily', label: 'Daily Labour (Estimate)', description: 'Estimated workers × days × daily rate' },
  ];
  const labourTotal = result.total + existingLabourCost;
  return (
    <section className="boq-labour" aria-label="BOQ labour costing">
      <div className="boq-labour-metrics">
        <div><small>Material Cost</small><strong>{canViewCost ? money(materialCost) : 'Restricted'}</strong></div>
        <div><small>Labour Cost</small><strong>{canViewCost ? money(labourTotal) : 'Restricted'}</strong></div>
        <div className="primary"><small>Total BOQ Estimate</small><strong>{canViewCost ? money(materialCost + labourTotal) : 'Restricted'}</strong></div>
      </div>
      <div className="boq-labour-grid">
        <section className="boq-labour-box boq-labour-default">
          <h3>◎ Default Labour Method (Project Wide)</h3>
          <div className="boq-labour-content">
            <div className="boq-labour-mode">
              <span className="boq-labour-radio-on" aria-hidden="true">◉</span>
              <div><strong>{packageMethods.find((m) => m.id === config.method)?.label}</strong>
                <small>Applies once to the whole BOQ; only excluded works get separate labour.</small></div>
              <span className="boq-labour-selected">Selected</span>
            </div>
            {config.method === 'composite' && (
              <>
                <div className="boq-labour-fields">
                  <label>Package Name
                    <input disabled={!canEdit} value={config.packageName} maxLength={100}
                      onChange={(e) => change({ packageName: e.target.value })} />
                  </label>
                  <label>Rate (₹/sft)
                    <input disabled={!canEdit} type="number" min="0" step="any"
                      value={config.rate} onChange={(e) => change({ rate: clean(Number(e.target.value)) })} />
                  </label>
                  <label>Applicable Area
                    <select disabled={!canEdit}
                      value={config.areaOverrideSqft === null ? 'quote' : 'custom'}
                      onChange={(e) => change({ areaOverrideSqft: e.target.value === 'quote' ? null : builtUp })}>
                      <option value="quote">Built-up area from BOQ</option>
                      <option value="custom">Agreed contract area</option>
                    </select>
                  </label>
                  <label>Area (sft)
                    <input type="number" min="0" step="any"
                      disabled={!canEdit || config.areaOverrideSqft === null}
                      value={config.areaOverrideSqft ?? builtUp}
                      onChange={(e) => change({ areaOverrideSqft: clean(Number(e.target.value)) })} />
                  </label>
                  <div className="boq-labour-package-total"><small>Labour Cost (Package)</small>
                    <strong>{canViewCost ? money(result.base) : 'Restricted'}</strong></div>
                </div>
                <div className="boq-labour-covered-head">
                  <strong>Included Works <small>(covered in ₹{number(config.rate)}/sft)</small></strong>
                  <button type="button" className="boq-labour-outline"
                    onClick={() => setCoverageOpen((open) => !open)}
                    aria-expanded={coverageOpen}>{coverageOpen ? 'Close Coverage' : '✎ Edit Coverage'}</button>
                </div>
                <div className="boq-labour-tags">
                  {config.coveredWorks.map((id) => <span key={id}>✓ {labourWorkName(id)}</span>)}
                  {!config.coveredWorks.length && <em>No works included. Select at least one.</em>}
                </div>
                {coverageOpen && <div className="boq-labour-coverage-editor">
                  {LABOUR_WORKS.filter((w) => w.id !== 'other').map((work) => (
                    <label key={work.id}>
                      <input disabled={!canEdit} type="checkbox"
                        checked={config.coveredWorks.includes(work.id)}
                        onChange={(e) => change({ coveredWorks: e.target.checked ?
                          [...config.coveredWorks, work.id] :
                          config.coveredWorks.filter((id) => id !== work.id) })} />
                      {work.name}
                    </label>
                  ))}
                  <button type="button" className="boq-labour-text"
                    disabled={!canEdit} onClick={() => change({ coveredWorks: [...COVERED_BY_DEFAULT] })}>
                    Reset to full civil scope
                  </button>
                </div>}
              </>
            )}
            {config.method === 'itemwise' && <div className="boq-labour-item-rates">
              <p>Measured quantities come from each saved BOQ work item. Enter an agreed labour rate for each trade; unpriced work is flagged below.</p>
              {LABOUR_WORKS.filter((w) => w.id !== 'other' &&
                measures.some((m) => m.work === w.id)).map((w) => {
                const items = measures.filter((m) => m.work === w.id);
                const quantity = items.reduce((sum, m) => sum + m.quantity, 0);
                const units = [...new Set(items.map((m) => m.unit))];
                return <div className="boq-labour-trade" key={w.id}>
                  <span><strong>{w.name}</strong><small>{number(quantity)} {units.join(', ')}</small></span>
                  <label>₹ per {units.length === 1 ? units[0] : 'measured unit'}
                    <input type="number" min="0" step="any" disabled={!canEdit}
                      value={config.itemRates[w.id] ?? 0}
                      onChange={(e) => change({ itemRates: {
                        ...config.itemRates, [w.id]: clean(Number(e.target.value)),
                      } })} />
                  </label>
                </div>;
              })}
              {missingRates && <p role="status" className="boq-labour-alert">Some measured work has a zero labour rate. Complete all relevant rates before relying on this estimate.</p>}
            </div>}
            {config.method === 'daily' && <div className="boq-labour-day-rates">
              <p>Daily rates are an estimation method, not attendance or payroll.</p>
              {config.dailyRates.map((worker, index) => <div className="boq-labour-worker" key={worker.id}>
                <label>Trade
                  <input disabled={!canEdit} value={worker.name} onChange={(e) =>
                    change({ dailyRates: config.dailyRates.map((r, i) => i === index ? { ...r, name: e.target.value } : r) })} />
                </label>
                {(['workers', 'days', 'rate'] as const).map((field) => <label key={field}>{field === 'rate' ? '₹ / day' : field}
                  <input type="number" min="0" step="any" disabled={!canEdit} value={worker[field]}
                    onChange={(e) => change({ dailyRates: config.dailyRates.map((r, i) =>
                      i === index ? { ...r, [field]: clean(Number(e.target.value)) } : r) })} />
                </label>)}
                <button type="button" disabled={!canEdit} aria-label={'Remove ' + worker.name}
                  onClick={() => change({ dailyRates: config.dailyRates.filter((_, i) => i !== index) })}>×</button>
              </div>)}
              <button type="button" disabled={!canEdit} className="boq-labour-outline" onClick={() =>
                change({ dailyRates: [...config.dailyRates, { id: uid(), name: 'Labour',
                  workers: 1, days: 1, rate: 0 }] })}>＋ Add worker type</button>
            </div>}
          </div>
        </section>
        <section className="boq-labour-box boq-labour-methods">
          <h3>Labour Method for BOQ</h3>
          {packageMethods.map((m) => <button key={m.id} type="button"
            disabled={!canEdit} aria-pressed={config.method === m.id}
            className={config.method === m.id ? 'boq-labour-method active' : 'boq-labour-method'}
            onClick={() => change({ method: m.id })}>
            <span>{config.method === m.id ? '◉' : '○'}</span>
            <span><strong>{m.label}</strong><small>{m.description}</small></span>
          </button>)}
          <p className="boq-labour-note">Switching methods never deletes previously entered rates or labour items.</p>
        </section>
        <section className="boq-labour-box boq-labour-coverage">
          <div className="boq-labour-heading"><strong>▤ Stage-wise Labour Coverage</strong>
            <small>BOQ measurements are retained even when included in the default rate.</small></div>
          <div className="boq-labour-table-scroll"><table>
            <thead><tr><th>Stage / Work</th><th>Measured BOQ Qty</th><th>Labour Method</th><th>Cost</th></tr></thead>
            <tbody>{measures.map((m, index) => {
              const included = config.method === 'composite' && config.coveredWorks.includes(m.work);
              const amount = config.method === 'itemwise' ?
                m.quantity * (config.itemRates[m.work] ?? 0) : 0;
              return <tr key={[m.stage,m.work,m.unit,index].join('-')}>
                <td><strong>{labourWorkName(m.work)}</strong><small>{m.stage}</small></td>
                <td>{number(m.quantity)} {m.unit}</td>
                <td>{included ? <span className="boq-labour-included">✓ Included in Package</span> :
                  config.method === 'itemwise' ? 'Item-wise' :
                  config.method === 'daily' ? 'Daily crew estimate' : <span className="boq-labour-uncovered">Not in package</span>}</td>
                <td>{included || config.method === 'daily' ? 'Included' :
                  config.method === 'itemwise' ? money(amount) : 'Add separately'}</td>
              </tr>;
            })}
            {!measures.length && <tr><td colSpan={4}>Enter dimensions in BOQ Builder to populate measured labour quantities.</td></tr>}
            </tbody>
          </table></div>
          <p className="boq-labour-note">Package cost is charged once using the agreed area; stage rows are not individually added again.</p>
        </section>
        <section className="boq-labour-box boq-labour-extras">
          <div className="boq-labour-heading"><strong>⊕ Add Separate Labour</strong>
            <small>Only for work excluded from the default method or clearly additional to its agreed scope.</small></div>
          {config.extras.map((item, index) => {
            const qty = labourExtraQuantity(item, measures);
            const amount = item.method === 'daily' ?
              item.workers * item.days * item.rate : qty * item.rate;
            const valid = isExtraAllowed(config, item);
            return <div className="boq-labour-extra-row" key={item.id}>
              <div><strong>{item.name}</strong><small>{item.stage} · {extraCoveredWorks(item).map(labourWorkName).join(' + ')} · {item.outsideScope ? 'Extra beyond package' : 'Excluded work'}</small>
                <small>{item.method === 'daily' ? number(item.workers) + ' workers × ' + number(item.days) + ' days' :
                  number(qty) + ' ' + item.unit} × {money(item.rate)}</small></div>
              <strong>{valid ? money(amount) : 'Overlap'}</strong>
              <button type="button" disabled={!canEdit} aria-label={'Remove ' + item.name}
                onClick={() => change({ extras: config.extras.filter((_, i) => i !== index) })}>×</button>
              {!valid && <small className="boq-labour-alert">This work is covered by the composite package. Mark as additional scope or remove.</small>}
            </div>;
          })}
          {!config.extras.length && <p className="boq-labour-note">No separately priced labour items yet.</p>}
          {formOpen && <div className="boq-labour-new-extra">
            <div className="boq-labour-segment">
              <button type="button" className={extraMethod === 'itemwise' ? 'active' : ''}
                onClick={() => { setExtraMethod('itemwise'); setDraftValues({ method: 'itemwise' }); }}>Item-wise</button>
              <button type="button" className={extraMethod === 'daily' ? 'active' : ''}
                onClick={() => { setExtraMethod('daily'); setDraftValues({ method: 'daily' }); }}>Daily Labour (Estimate)</button>
            </div>
            <div className="boq-labour-extra-fields">
              <label>Work description
                <input value={draft.name} onChange={(e) => setDraftValues({ name: e.target.value })}
                  placeholder="e.g. Decorative elevation extension" maxLength={120}/></label>
              <label>BOQ Stage
                <select value={draft.stage} onChange={(e) => setDraftValues({ stage: e.target.value })}>
                  {stageNames.map((s) => <option key={s}>{s}</option>)}
                </select></label>
              <label>Work category
                <select value={draft.work} onChange={(e) => setDraftValues({
                  work: e.target.value as LabourWorkId, includedWorks: [], quantitySource: 'manual', outsideScope: false,
                })}>
                  {workOptions.map((w) => <option value={w.value} key={w.value}>{w.label}</option>)}
                </select></label>
              <div className="boq-labour-combined">
                <strong>Works covered by this one rate</strong>
                <small>Select additional trades such as bar bending + shuttering, or brickwork + plastering + elevation. The rate is applied only once to the chosen quantity.</small>
                <div>{LABOUR_WORKS.filter((w) => w.id !== 'other').map((work) =>
                  <label key={work.id}>
                    <input type="checkbox" checked={work.id === draft.work ||
                      (draft.includedWorks ?? []).includes(work.id)}
                      disabled={work.id === draft.work}
                      onChange={(e) => setDraftValues({ includedWorks: e.target.checked
                        ? [...(draft.includedWorks ?? []), work.id]
                        : (draft.includedWorks ?? []).filter((id) => id !== work.id) })}/>
                    {work.name}
                  </label>)}</div>
              </div>
              {draft.method === 'itemwise' ? <>
                <label>Quantity basis
                  <select value={draft.quantitySource} onChange={(e) =>
                    setDraftValues({ quantitySource: e.target.value as 'manual' | 'boq' })}>
                    <option value="manual">Enter extra quantity</option>
                    <option value="boq" disabled={draft.outsideScope}>Use measured BOQ quantity</option>
                  </select></label>
                <label>Unit
                  <select value={draft.unit} onChange={(e) => setDraftValues({ unit: e.target.value })}>
                    {['sft','cft','m³','kg','rft','each','day'].map((u) => <option key={u}>{u}</option>)}
                  </select></label>
                <label>Quantity
                  <input type="number" min="0" step="any"
                    disabled={draft.quantitySource === 'boq' && !draft.outsideScope}
                    value={draft.quantitySource === 'boq' && !draft.outsideScope ? sourceQty : draft.quantity}
                    onChange={(e) => setDraftValues({ quantity: clean(Number(e.target.value)) })}/></label>
              </> : <>
                <label>Workers
                  <input type="number" min="0" step="1" value={draft.workers}
                    onChange={(e) => setDraftValues({ workers: clean(Number(e.target.value)) })}/></label>
                <label>Estimated days
                  <input type="number" min="0" step="any" value={draft.days}
                    onChange={(e) => setDraftValues({ days: clean(Number(e.target.value)) })}/></label>
              </>}
              <label>Rate (₹/{draft.method === 'daily' ? 'worker-day' : draft.unit})
                <input type="number" min="0" step="any" value={draft.rate}
                  onChange={(e) => setDraftValues({ rate: clean(Number(e.target.value)) })}/></label>
              <label className="boq-labour-check"><input type="checkbox" checked={draft.outsideScope}
                onChange={(e) => setDraftValues({ outsideScope: e.target.checked,
                  ...(e.target.checked ? { quantitySource: 'manual' as const } : {}) })}/>
                Extra quantity outside the agreed package scope</label>
            </div>
            {overlapsExisting && <p role="alert" className="boq-labour-alert">
              This measured labour work is already included in another separate package for this stage.</p>}
            {!isExtraAllowed(config, draft) && <p role="alert" className="boq-labour-alert">
              This work is covered by the default package. Select a work not covered, or confirm extra scope and enter only its additional quantity.</p>}
            {draft.quantitySource === 'boq' && sourceQty === 0 && <p className="boq-labour-alert">
              No matching measured quantity in this stage/unit. Enter an extra quantity manually or complete the drawing first.</p>}
            <div className="boq-labour-form-buttons">
              <button type="button" className="boq-labour-outline" onClick={() => setFormOpen(false)}>Cancel</button>
              <button type="button" className="boq-labour-primary" disabled={!canEdit || !allowDraft}
                onClick={addExtra}>Add labour item</button>
            </div>
          </div>}
          {!formOpen && <button type="button" disabled={!canEdit} className="boq-labour-outline"
            onClick={() => setFormOpen(true)}>＋ Add Excluded Labour</button>}
          <div className="boq-labour-extras-total">
            <small>Separate Labour Total</small>
            <strong>{canViewCost ? money(result.extras) : 'Restricted'}</strong>
          </div>
        </section>
      </div>
      <div className="boq-labour-footer">
        <div><small>Default method</small><strong>{canViewCost ? money(result.base) : 'Restricted'}</strong></div>
        <span>＋</span>
        <div><small>Separate labour</small><strong>{canViewCost ? money(result.extras + existingLabourCost) : 'Restricted'}</strong></div>
        <span>＝</span>
        <div className="total"><small>Total Labour Cost</small><strong>{canViewCost ? money(labourTotal) : 'Restricted'}</strong></div>
        {canEdit && <button type="button" className="boq-labour-primary" disabled={busy || result.invalidExtras.length > 0 ||
            (config.method === 'composite' && !config.coveredWorks.length)} onClick={onSave}>
          {busy ? 'Saving…' : '▣ Save BOQ'}
        </button>}
      </div>
      {result.invalidExtras.length > 0 && <p role="alert" className="boq-labour-alert">
        Resolve overlapping labour entries before saving this estimate.</p>}
    </section>
  );
}
