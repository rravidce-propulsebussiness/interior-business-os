'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { QuotationPackage } from '@business-os/database/quotation-packages';
import { saveQuotationPackage } from './package-actions';

type Industry = { key: string; name: string };
const field =
  'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

const priceUnits: Record<QuotationPackage['pricingBasis'], string> = {
  fixed: 'fixed package',
  per_sqft: 'per sq ft',
  per_bhk: 'per BHK',
  per_unit: 'per item',
};

function Editor({
  item,
  industries,
  currency,
  onClose,
}: {
  item?: QuotationPackage;
  industries: Industry[];
  currency: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveQuotationPackage, {
    message: '',
  });
  const router = useRouter();
  const handled = useRef(false);
  useEffect(() => {
    if (state.saved && !handled.current) {
      handled.current = true;
      router.refresh();
      onClose();
    }
  }, [state.saved, router, onClose]);
  return (
    <form
      action={action}
      className="mt-5 grid gap-4 rounded-2xl border border-blue-200 bg-white p-5 sm:grid-cols-2"
    >
      {item && (
        <>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="version" value={item.version} />
        </>
      )}
      <label className="grid gap-2 text-xs font-bold text-slate-700">
        Industry
        <select
          name="industryKey"
          defaultValue={
            item?.industryKey ??
            (industries.find((i) => i.key === 'interior')?.key ||
              industries[0]?.key)
          }
          className={field}
        >
          {industries.map((industry) => (
            <option key={industry.key} value={industry.key}>
              {industry.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-xs font-bold text-slate-700">
        Package name
        <input
          name="name"
          className={field}
          required
          minLength={2}
          maxLength={120}
          defaultValue={item?.name ?? ''}
          placeholder="e.g. Premium 3BHK Interiors"
        />
      </label>
      <label className="grid gap-2 text-xs font-bold text-slate-700">
        Package code
        <input
          name="code"
          className={field}
          required
          pattern="[A-Za-z][A-Za-z0-9-]{1,19}"
          defaultValue={item?.code ?? ''}
          placeholder="PREMIUM"
        />
      </label>
      <label className="grid gap-2 text-xs font-bold text-slate-700">
        Pricing basis
        <select
          name="pricingBasis"
          className={field}
          defaultValue={item?.pricingBasis ?? 'fixed'}
        >
          <option value="fixed">Fixed total</option>
          <option value="per_sqft">Per sq ft</option>
          <option value="per_bhk">Per BHK</option>
          <option value="per_unit">Per item / unit</option>
        </select>
      </label>
      <label className="grid gap-2 text-xs font-bold text-slate-700">
        Base selling rate
        <input
          name="basePrice"
          className={field}
          type="number"
          min="0.01"
          max="999999999.99"
          step=".01"
          required
          defaultValue={item?.basePrice ?? ''}
          placeholder="e.g. 250000"
        />
      </label>
      <label className="grid gap-2 text-xs font-bold text-slate-700">
        Currency
        <select
          name="currency"
          defaultValue={item?.currency ?? currency}
          className={field}
        >
          <option value="INR">INR (₹)</option>
          <option value="USD">USD ($)</option>
          <option value="AED">AED</option>
        </select>
      </label>
      <label className="grid gap-2 text-xs font-bold text-slate-700">
        Status
        <select
          name="status"
          className={field}
          defaultValue={item?.status ?? 'active'}
        >
          <option value="active">Available for new quotations</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      <label className="grid gap-2 text-xs font-bold text-slate-700 sm:col-span-2">
        Inclusions, brands, specifications and exclusions
        <textarea
          name="description"
          className={field}
          maxLength={2000}
          rows={5}
          defaultValue={item?.description ?? ''}
          placeholder="Plywood grade, laminate brands, hardware, warranties, labour scope, exclusions..."
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          disabled={pending}
          className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save package'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold text-slate-700"
        >
          Cancel
        </button>
        {state.message && (
          <p
            role={state.saved ? 'status' : 'alert'}
            className="text-sm text-slate-700"
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

export function QuotationPackagesManager({
  packages,
  industries,
  currency,
  canManage,
}: {
  packages: QuotationPackage[];
  industries: Industry[];
  currency: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState('all');
  const visible = packages.filter(
    (item) =>
      selectedIndustry === 'all' || item.industryKey === selectedIndustry,
  );
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
            Industry package catalogue
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-slate-950">
            Interior &amp; additional industry packages
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Create packages for interiors and new industries with a base rate,
            scope, brands and validity. Issued PDF snapshots are never
            rewritten.
          </p>
        </div>
        {canManage && industries.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing(editing === 'new' ? null : 'new')}
            className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white"
          >
            + Add package
          </button>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label
          className="text-xs font-semibold text-slate-600"
          htmlFor="industry-package-filter"
        >
          Filter by industry
        </label>
        <select
          id="industry-package-filter"
          className={field + ' sm:max-w-64'}
          value={selectedIndustry}
          onChange={(e) => setSelectedIndustry(e.target.value)}
        >
          <option value="all">All industries</option>
          {industries.map((industry) => (
            <option key={industry.key} value={industry.key}>
              {industry.name}
            </option>
          ))}
        </select>
      </div>
      {editing === 'new' && (
        <Editor
          industries={industries}
          currency={currency}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                {industries.find((i) => i.key === item.industryKey)?.name ??
                  item.industryKey}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-slate-500">
                {item.code}
              </span>
              <span
                className={
                  item.status === 'active'
                    ? 'text-emerald-700'
                    : 'text-slate-500'
                }
              >
                {item.status}
              </span>
            </div>
            <h3 className="mt-3 text-lg font-extrabold text-slate-950">
              {item.name}
            </h3>
            <p className="mt-2 text-xl font-black text-blue-700">
              {new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: item.currency,
                maximumFractionDigits: 2,
              }).format(Number(item.basePrice))}
              <span className="ml-1 text-xs font-semibold text-slate-500">
                /{priceUnits[item.pricingBasis]}
              </span>
            </p>
            <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">
              {item.description || 'No scope specified yet.'}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={() => setEditing(editing === item.id ? null : item.id)}
                className="mt-4 rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-bold text-blue-700"
              >
                Edit package
              </button>
            )}
            {canManage && editing === item.id && (
              <Editor
                key={item.version}
                item={item}
                industries={industries}
                currency={currency}
                onClose={() => setEditing(null)}
              />
            )}
          </article>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="mt-5 rounded-xl border border-dashed border-slate-300 px-5 py-6 text-sm text-slate-500">
          No matching packages yet. Create a package to define your
          company&apos;s pricing.
        </p>
      )}
    </section>
  );
}
