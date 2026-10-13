'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ConstructionRate } from '@business-os/database/construction-rates';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import { PremiumSftBuilder } from './premium-sft-builder';
import type { SftEstimateDetails } from '@business-os/core/sft-quotation';
import {
  previewConstructionPackage,
  saveCustomizedMaterial,
} from './construction-actions';

const money = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    v,
  );
const field =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900';

function CustomizedQuote({
  rates,
  revisionId,
  version,
}: {
  rates: ConstructionRate[];
  revisionId: string;
  version: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [area, setArea] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{
    total: string;
    rate: string;
  } | null>(null);
  const active = rates.filter(
    (x) => x.status === 'active' && Number(x.ratePerSqft) > 0,
  );
  const categories = [...new Set(active.map((x) => x.category))].sort();
  const selected = active.find((x) => x.id === materialId);
  function submit(save: boolean) {
    setMessage('');
    setPreview(null);
    start(async () => {
      if (save) {
        const result = await saveCustomizedMaterial(revisionId, version, {
          materialId,
          areaSqft: area,
        });
        setMessage(result.message);
        if (result.id) {
          setMaterialId('');
          router.refresh();
        }
      } else {
        const result = await previewConstructionPackage(revisionId, {
          ids: [materialId],
          areaSqft: area,
        });
        setMessage(result.message);
        if (result.total && result.ratePerSqft)
          setPreview({ total: result.total, rate: result.ratePerSqft });
      }
    });
  }
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
          Option 2 · Customized quotation
        </p>
        <h3 className="mt-2 text-xl font-extrabold text-slate-950">
          Price each material and brand separately
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Choose the material/brand, enter applicable area and add a priced
          line. Repeat for steel, bricks, cement, painting or any other
          construction item. The total grows from the saved item prices, not a
          base package.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-xs font-bold text-slate-700">
          Brand / material
          <select
            className={field}
            value={materialId}
            onChange={(e) => {
              setMaterialId(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">Choose a material</option>
            {categories.map((c) => (
              <optgroup key={c} label={c}>
                {active
                  .filter((x) => x.category === c)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {money(Number(item.ratePerSqft))}/sq ft
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-xs font-bold text-slate-700">
          Applicable area (sq ft)
          <input
            className={field}
            type="number"
            min=".01"
            max="1000000"
            step=".01"
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              setPreview(null);
            }}
            placeholder="e.g. 1440"
          />
        </label>
      </div>
      {selected && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-base font-extrabold text-slate-950">
            {selected.category} · {selected.name}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {selected.specification}
          </p>
          <p className="mt-3 text-xl font-extrabold text-blue-700">
            {money(Number(selected.ratePerSqft))}/sq ft
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-950 p-5 text-white">
        <div>
          <p className="text-xs font-semibold text-blue-200">
            This material&apos;s indicative amount
          </p>
          <p className="mt-1 text-2xl font-extrabold">
            {selected && Number(area) > 0
              ? money(Number(selected.ratePerSqft) * Number(area))
              : '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!selected || !Number(area) || pending}
            onClick={() => submit(false)}
            className="rounded-xl bg-white px-4 py-3 text-xs font-bold text-blue-700 disabled:opacity-40"
          >
            Verify price
          </button>
          <button
            type="button"
            disabled={!selected || !Number(area) || pending}
            onClick={() => submit(true)}
            className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-40"
          >
            {pending ? 'Working…' : '+ Add priced material'}
          </button>
        </div>
      </div>
      {preview && (
        <p className="text-sm font-semibold text-emerald-700">
          Verified material amount: {money(Number(preview.total))}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-slate-600">
          {message}
        </p>
      )}
      <p className="text-xs leading-5 text-slate-500">
        To edit material options, brands or company pricing, open
        <Link
          href="/dashboard/pricing/construction"
          className="ml-1 font-bold text-blue-700 underline"
        >
          Construction Pricing
        </Link>
        . Saved items can be rearranged or removed in the quotation below.
      </p>
    </div>
  );
}

export function ConstructionSelector({
  rates,
  packages,
  initialSchedule,
  revisionId,
  version,
  initialMode = 'sft',
}: {
  rates: ConstructionRate[];
  packages: ConstructionPackage[];
  initialSchedule: SftEstimateDetails | null;
  revisionId: string;
  version: number;
  initialMode?: 'sft' | 'custom';
}) {
  const [mode, setMode] = useState<'sft' | 'custom'>(initialMode);
  return (
    <section className="my-7 overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-sm">
      <div className="bg-slate-950 px-6 py-7 text-white sm:px-8">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-300">
          Construction quotation
        </p>
        <h2 className="mt-2 text-2xl font-extrabold">
          Select quotation calculation method
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          Floor-wise per-SFT estimates and item-wise customized pricing are two
          different methods. Client details are recorded above. Prices and
          specifications appear separately in the PDF.
        </p>
      </div>
      <div className="space-y-6 p-5 sm:p-7">
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="group"
          aria-label="Quotation calculation method"
        >
          <button
            type="button"
            aria-pressed={mode === 'sft'}
            onClick={() => setMode('sft')}
            className={
              'rounded-2xl border p-5 text-left ' +
              (mode === 'sft'
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200')
            }
          >
            <strong className="block text-base font-extrabold text-slate-950">
              1. Per-SFT quotation
            </strong>
            <span className="mt-2 block text-xs leading-5 text-slate-600">
              Floor/work schedule: L × W × price per SFT, with material and
              brand inclusions below.
            </span>
          </button>
          <button
            type="button"
            aria-pressed={mode === 'custom'}
            onClick={() => setMode('custom')}
            className={
              'rounded-2xl border p-5 text-left ' +
              (mode === 'custom'
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200')
            }
          >
            <strong className="block text-base font-extrabold text-slate-950">
              2. Customized quotation
            </strong>
            <span className="mt-2 block text-xs leading-5 text-slate-600">
              Choose and price each material/brand independently with its own
              rate and area.
            </span>
          </button>
        </div>
        {mode === 'sft' ? (
          <PremiumSftBuilder
            rates={rates}
            packages={packages}
            initialSchedule={initialSchedule}
            revisionId={revisionId}
            version={version}
          />
        ) : (
          <CustomizedQuote
            rates={rates}
            revisionId={revisionId}
            version={version}
          />
        )}
      </div>
    </section>
  );
}
