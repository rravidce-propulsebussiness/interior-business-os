'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConstructionRate } from '@business-os/database/construction-rates';
import { saveConstructionRate } from './actions';

const categories = [
  'Steel',
  'Bricks',
  'Cement',
  'Cement mix ratio',
  'Painting',
  'Sand',
  'Aggregate',
  'Flooring',
  'Electrical',
  'Plumbing',
  'Waterproofing',
  'Labour',
  'Other',
];
const input =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

export function RateForm({
  rate,
  close,
  initialCategory,
}: {
  rate?: ConstructionRate;
  close?: () => void;
  initialCategory?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveConstructionRate, {
    message: '',
  });
  const [category, setCategory] = useState(
    rate?.category ?? initialCategory ?? 'Steel',
  );
  useEffect(() => {
    if (state.saved) {
      router.refresh();
      close?.();
    }
  }, [state.saved, router, close]);
  return (
    <form
      action={action}
      className="grid gap-4 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:grid-cols-2"
    >
      {rate && (
        <>
          <input type="hidden" name="id" value={rate.id} />
          <input type="hidden" name="version" value={rate.version} />
        </>
      )}
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Material category
        <input
          list="construction-rate-categories"
          className={input}
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          maxLength={50}
        />
        <datalist id="construction-rate-categories">
          {categories.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Brand / material choice
        <input
          className={input}
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={rate?.name ?? ''}
          placeholder="e.g. Tata Steel, Karimnagar Bricks"
        />
      </label>

      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Purchase unit
        <select
          className={input}
          name="priceUnit"
          defaultValue={rate?.priceUnit ?? 'sqft'}
        >
          {[
            ['sqft', 'Square foot'],
            ['kg', 'Kilogram (kg)'],
            ['tonne', 'Tonne'],
            ['bag', 'Bag'],
            ['brick', 'Brick'],
            ['piece', 'Piece'],
            ['cft', 'Cubic foot'],
            ['litre', 'Litre'],
            ['meter', 'Metre'],
            ['running_ft', 'Running foot'],
            ['bathroom', 'Bathroom'],
            ['door', 'Door'],
            ['point', 'Electrical point'],
            ['lumpsum', 'Lump sum'],
          ].map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Brand price per purchase unit (₹)
        <input
          className={input}
          name="unitPrice"
          required
          type="number"
          min="0"
          max="1000000"
          step=".01"
          defaultValue={rate?.unitPrice ?? rate?.ratePerSqft ?? ''}
          placeholder="e.g. 80 for ₹80/kg"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Quantity consumed per built-up SFT
        <input
          className={input}
          name="consumptionPerSqft"
          required
          type="number"
          min=".0001"
          max="1000"
          step=".0001"
          defaultValue={rate?.consumptionPerSqft ?? '1'}
          placeholder="e.g. 3 kilograms / SFT"
        />
        <small className="font-normal text-slate-500">
          Effective ₹/SFT = price per unit × quantity per SFT.
        </small>
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Status
        <select
          className={input}
          name="status"
          defaultValue={rate?.status ?? 'active'}
        >
          <option value="active">Available in quotations</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700 sm:col-span-2">
        Grade, cement mix ratio or material specification
        <textarea
          className={input}
          name="specification"
          rows={2}
          maxLength={250}
          defaultValue={rate?.specification ?? ''}
          placeholder="e.g. TMT Fe 500D, first-class clay bricks, plaster mix 1:4"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : rate ? 'Update rate' : 'Add material rate'}
        </button>
        {close && (
          <button
            type="button"
            onClick={close}
            className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600"
          >
            Cancel
          </button>
        )}
        {state.message && (
          <p
            role={state.saved ? 'status' : 'alert'}
            className="text-xs text-slate-600"
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

export function ConstructionRatesManager({
  rates,
  canManage,
}: {
  rates: ConstructionRate[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const active = rates.filter((x) => x.status === 'active');
  const unique = new Set(active.map((x) => x.category));
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.17em] text-blue-300">
          Construction pricing studio
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              Material &amp; brand rates
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Set brand prices by kilogram, bag, brick, piece or other unit. The
              required quantity per built-up SFT converts each choice to a
              comparable rate used by Custom Quote.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500"
            >
              {open ? 'Close editor' : '+ Add rate'}
            </button>
          )}
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Active rate choices', value: active.length },
          { label: 'Material categories', value: unique.size },
          { label: 'Archived choices', value: rates.length - active.length },
        ].map((stat) => (
          <article
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-semibold text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-950">
              {stat.value}
            </p>
          </article>
        ))}
      </div>
      {open && canManage && <RateForm close={() => setOpen(false)} />}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-xs leading-6 text-blue-900">
        <strong>How pricing works:</strong> Selected component rates are added
        together. For 1,000 sq ft and a selected steel rate of ₹200/sq ft plus
        brick rate of ₹100/sq ft, the component subtotal is ₹3,00,000, before
        other materials, labour, allowances, and taxes. These figures are
        examples, not verified market prices. Each company enters its actual
        quotation rates.
      </div>
      <section className="space-y-4">
        <h2 className="text-lg font-extrabold text-slate-950">Saved options</h2>
        {[...new Set(rates.map((x) => x.category))].sort().map((category) => (
          <div
            key={category}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <h3 className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm font-extrabold text-slate-800">
              {category}
            </h3>
            <div className="divide-y divide-slate-100">
              {rates
                .filter((x) => x.category === category)
                .map((rate) => (
                  <div key={rate.id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-extrabold text-slate-950">
                          {rate.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {rate.specification || 'No specification'} ·{' '}
                          {rate.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-base font-black text-orange-700">
                            ₹
                            {Number(
                              rate.unitPrice ?? rate.ratePerSqft,
                            ).toLocaleString('en-IN')}
                            /{rate.priceUnit ?? 'sqft'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {rate.consumptionPerSqft ?? '1'} / SFT = ₹
                            {Number(rate.ratePerSqft).toLocaleString('en-IN')}
                            /SFT
                          </p>
                        </div>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditing((v) =>
                                v === rate.id ? null : rate.id,
                              )
                            }
                            className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700"
                          >
                            {editing === rate.id ? 'Close' : 'Edit'}
                          </button>
                        )}
                      </div>
                    </div>
                    {editing === rate.id && canManage && (
                      <div className="mt-4">
                        <RateForm
                          key={rate.version}
                          rate={rate}
                          close={() => setEditing(null)}
                        />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
        {rates.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No company material rates yet. Add your actual steel, brick, cement,
            painting, or other rates to begin.
          </p>
        )}
      </section>
    </div>
  );
}
