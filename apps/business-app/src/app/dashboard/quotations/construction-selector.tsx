'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ConstructionRate } from '@business-os/database/construction-rates';
import {
  previewConstructionPackage,
  saveConstructionPackage,
} from './construction-actions';

const money = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    value,
  );

export function ConstructionSelector({
  rates,
  revisionId,
  version,
}: {
  rates: ConstructionRate[];
  revisionId: string;
  version: number;
}) {
  const router = useRouter(),
    [pending, start] = useTransition();
  const [area, setArea] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState<{
    ratePerSqft: string;
    total: string;
  } | null>(null);
  const groups = [
    ...new Set(
      rates.filter((r) => r.status === 'active').map((r) => r.category),
    ),
  ].sort();
  const selectedRows = rates.filter(
    (r) => r.id === selected[r.category] && r.status === 'active',
  );
  const indicativeRate = selectedRows.reduce(
    (sum, r) => sum + Number(r.ratePerSqft),
    0,
  );
  const payload = { ids: selectedRows.map((r) => r.id), areaSqft: area.trim() };
  function run(save: boolean) {
    setMessage('');
    setConfirmed(null);
    start(async () => {
      if (save) {
        const r = await saveConstructionPackage(revisionId, version, payload);
        setMessage(r.message);
        if (r.id) router.refresh();
      } else {
        const r = await previewConstructionPackage(revisionId, payload);
        setMessage(r.message);
        if (r.total && r.ratePerSqft)
          setConfirmed({ total: r.total, ratePerSqft: r.ratePerSqft });
      }
    });
  }
  return (
    <section className="my-6 overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-slate-950 to-blue-950 px-5 py-6 text-white sm:px-7">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-300">
          Construction quotation builder
        </p>
        <h2 className="mt-1 text-xl font-extrabold">
          Choose materials, brands &amp; specifications
        </h2>
        <p className="mt-2 text-xs leading-5 text-slate-300">
          One option per category. Pick the steel, bricks, cement grade,
          painting, mix ratio and other components that apply to this project.
          Current company rates are used when saved.
        </p>
      </div>
      <div className="space-y-5 p-5 sm:p-7">
        <label className="block max-w-xs text-xs font-bold text-slate-700">
          Built-up construction area (sq ft)
          <input
            type="number"
            min="0.01"
            step="0.01"
            max="1000000"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900"
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              setConfirmed(null);
            }}
            placeholder="e.g. 1200"
            required
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((category) => (
            <fieldset
              key={category}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <legend className="px-2 text-sm font-extrabold text-slate-900">
                {category}
              </legend>
              <label className="mt-1 flex cursor-pointer items-center gap-3 text-xs text-slate-600">
                <input
                  name={'rate-' + category}
                  type="radio"
                  checked={!selected[category]}
                  onChange={() => {
                    setSelected((v) => ({ ...v, [category]: '' }));
                    setConfirmed(null);
                  }}
                />{' '}
                Skip category
              </label>
              {rates
                .filter((r) => r.category === category && r.status === 'active')
                .map((rate) => (
                  <label
                    key={rate.id}
                    className={
                      'mt-2 flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs ' +
                      (selected[category] === rate.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white')
                    }
                  >
                    <input
                      name={'rate-' + category}
                      type="radio"
                      checked={selected[category] === rate.id}
                      onChange={() => {
                        setSelected((v) => ({ ...v, [category]: rate.id }));
                        setConfirmed(null);
                      }}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-slate-900">
                        {rate.name}
                      </strong>
                      <span className="mt-1 block text-slate-500">
                        {rate.specification || 'Standard specification'}
                      </span>
                      <span className="mt-2 block font-extrabold text-blue-700">
                        ₹{Number(rate.ratePerSqft).toLocaleString('en-IN')} /
                        built-up sq ft
                      </span>
                    </span>
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-blue-50 p-4">
          <div>
            <p className="text-xs font-bold text-slate-600">
              Indicative component rate
            </p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {money(indicativeRate)} / sq ft
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {selectedRows.length} categories · Indicative subtotal:{' '}
              {money(indicativeRate * Number(area || 0))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run(false)}
              disabled={
                pending ||
                selectedRows.length === 0 ||
                !area ||
                Number(area) <= 0
              }
              className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-bold text-blue-700 disabled:opacity-50"
            >
              Preview verified amount
            </button>
            <button
              type="button"
              onClick={() => run(true)}
              disabled={
                pending ||
                selectedRows.length === 0 ||
                !area ||
                Number(area) <= 0
              }
              className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-extrabold text-white disabled:opacity-50"
            >
              {pending ? 'Calculating…' : 'Add to quotation →'}
            </button>
          </div>
        </div>
        {confirmed && (
          <p className="text-sm font-bold text-emerald-700">
            Verified quote: {money(Number(confirmed.total))} at{' '}
            {money(Number(confirmed.ratePerSqft))}/sq ft
          </p>
        )}
        {message && (
          <p role="status" className="text-xs font-medium text-slate-700">
            {message}
          </p>
        )}
        {rates.length === 0 && (
          <p className="text-xs text-slate-600">
            No construction prices are configured yet. Add company rates in
            <a
              className="ml-1 text-blue-700 underline"
              href="/dashboard/pricing/construction"
            >
              Construction Pricing
            </a>
            .
          </p>
        )}
        <p className="text-[11px] leading-5 text-slate-500">
          Saving adds one itemized construction specification line to the draft
          at the server-validated combined rate. Rates are per built-up sq ft;
          physical procurement units, structure formulas, taxes and labour must
          be priced separately unless included explicitly. Existing issued
          revisions are never recalculated.
        </p>
      </div>
    </section>
  );
}
