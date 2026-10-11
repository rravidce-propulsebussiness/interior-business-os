'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  calculateSftEstimate,
  type SftEstimateDetails,
} from '@business-os/core/sft-quotation';
import type { ConstructionRate } from '@business-os/database/construction-rates';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import { saveFloorwiseSftEstimate } from './construction-actions';

type WorkRow = {
  name: string;
  lengthFeet: string;
  widthFeet: string;
  ratePerSqft: string;
};
const blank = (): WorkRow => ({
  name: '',
  lengthFeet: '',
  widthFeet: '',
  ratePerSqft: '',
});
const rupees = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
const input =
  'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

export function SftEstimateBuilder({
  rates,
  packages,
  initialSchedule,
  revisionId,
  version,
}: {
  rates: ConstructionRate[];
  packages: ConstructionPackage[];
  initialSchedule: SftEstimateDetails | null;
  revisionId: string;
  version: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<WorkRow[]>(
    initialSchedule?.rows.map((row) => ({
      name: row.name,
      lengthFeet: row.lengthFeet,
      widthFeet: row.widthFeet,
      ratePerSqft: row.ratePerSqft,
    })) ?? [blank()],
  );
  const [brands, setBrands] = useState<Record<string, string>>(() => {
    const selected: Record<string, string> = {};
    for (const material of initialSchedule?.materials ?? []) {
      const matched = rates.find(
        (rate) =>
          rate.status === 'active' &&
          rate.category === material.category &&
          rate.name === material.name &&
          rate.specification === material.specification,
      );
      if (matched) selected[material.category] = matched.id;
    }
    return selected;
  });
  const [message, setMessage] = useState('');
  const archivedBrands = (initialSchedule?.materials ?? []).filter(
    (material) =>
      !rates.some(
        (r) =>
          r.status === 'active' &&
          r.category === material.category &&
          r.name === material.name &&
          r.specification === material.specification,
      ),
  );
  const unresolvedArchivedBrands = archivedBrands.filter(
    (material) => !brands[material.category],
  );
  const [saved, setSaved] = useState(false);
  const active = rates.filter((x) => x.status === 'active');
  const categories = [...new Set(active.map((x) => x.category))].sort();
  const materialIds = active
    .filter((x) => x.id === brands[x.category])
    .map((x) => x.id);
  const materialOptions = active
    .filter((x) => materialIds.includes(x.id))
    .map((x) => ({
      category: x.category,
      name: x.name,
      specification: x.specification,
    }));
  const quote: SftEstimateDetails | null = (() => {
    try {
      return calculateSftEstimate({ rows, materialIds }, materialOptions);
    } catch {
      return null;
    }
  })();
  const change = (index: number, key: keyof WorkRow, value: string) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    );
    setMessage('');
    setSaved(false);
  };
  const applyPreset = (id: string) => {
    const choice = packages.find((x) => x.id === id && x.status === 'active');
    if (choice) {
      setRows((prev) =>
        prev.map((row) => ({ ...row, ratePerSqft: choice.ratePerSqft })),
      );
    }
    setMessage('');
    setSaved(false);
  };
  const save = () => {
    if (!quote) return;
    setMessage('');
    start(async () => {
      const response = await saveFloorwiseSftEstimate(revisionId, version, {
        rows,
        materialIds,
      });
      setMessage(response.message);
      setSaved(Boolean(response.id));
      if (response.id) router.refresh();
    });
  };
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
          Option 1 · Area-wise SFT estimate
        </p>
        <h3 className="mt-2 text-xl font-extrabold text-slate-950">
          Floor / work description × area × rate
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Enter different rates for parking, commercial floors, penthouse or
          other work. Each amount is calculated separately, like your
          construction estimate. Selected brands and specifications appear below
          pricing without additional charges.
        </p>
      </div>
      {packages.some((x) => x.status === 'active') && (
        <label className="grid max-w-xl gap-2 text-xs font-bold text-slate-700">
          Optional company rate preset
          <select
            className={input}
            defaultValue=""
            onChange={(e) => applyPreset(e.target.value)}
          >
            <option value="">Enter floor rates individually</option>
            {packages
              .filter((x) => x.status === 'active')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} — {rupees(Number(x.ratePerSqft))}/sq ft
                </option>
              ))}
          </select>
          <span className="font-normal text-slate-500">
            Applying a preset fills the rate column. You may then change any
            individual floor rate.
          </span>
        </label>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[800px] w-full text-left text-sm">
          <thead className="bg-slate-950 text-xs font-bold uppercase text-white">
            <tr>
              <th className="px-3 py-4">Work description</th>
              <th className="px-2 py-4">L (ft)</th>
              <th className="px-2 py-4">W (ft)</th>
              <th className="px-3 py-4">SFT</th>
              <th className="px-2 py-4">₹/SFT</th>
              <th className="px-3 py-4 text-right">Amount</th>
              <th className="px-2 py-4"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const calculated = quote?.rows[index];
              const provisional =
                Number(row.lengthFeet) * Number(row.widthFeet);
              const area =
                calculated?.areaSqft ??
                (Number.isFinite(provisional) && provisional > 0
                  ? provisional.toFixed(2)
                  : '—');
              const amount =
                calculated?.amount ??
                (area !== '—' && row.ratePerSqft
                  ? Number(area) * Number(row.ratePerSqft)
                  : NaN);
              return (
                <tr key={index} className="align-top">
                  <td className="p-2">
                    <input
                      className={input}
                      aria-label={'Work ' + (index + 1) + ' description'}
                      maxLength={90}
                      placeholder="e.g. Ground floor commercial"
                      value={row.name}
                      onChange={(e) => change(index, 'name', e.target.value)}
                    />
                  </td>
                  <td className="w-24 p-2">
                    <input
                      className={input}
                      aria-label={'Length ' + (index + 1)}
                      type="number"
                      min=".01"
                      max="9999.99"
                      step=".01"
                      value={row.lengthFeet}
                      onChange={(e) =>
                        change(index, 'lengthFeet', e.target.value)
                      }
                    />
                  </td>
                  <td className="w-24 p-2">
                    <input
                      className={input}
                      aria-label={'Width ' + (index + 1)}
                      type="number"
                      min=".01"
                      max="9999.99"
                      step=".01"
                      value={row.widthFeet}
                      onChange={(e) =>
                        change(index, 'widthFeet', e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-4 font-semibold text-slate-700">
                    {area}
                  </td>
                  <td className="w-28 p-2">
                    <input
                      className={input}
                      aria-label={'Price per SFT ' + (index + 1)}
                      type="number"
                      min="0"
                      max="999999.99"
                      step=".01"
                      value={row.ratePerSqft}
                      onChange={(e) =>
                        change(index, 'ratePerSqft', e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-4 text-right font-bold text-slate-950">
                    {Number.isFinite(Number(amount))
                      ? rupees(Number(amount))
                      : '—'}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      aria-label={'Remove row ' + (index + 1)}
                      disabled={rows.length === 1}
                      onClick={() => {
                        setRows((prev) => prev.filter((_, i) => i !== index));
                        setSaved(false);
                      }}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-slate-500 disabled:opacity-30"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-blue-50 font-extrabold text-slate-950">
            <tr>
              <td className="px-3 py-4" colSpan={3}>
                Total built-up area and construction cost
              </td>
              <td className="px-3 py-4">{quote?.totalAreaSqft ?? '—'} sq ft</td>
              <td />
              <td className="px-3 py-4 text-right">
                {quote ? rupees(Number(quote.total)) : '—'}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <button
        type="button"
        disabled={rows.length >= 12}
        onClick={() => {
          setRows((prev) => [...prev, blank()]);
          setSaved(false);
        }}
        className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-bold text-blue-700 disabled:opacity-40"
      >
        + Add floor or work row
      </button>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-extrabold text-slate-950">
          Material &amp; brand specifications
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          These are the specified inclusions in this SFT estimate, not extra
          rates.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {categories.map((category) => (
            <label
              key={category}
              className="grid gap-2 text-xs font-bold text-slate-700"
            >
              {category}
              <select
                className={input}
                value={brands[category] ?? ''}
                onChange={(e) => {
                  setBrands((prev) => ({
                    ...prev,
                    [category]: e.target.value,
                  }));
                  setSaved(false);
                }}
              >
                <option value="">Not specified</option>
                {active
                  .filter((x) => x.category === category)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.specification ? ' · ' + item.specification : ''}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        {unresolvedArchivedBrands.length > 0 && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
          >
            Some brands from the saved quotation are no longer active. Select a
            current brand before resaving, or retain the original issued
            revision without changes.
          </p>
        )}
        {categories.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Material dropdowns will appear after the owner configures{' '}
            <Link
              href="/dashboard/pricing/construction"
              className="font-bold text-blue-700 underline"
            >
              Material Pricing
            </Link>
            .
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-950 p-5 text-white">
        <div>
          <p className="text-xs font-semibold text-blue-200">
            Estimated construction cost before quotation discount
          </p>
          <p className="mt-1 text-2xl font-extrabold">
            {quote ? rupees(Number(quote.total)) : 'Complete the work rows'}
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Save this table as one itemized quotation estimate, without double
            counting.
          </p>
        </div>
        <button
          type="button"
          disabled={!quote || pending || unresolvedArchivedBrands.length > 0}
          onClick={save}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-extrabold text-white disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save SFT estimate to quotation'}
        </button>
      </div>
      {message && (
        <p
          role={saved ? 'status' : 'alert'}
          className={
            'text-sm ' + (saved ? 'text-emerald-700' : 'text-slate-600')
          }
        >
          {message}
        </p>
      )}
      <p className="text-xs leading-5 text-slate-500">
        Invoice billing and customized item pricing are separate. To apply a
        quotation-level discount, use the revision discount control. The source
        PDF&apos;s summary and work table must agree on floor areas before the
        quote is issued.
      </p>
    </div>
  );
}
