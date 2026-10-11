'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ConstructionRate } from '@business-os/database/construction-rates';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import {
  previewFixedPackage,
  saveFixedPackage,
  saveCustomizedMaterial,
  previewConstructionPackage,
} from './construction-actions';

const money = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    value,
  );
const field =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

export function ConstructionSelector({
  rates,
  packages,
  revisionId,
  version,
}: {
  rates: ConstructionRate[];
  packages: ConstructionPackage[];
  revisionId: string;
  version: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'package' | 'custom'>('package');
  const [area, setArea] = useState('');
  const [packageId, setPackageId] = useState('');
  const [brands, setBrands] = useState<Record<string, string>>({});
  const [customId, setCustomId] = useState('');
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState<{
    rate: string;
    total: string;
  } | null>(null);
  const active = rates.filter((x) => x.status === 'active');
  const categories = [...new Set(active.map((r) => r.category))].sort();
  const choices = active.filter((r) => r.id === brands[r.category]);
  const packageValue = packages.find(
    (p) => p.id === packageId && p.status === 'active',
  );
  const custom = active.find((x) => x.id === customId);
  const validArea =
    Number(area) > 0 &&
    Number(area) <= 1000000 &&
    Number.isFinite(Number(area));
  const packagePayload = {
    packageId,
    ids: choices.map((x) => x.id),
    areaSqft: area.trim(),
  };
  const customPayload = { materialId: customId, areaSqft: area.trim() };
  const ready = mode === 'package' ? Boolean(packageValue) : Boolean(custom);
  const indicatedRate =
    mode === 'package'
      ? Number(packageValue?.ratePerSqft ?? 0)
      : Number(custom?.ratePerSqft ?? 0);
  function run(save: boolean) {
    setConfirmed(null);
    setMessage('');
    start(async () => {
      if (mode === 'package') {
        const response = save
          ? await saveFixedPackage(revisionId, version, packagePayload)
          : await previewFixedPackage(revisionId, packagePayload);
        setMessage(response.message);
        if (
          'total' in response &&
          response.total &&
          'ratePerSqft' in response &&
          response.ratePerSqft
        )
          setConfirmed({ rate: response.ratePerSqft, total: response.total });
        if ('id' in response && response.id) router.refresh();
      } else {
        if (save) {
          const result = await saveCustomizedMaterial(
            revisionId,
            version,
            customPayload,
          );
          setMessage(result.message);
          if (result.id) {
            setCustomId('');
            router.refresh();
          }
        } else {
          const result = await previewConstructionPackage(revisionId, {
            ids: [customId],
            areaSqft: area.trim(),
          });
          setMessage(result.message);
          if (result.total && result.ratePerSqft)
            setConfirmed({ rate: result.ratePerSqft, total: result.total });
        }
      }
    });
  }
  return (
    <section className="my-7 overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-sm">
      <header className="bg-slate-950 px-6 py-7 text-white sm:px-8">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-300">
          Construction quotation builder
        </p>
        <h2 className="mt-2 text-2xl font-extrabold">
          Choose how this quotation is priced
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          Package pricing and material-wise customized pricing are independent.
          The selected company price is checked on the server before saving.
        </p>
      </header>
      <div className="space-y-6 p-5 sm:p-7">
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="group"
          aria-label="Pricing method"
        >
          <button
            type="button"
            onClick={() => {
              setMode('package');
              setConfirmed(null);
              setMessage('');
            }}
            aria-pressed={mode === 'package'}
            className={
              'rounded-2xl border p-4 text-left ' +
              (mode === 'package'
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 bg-white')
            }
          >
            <strong className="block text-base text-slate-950">
              1 · Package / sq ft
            </strong>
            <span className="mt-2 block text-xs leading-5 text-slate-600">
              One package price. Choose included brands and material
              specifications without increasing that package price.
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('custom');
              setConfirmed(null);
              setMessage('');
            }}
            aria-pressed={mode === 'custom'}
            className={
              'rounded-2xl border p-4 text-left ' +
              (mode === 'custom'
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 bg-white')
            }
          >
            <strong className="block text-base text-slate-950">
              2 · Customized / materials
            </strong>
            <span className="mt-2 block text-xs leading-5 text-slate-600">
              Choose each material and brand. Add them as separate quotation
              rows at their saved company rates.
            </span>
          </button>
        </div>
        <label className="block max-w-sm text-xs font-bold text-slate-700">
          Built-up construction area (sq ft)
          <input
            className={'mt-2 ' + field}
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            value={area}
            placeholder="e.g. 1200"
            onChange={(e) => {
              setArea(e.target.value);
              setConfirmed(null);
            }}
          />
        </label>
        {mode === 'package' ? (
          <>
            <label className="grid max-w-lg gap-2 text-xs font-bold text-slate-700">
              Choose company package
              <select
                className={field}
                value={packageId}
                onChange={(e) => {
                  setPackageId(e.target.value);
                  setConfirmed(null);
                }}
              >
                <option value="">Select a package</option>
                {packages
                  .filter((x) => x.status === 'active')
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · {money(Number(x.ratePerSqft))}/sq ft
                    </option>
                  ))}
              </select>
            </label>
            {packageValue && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-extrabold text-blue-700">
                  {packageValue.code} · {packageValue.name}
                </p>
                <p className="mt-1 text-xl font-extrabold text-slate-950">
                  {money(Number(packageValue.ratePerSqft))}/sq ft
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                  {packageValue.description ||
                    'Add package inclusions in company pricing.'}
                </p>
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-slate-950">
                  Included brands &amp; specifications
                </h3>
                <span className="text-xs font-medium text-slate-500">
                  The package price remains fixed.
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {categories.map((category) => (
                  <label
                    className="grid gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700"
                    key={category}
                  >
                    {category}
                    <select
                      className={field}
                      value={brands[category] ?? ''}
                      onChange={(e) => {
                        setBrands((prev) => ({
                          ...prev,
                          [category]: e.target.value,
                        }));
                        setConfirmed(null);
                      }}
                    >
                      <option value="">Not specified</option>
                      {active
                        .filter((x) => x.category === category)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {item.specification
                              ? ' · ' + item.specification
                              : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            {packages.length === 0 && (
              <p className="text-sm text-amber-700">
                No package rates configured for this company yet.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="max-w-xl space-y-3">
              <label className="grid gap-2 text-xs font-bold text-slate-700">
                Choose individually priced material / brand
                <select
                  className={field}
                  value={customId}
                  onChange={(e) => {
                    setCustomId(e.target.value);
                    setConfirmed(null);
                  }}
                >
                  <option value="">Select material and brand</option>
                  {categories.map((category) => (
                    <optgroup label={category} key={category}>
                      {active
                        .filter(
                          (x) =>
                            x.category === category &&
                            Number(x.ratePerSqft) > 0,
                        )
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name} · {money(Number(item.ratePerSqft))}/sq
                            ft
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {custom && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <strong className="text-sm text-slate-950">
                    {custom.category} · {custom.name}
                  </strong>
                  <p className="mt-1 text-xs text-slate-600">
                    {custom.specification || 'No additional specification'}
                  </p>
                  <p className="mt-2 font-bold text-blue-700">
                    {money(Number(custom.ratePerSqft))}/sq ft
                  </p>
                </div>
              )}
              <p className="text-xs leading-5 text-slate-500">
                Each click on Add material creates one independent quotation
                line. Continue with another material after the draft refreshes.
                No package amount is added.
              </p>
            </div>
          </>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
          <div>
            <p className="text-xs font-semibold text-slate-600">
              {mode === 'package'
                ? 'Package total'
                : 'Selected material amount'}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-950">
              {validArea && ready ? money(indicatedRate * Number(area)) : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Based on {money(indicatedRate)} per built-up sq ft · final amount
              verified on server
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !validArea || !ready}
              onClick={() => run(false)}
              className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-bold text-blue-700 disabled:opacity-40"
            >
              Preview price
            </button>
            <button
              type="button"
              disabled={pending || !validArea || !ready || choices.length > 20}
              onClick={() => run(true)}
              className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-40"
            >
              {pending
                ? 'Working…'
                : mode === 'package'
                  ? 'Add package to quote'
                  : 'Add material to quote'}
            </button>
          </div>
        </footer>
        {confirmed && (
          <p className="text-sm font-semibold text-emerald-700">
            Verified: {money(Number(confirmed.total))} ·{' '}
            {money(Number(confirmed.rate))}/sq ft
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-slate-700">
            {message}
          </p>
        )}
        <p className="text-xs text-slate-500">
          Company owners can edit the package rates and brands in{' '}
          <Link
            href="/dashboard/pricing/construction"
            className="font-bold text-blue-700 underline"
          >
            Construction Pricing
          </Link>
          . Quotations retain their issued rates and specifications. Labour,
          GST, and excluded items need their own pricing if not included.
        </p>
      </div>
    </section>
  );
}
