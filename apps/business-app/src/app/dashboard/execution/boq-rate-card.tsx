'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { saveBoqRates } from './boq-actions';

type Rate = {
  key: string;
  label: string;
  unit: string;
  rate: number;
  category: 'material' | 'labour' | 'other';
};
const defaults: Rate[] = [
  ['rcc concrete volume', 'RCC concrete volume', 'm³', 'material'],
  ['cement (m20 nominal mix)', 'Cement (M20 nominal mix)', 'bag', 'material'],
  ['sand (m20 nominal mix)', 'Sand (M20 nominal mix)', 'm³', 'material'],
  [
    '20 mm aggregate (m20 nominal mix)',
    '20 mm aggregate (M20 nominal mix)',
    'm³',
    'material',
  ],
  ['excavation volume', 'Excavation volume', 'm³', 'labour'],
  ['loose soil for disposal', 'Loose soil for disposal', 'm³', 'other'],
  ['16 mm main bars', '16 mm main bars', 'rod', 'material'],
  ['12 mm main bars', '12 mm main bars', 'rod', 'material'],
  ['10 mm main bars', '10 mm main bars', 'rod', 'material'],
  ['footing bars', 'Footing bars', 'rod', 'material'],
  ['6 mm rings @ 150 mm', '6 mm rings', 'rod', 'material'],
  ['8 mm beam stirrups', '8 mm beam stirrups', 'rod', 'material'],
  ['4 inch brick wall', '4 inch brick wall', 'sqft', 'labour'],
  ['9 inch brick wall', '9 inch brick wall', 'sqft', 'labour'],
  ['bricks', 'Bricks', 'each', 'material'],
  ['mortar sand (allowance)', 'Mortar sand', 'm³', 'material'],
  ['cement (allowance)', 'Cement (allowance)', 'bag', 'material'],
  ['slab shuttering', 'Slab shuttering', 'sqft', 'labour'],
  ['internal plaster', 'Internal plaster', 'sqft', 'labour'],
  ['external plaster', 'External plaster', 'sqft', 'labour'],
  ['internal paint', 'Internal paint', 'sqft', 'labour'],
  ['external paint', 'External paint', 'sqft', 'labour'],
  ['floor tile', 'Floor tile', 'sqft', 'material'],
  ['wall tile', 'Wall tile', 'sqft', 'material'],
  ['primer (1 coat allowance)', 'Primer', 'litre', 'material'],
  ['paint (per coat allowance)', 'Paint', 'litre', 'material'],
  ['tile adhesive', 'Tile adhesive', 'kg', 'material'],
  ['tile grout', 'Tile grout', 'kg', 'material'],
  [
    'cement (plaster allowance)',
    'Cement (plaster allowance)',
    'bag',
    'material',
  ],
  ['plaster sand', 'Plaster sand', 'm³', 'material'],
  ['labour', 'General labour', 'day', 'labour'],
].map(([, label, unit, category]) => ({
  key: `${String(label ?? '').toLowerCase()}::${String(unit ?? 'each').toLowerCase()}`,
  label: String(label ?? ''),
  unit: String(unit ?? 'each'),
  category: category as Rate['category'],
  rate: 0,
}));
const currency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount || 0);

export function BoqRateCard({
  saved,
  canEdit,
}: {
  saved: Rate[];
  canEdit: boolean;
}) {
  const [rates, setRates] = useState<Rate[]>(() => {
    const byKey = new Map(saved.map((rate) => [rate.key, rate]));
    return [
      ...defaults.map((rate) => byKey.get(rate.key) || rate),
      ...saved.filter(
        (rate) => !defaults.some((item) => item.key === rate.key),
      ),
    ];
  });
  const [message, setMessage] = useState('');
  const [busy, startTransition] = useTransition();
  function change(index: number, update: Partial<Rate>) {
    setRates((prior) =>
      prior.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...update } : row,
      ),
    );
  }
  function add() {
    setRates((prior) => [
      ...prior,
      {
        key: `custom-${Date.now()}`,
        label: '',
        unit: 'each',
        category: 'material',
        rate: 0,
      },
    ]);
  }
  function save() {
    const normalized = rates
      .filter((row) => row.label.trim())
      .map((row) => ({
        ...row,
        key: `${row.label.trim().toLowerCase()}::${row.unit.trim().toLowerCase()}`,
        rate: Number(row.rate) || 0,
      }));
    startTransition(async () => {
      const result = await saveBoqRates({ items: normalized });
      setMessage(
        result.ok
          ? 'Company rates saved.'
          : result.message || 'Unable to save rates.',
      );
    });
  }
  return (
    <main className="erp-page manual-boq boq-pricing-page">
      <div className="erp-titlebar">
        <div>
          <p className="erp-eyebrow">Company defaults</p>
          <h1>BOQ rates</h1>
          <p>
            Set company material and labour rates once. BOQ cost summaries use
            the rates for each measured quantity.
          </p>
        </div>
        <div className="erp-header-actions">
          <Link className="erp-button" href="/dashboard/execution/boq">
            ← BOQ workspace
          </Link>
          {canEdit && (
            <button
              className="erp-button erp-button-primary"
              type="button"
              onClick={save}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save rates'}
            </button>
          )}
        </div>
      </div>
      <div className="boq-rate-intro">
        <span className="boq-rate-icon">₹</span>
        <div>
          <strong>Rates are company configurable</strong>
          <p>
            These are blank until you enter your actual purchase or labour cost.
            Imported quotation prices remain as a separate quoted value.
          </p>
        </div>
      </div>
      {message && (
        <p className="boq-notice" role="status">
          {message}
        </p>
      )}
      <section className="boq-rate-panel">
        <div className="boq-panel-heading">
          <div>
            <h2>Material &amp; labour price book</h2>
            <span>{rates.length} rate lines · INR</span>
          </div>
          {canEdit && (
            <button className="erp-button" type="button" onClick={add}>
              ＋ Add custom rate
            </button>
          )}
        </div>
        <div className="boq-rate-table">
          <div className="boq-rate-head">
            <span>Item / work</span>
            <span>Type</span>
            <span>Unit</span>
            <span>Rate</span>
            <span>Applied as</span>
          </div>
          {rates.map((row, index) => (
            <div className="boq-rate-row" key={row.key}>
              <label>
                <span className="sr-only">Rate label</span>
                <input
                  value={row.label}
                  onChange={(event) =>
                    change(index, { label: event.target.value })
                  }
                  disabled={!canEdit}
                  placeholder="Rate name"
                />
              </label>
              <select
                value={row.category}
                onChange={(event) =>
                  change(index, {
                    category: event.target.value as Rate['category'],
                  })
                }
                disabled={!canEdit}
              >
                <option value="material">Material</option>
                <option value="labour">Labour</option>
                <option value="other">Other</option>
              </select>
              <input
                aria-label={`${row.label} unit`}
                value={row.unit}
                onChange={(event) =>
                  change(index, { unit: event.target.value })
                }
                disabled={!canEdit}
              />
              <label className="boq-rate-input">
                <span>₹</span>
                <input
                  aria-label={`${row.label} rate`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.rate}
                  onChange={(event) =>
                    change(index, { rate: Number(event.target.value) })
                  }
                  disabled={!canEdit}
                />
              </label>
              <small>
                {currency(row.rate)} / {row.unit || 'unit'}
              </small>
            </div>
          ))}
        </div>
        {canEdit && (
          <button type="button" className="boq-add-rate-bottom" onClick={add}>
            ＋ Add a material or labour rate
          </button>
        )}
      </section>
      <div className="boq-rate-note">
        <strong>Quantity assumptions</strong>
        <span>
          Concrete mix, wall thickness, brick consumption, finish wastage, tile
          adhesive and rod length are shown with each takeoff. Review project
          drawings and supplier specifications before final procurement
          quantities.
        </span>
      </div>
      {canEdit && (
        <div className="boq-savebar">
          <span>
            {message ||
              'Updating these rates recalculates BOQ cost summaries from the saved quantities.'}
          </span>
          <button
            className="erp-button erp-button-primary"
            type="button"
            onClick={save}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save rate card'}
          </button>
        </div>
      )}
    </main>
  );
}
