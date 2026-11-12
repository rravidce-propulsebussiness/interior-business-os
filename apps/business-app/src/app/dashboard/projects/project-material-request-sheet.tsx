'use client';
import { useState, useTransition } from 'react';
import { requestWorkItemMaterials } from './[id]/site/work-item-actions';
import type { BoqItem } from './project-v2-data';

const UNITS = [
  'bags',
  'kg',
  'tonnes',
  'litres',
  'nos',
  'sqft',
  'sqm',
  'cft',
  'cum',
  'yards',
  'metres',
  'feet',
] as const;
const COMMON = [
  'Cement (OPC 53)',
  'River sand',
  'M-sand',
  '20 mm aggregate',
  '12 mm aggregate',
  'TMT steel',
  'Bricks',
  'Binding wire',
  'Cover blocks',
  'Shuttering plywood',
];
type Line = {
  source: 'boq' | 'manual';
  boq_item_id: string;
  item: string;
  quantity: string;
  unit: string;
  required_date: string;
};
const guessUnit = (label: string) =>
  UNITS.find((u) => label.toLowerCase().startsWith(u.slice(0, 3))) ?? 'nos';

/** One Request Material action: pick BOQ lines where available, or type a
 * material. Requests go to approval/procurement; nothing is ordered here. */
export function MaterialRequestSheet({
  projectId,
  stageId,
  index,
  workTitle,
  boq,
  tomorrow,
  onDone,
}: {
  projectId: string;
  stageId: string;
  index: number;
  workTitle: string;
  boq: BoqItem[];
  tomorrow: string;
  onDone: () => void;
}) {
  const fresh = (): Line => ({
    source: boq.length ? 'boq' : 'manual',
    boq_item_id: '',
    item: '',
    quantity: '',
    unit: 'bags',
    required_date: tomorrow,
  });
  const [lines, setLines] = useState<Line[]>([fresh()]);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const update = (i: number, patch: Partial<Line>) =>
    setLines((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const form = new FormData();
    form.set(
      'items',
      JSON.stringify(
        lines.map((l) =>
          l.source === 'boq'
            ? {
                boq_item_id: l.boq_item_id || undefined,
                quantity: l.quantity,
                unit: l.unit,
                required_date: l.required_date,
              }
            : {
                item: l.item,
                quantity: l.quantity,
                unit: l.unit,
                required_date: l.required_date,
              },
        ),
      ),
    );
    setMessage(null);
    start(async () => {
      const result = await requestWorkItemMaterials(
        { projectId, stageId, index },
        form,
      );
      setMessage({ ok: result.saved, text: result.message });
      if (result.saved) {
        setLines([fresh()]);
        onDone();
      }
    });
  };
  return (
    <form className="pf-material" onSubmit={submit}>
      <h4>
        Request material <small>for {workTitle}</small>
      </h4>
      {lines.map((line, i) => (
        <fieldset key={i} className="pf-material-line">
          <legend className="pf-sr">Material {i + 1}</legend>
          {boq.length > 0 && (
            <div className="pf-seg" role="radiogroup" aria-label="Source">
              <button
                type="button"
                role="radio"
                aria-checked={line.source === 'boq'}
                onClick={() => update(i, { source: 'boq' })}
              >
                From BOQ
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={line.source === 'manual'}
                onClick={() => update(i, { source: 'manual' })}
              >
                Other
              </button>
            </div>
          )}
          {line.source === 'boq' ? (
            <select
              required
              value={line.boq_item_id}
              aria-label="BOQ item"
              onChange={(e) => {
                const b = boq.find((x) => x.id === e.target.value);
                update(i, {
                  boq_item_id: e.target.value,
                  unit: b ? guessUnit(b.unit) : line.unit,
                });
              }}
            >
              <option value="">Choose BOQ item…</option>
              {boq.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.quantity ? ' · ' + b.quantity + ' ' + b.unit : ''}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                required
                list={'pf-common-' + stageId}
                value={line.item}
                onChange={(e) => update(i, { item: e.target.value })}
                placeholder="Cement, sand, steel, bricks…"
                maxLength={200}
                aria-label="Material"
              />
              <datalist id={'pf-common-' + stageId}>
                {COMMON.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
          <div className="pf-row">
            <input
              required
              inputMode="decimal"
              value={line.quantity}
              onChange={(e) => update(i, { quantity: e.target.value })}
              placeholder="Qty"
              aria-label="Quantity"
            />
            <select
              value={line.unit}
              onChange={(e) => update(i, { unit: e.target.value })}
              aria-label="Unit"
            >
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <input
              required
              type="date"
              value={line.required_date}
              onChange={(e) => update(i, { required_date: e.target.value })}
              aria-label="Required on"
            />
          </div>
          {lines.length > 1 && (
            <button
              type="button"
              className="pf-link"
              onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          )}
        </fieldset>
      ))}
      <div className="pf-row">
        {lines.length < 12 && (
          <button
            type="button"
            className="pf-btn"
            onClick={() => setLines((rows) => [...rows, fresh()])}
          >
            ＋ Another item
          </button>
        )}
        <button className="pf-btn pf-btn-primary" disabled={pending}>
          {pending ? 'Sending…' : 'Send request'}
        </button>
      </div>
      <p className="pf-help">
        Goes to the owner/procurement for approval. No purchase order, stock or
        payment is created.
      </p>
      {message && (
        <p role="status" className={'pf-msg ' + (message.ok ? 'ok' : 'bad')}>
          {message.text}
        </p>
      )}
    </form>
  );
}
