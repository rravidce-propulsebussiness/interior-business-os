'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { saveBoqRates } from './boq-actions';
import {
  GROUP_SECTIONS,
  MATERIAL_GROUPS,
  startingVariants,
  variantKey,
  type Rate,
} from './boq-pricing';
import {
  normalizeStructuralSettings,
  STRUCTURAL_FIELDS,
  type StructuralSettings,
} from '@business-os/core/construction-boq';

const groupNames = [...new Set(STRUCTURAL_FIELDS.map((field) => field.group))];
const defaults: Rate[] = [
  // Cement, sand, aggregate, bricks and steel are priced from the
  // purchase-unit groups above (bag, tonne, number, rod).
  ['rcc concrete volume', 'RCC concrete volume', 'm³', 'material'],
  ['excavation volume', 'Excavation volume', 'm³', 'labour'],
  ['loose soil for disposal', 'Loose soil for disposal', 'm³', 'other'],
  ['4 inch brick wall', '4 inch brick wall', 'sqft', 'labour'],
  ['9 inch brick wall', '9 inch brick wall', 'sqft', 'labour'],
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
  savedStructural,
  savedLengthUnit,
  canEdit,
}: {
  saved: Rate[];
  savedStructural: unknown;
  savedLengthUnit: 'm' | 'ft';
  canEdit: boolean;
}) {
  const [lengthUnit, setLengthUnit] = useState<'m' | 'ft'>(savedLengthUnit);
  const [rates, setRates] = useState<Rate[]>(() => {
    const plain = saved.filter((rate) => !rate.material);
    const byKey = new Map(plain.map((rate) => [rate.key, rate]));
    return [
      ...defaults.map((rate) => byKey.get(rate.key) || rate),
      ...plain.filter(
        (rate) => !defaults.some((item) => item.key === rate.key),
      ),
    ];
  });
  const [variants, setVariants] = useState<Rate[]>(() =>
    startingVariants(saved),
  );
  const [structural, setStructural] = useState<StructuralSettings>(() =>
    normalizeStructuralSettings(savedStructural),
  );
  function changeVariant(key: string, update: Partial<Rate>) {
    setVariants((prior) =>
      prior.map((row) => (row.key === key ? { ...row, ...update } : row)),
    );
  }
  function makeDefault(material: string, key: string) {
    setVariants((prior) =>
      prior.map((row) =>
        row.material === material
          ? { ...row, isDefault: row.key === key }
          : row,
      ),
    );
  }
  function addVariant(material: string) {
    const group = MATERIAL_GROUPS.find((item) => item.key === material);
    if (!group) return;
    setVariants((prior) => [
      ...prior,
      {
        key: `new-${material}-${Date.now()}`,
        label: '',
        unit: group.unit,
        rate: 0,
        category: group.category,
        material,
        variant: '',
        isDefault: !prior.some((row) => row.material === material),
      },
    ]);
  }
  function removeVariant(key: string) {
    setVariants((prior) => {
      const removed = prior.find((row) => row.key === key);
      const rest = prior.filter((row) => row.key !== key);
      if (!removed?.isDefault) return rest;
      const next = rest.find((row) => row.material === removed.material);
      return rest.map((row) =>
        row === next ? { ...row, isDefault: true } : row,
      );
    });
  }
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
    const seen = new Set<string>();
    const materialRates = variants
      .filter((row) => (row.variant ?? '').trim() && row.material)
      .map((row) => {
        const variant = (row.variant ?? '').trim();
        return {
          ...row,
          key: variantKey(row.material!, variant),
          label: variant,
          variant,
          rate: Number(row.rate) || 0,
        };
      })
      .filter((row) => !seen.has(row.key) && Boolean(seen.add(row.key)));
    for (const group of MATERIAL_GROUPS) {
      const rows = materialRates.filter((row) => row.material === group.key);
      if (rows.length && !rows.some((row) => row.isDefault))
        rows[0]!.isDefault = true;
    }
    startTransition(async () => {
      const result = await saveBoqRates({
        items: [...normalized, ...materialRates],
        structural,
        preferences: { lengthUnit },
      });
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
            <h2>Measurement units</h2>
            <span>
              Default units for typing takeoff dimensions. Each person can
              switch on the BOQ page; quantities and rates are unchanged.
            </span>
          </div>
          <div
            className="boq-unit-toggle"
            role="group"
            aria-label="Default measurement units"
          >
            {(
              [
                ['m', 'Metres · mm'],
                ['ft', 'Feet · inches'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={lengthUnit === value}
                className={lengthUnit === value ? 'active' : ''}
                onClick={() => setLengthUnit(value)}
                disabled={!canEdit}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="boq-rate-panel">
        <div className="boq-panel-heading">
          <div>
            <h2>Material prices by brand &amp; source</h2>
            <span>
              Add each brand or source you buy from. Every BOQ picks one (e.g.
              bricks from Local or Karimnagar); the ★ default is used otherwise.
            </span>
          </div>
        </div>
        {GROUP_SECTIONS.map((section) => (
          <div key={section}>
            <h3 className="boq-variant-section">{section}</h3>
            <div className="boq-variant-groups">
              {MATERIAL_GROUPS.filter((group) => group.section === section).map(
                (group) => (
                  <div className="boq-variant-group" key={group.key}>
                    <div className="boq-variant-head">
                      <strong>{group.label}</strong>
                      <small>
                        ₹ per {group.unit} ·{' '}
                        {group.category === 'labour' ? 'Labour' : 'Material'}
                      </small>
                    </div>
                    {group.note && (
                      <p className="boq-variant-note">{group.note}</p>
                    )}
                    {variants
                      .filter((row) => row.material === group.key)
                      .map((row) => (
                        <div className="boq-variant-row" key={row.key}>
                          <button
                            type="button"
                            className={`boq-variant-default ${row.isDefault ? 'active' : ''}`}
                            aria-pressed={Boolean(row.isDefault)}
                            aria-label={`Use ${row.variant || 'this'} as default ${group.label}`}
                            title="Default for new BOQs"
                            onClick={() => makeDefault(group.key, row.key)}
                            disabled={!canEdit}
                          >
                            ★
                          </button>
                          <input
                            aria-label={`${group.label} brand or source`}
                            value={row.variant ?? ''}
                            placeholder="Brand / source"
                            onChange={(event) =>
                              changeVariant(row.key, {
                                variant: event.target.value,
                              })
                            }
                            disabled={!canEdit}
                          />
                          <label className="boq-rate-input">
                            <span>₹</span>
                            <input
                              aria-label={`${row.variant || group.label} rate per ${group.unit}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.rate}
                              onChange={(event) =>
                                changeVariant(row.key, {
                                  rate: Number(event.target.value),
                                })
                              }
                              disabled={!canEdit}
                            />
                          </label>
                          {canEdit && (
                            <button
                              type="button"
                              className="boq-variant-remove"
                              aria-label={`Remove ${row.variant || 'variant'}`}
                              onClick={() => removeVariant(row.key)}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    {canEdit && (
                      <button
                        type="button"
                        className="boq-variant-add"
                        onClick={() => addVariant(group.key)}
                      >
                        ＋ Add brand / source
                      </button>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="boq-rate-panel">
        <div className="boq-panel-heading">
          <div>
            <h2>Structural rules for quotation BOQs</h2>
            <span>
              Used when a BOQ is generated from a quotation. Steel is cut from
              stock bars lift by lift; laps are added at every floor.
            </span>
          </div>
        </div>
        <div className="boq-settings-groups">
          {groupNames.map((group) => (
            <fieldset className="boq-settings-group" key={group}>
              <legend>{group}</legend>
              {STRUCTURAL_FIELDS.filter((field) => field.group === group).map(
                (field) => (
                  <label
                    key={field.key}
                    title={'help' in field ? field.help : undefined}
                  >
                    {field.label}
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={'step' in field ? field.step : 'any'}
                      value={structural[field.key]}
                      onChange={(event) =>
                        setStructural((prior) => ({
                          ...prior,
                          [field.key]: Number(event.target.value),
                        }))
                      }
                      disabled={!canEdit}
                    />
                    {'help' in field && <small>{field.help}</small>}
                  </label>
                ),
              )}
            </fieldset>
          ))}
        </div>
      </section>
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
