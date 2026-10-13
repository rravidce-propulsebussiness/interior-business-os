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
  kind: 'floor' | 'additional';
  name: string;
  lengthFeet: string;
  widthFeet: string;
  ratePerSqft: string;
};
type Section = {
  title: string;
  description: string;
  brand?: string | undefined;
  grade?: string | undefined;
  allowancePerSqft?: string | undefined;
};
const floorNames = [
  'Ground Floor',
  'First Floor',
  'Second Floor',
  'Third Floor',
  'Fourth Floor',
  'Fifth Floor',
  'Sixth Floor',
  'Terrace / Penthouse',
];
const extraNames = [
  'Footings / Foundation',
  'Shelves & Sajjas',
  'Elevation Works',
  'Cellar / Parking',
  'Staircase',
  'Compound Wall',
  'Other Work',
];
const specificationTopics = [
  'Architectural plans & drawings',
  'Foundation, footings & structural work',
  'Steel & cement',
  'Bricks, sand & aggregate',
  'Kitchen & platform',
  'Doors, windows & hardware',
  'Bathroom, plumbing & waterproofing',
  'Flooring, tiles & staircase',
  'Interior & exterior painting',
  'Electrical work',
  'Elevation, railings & metal works',
  'Water tanks, sump & miscellaneous',
  'Exclusions, warranty & site handover',
];
const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
const field =
  'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const makeRow = (
  kind: WorkRow['kind'],
  name: string,
  price: string,
): WorkRow => ({
  kind,
  name,
  lengthFeet: '',
  widthFeet: '',
  ratePerSqft: price,
});
const freshSections = (): Section[] => [
  { title: 'Package scope & inclusions', description: '' },
  ...specificationTopics.map((title) => ({ title, description: '' })),
];

export function PremiumSftBuilder({
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
  const [pending, startTransition] = useTransition();
  const activePackages = packages.filter((item) => item.status === 'active');
  const activeRates = rates.filter((item) => item.status === 'active');
  const [packageId, setPackageId] = useState(() => {
    const prior = initialSchedule?.package;
    return (
      activePackages.find(
        (item) => item.id === prior?.id || item.code === prior?.code,
      )?.id ?? ''
    );
  });
  const selectedPackage = activePackages.find((item) => item.id === packageId);
  const [rows, setRows] = useState<WorkRow[]>(
    initialSchedule?.rows.map((row) => ({
      kind: row.kind ?? 'floor',
      name: row.name,
      lengthFeet: row.lengthFeet,
      widthFeet: row.widthFeet,
      ratePerSqft: row.ratePerSqft,
    })) ?? [makeRow('floor', 'Ground Floor', '')],
  );
  const [sections, setSections] = useState<Section[]>(
    initialSchedule?.sections?.length
      ? initialSchedule.sections.map((item) => ({ ...item }))
      : freshSections(),
  );
  const [brands, setBrands] = useState<Record<string, string>>(() => {
    const selected: Record<string, string> = {};
    for (const material of initialSchedule?.materials ?? []) {
      const found = activeRates.find(
        (item) =>
          item.category === material.category &&
          item.name === material.name &&
          item.specification === material.specification,
      );
      if (found) selected[material.category] = found.id;
    }
    return selected;
  });
  const [step, setStep] = useState<1 | 2>(1);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const categoryNames = [
    ...new Set(activeRates.map((item) => item.category)),
  ].sort();
  const materialIds = activeRates
    .filter((item) => item.id === brands[item.category])
    .map((item) => item.id);
  const materialOptions = activeRates
    .filter((item) => materialIds.includes(item.id))
    .map((item) => ({
      category: item.category,
      name: item.name,
      specification: item.specification,
    }));
  const quote = (() => {
    try {
      return calculateSftEstimate(
        {
          rows,
          materialIds,
          packageId: packageId || null,
          sections,
        },
        materialOptions,
      );
    } catch {
      return null;
    }
  })();
  const floorCount = rows.filter((row) => row.kind === 'floor').length;
  const extraCount = rows.length - floorCount;
  const archivedBrands = (initialSchedule?.materials ?? []).filter(
    (material) =>
      !activeRates.some(
        (item) =>
          item.category === material.category &&
          item.name === material.name &&
          item.specification === material.specification,
      ) && !brands[material.category],
  );
  const canSave =
    Boolean(quote) &&
    !pending &&
    !archivedBrands.length &&
    (activePackages.length === 0 || Boolean(selectedPackage));
  const update = (index: number, change: Partial<WorkRow>) => {
    setRows((items) =>
      items.map((item, i) => (i === index ? { ...item, ...change } : item)),
    );
    setMessage('');
    setSaved(false);
  };
  const applyPackage = (id: string) => {
    const choice = activePackages.find((item) => item.id === id);
    setPackageId(id);
    if (choice) {
      setRows((current) =>
        current.map((row) =>
          row.kind === 'floor'
            ? { ...row, ratePerSqft: choice.ratePerSqft }
            : row,
        ),
      );
      setSections([
        { title: 'Package scope & inclusions', description: choice.description },
        ...(choice.specSections.length
          ? choice.specSections
              .filter((section) =>
                Boolean(
                  section.description.trim() || section.brand.trim() ||
                  section.grade.trim() || section.allowancePerSqft.trim(),
                ),
              )
              .map((section) => ({
                title: section.title,
                description: section.description,
                brand: section.brand,
                grade: section.grade,
                allowancePerSqft: section.allowancePerSqft,
              }))
          : freshSections().slice(1)),
      ]);
    }
    setSaved(false);
    setMessage('');
  };
  const addFloor = () => {
    if (rows.length >= 18) return;
    const next =
      floorNames.find((name) => !rows.some((row) => row.name === name)) ??
      'Additional Floor';
    setRows((current) => [
      ...current,
      makeRow('floor', next, selectedPackage?.ratePerSqft ?? ''),
    ]);
    setSaved(false);
  };
  const addWork = (name: string) => {
    if (!name || rows.length >= 18) return;
    setRows((current) => [...current, makeRow('additional', name, '')]);
    setSaved(false);
  };
  const save = () => {
    if (!canSave) return;
    startTransition(async () => {
      const result = await saveFloorwiseSftEstimate(revisionId, version, {
        rows,
        materialIds,
        packageId: packageId || null,
        sections: sections.filter((item) =>
          Boolean(
            item.description.trim() || item.brand?.trim() ||
            item.grade?.trim() || item.allowancePerSqft?.trim(),
          ),
        ),
      });
      setMessage(result.message);
      setSaved(Boolean(result.id));
      if (result.id) router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-slate-950 via-[#13284f] to-blue-800 px-5 py-6 text-white sm:px-7">
          <p className="text-[11px] font-bold uppercase tracking-[.22em] text-blue-200">
            Construction · Package quotation
          </p>
          <h3 className="mt-2 text-2xl font-extrabold tracking-tight">
            Build your quotation, floor by floor.
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
            Select a company package, add only the floors in your project, then
            specify optional works and materials. Rates and specifications
            remain editable for this quotation.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:max-w-lg">
            <button
              type="button"
              onClick={() => setStep(1)}
              aria-current={step === 1 ? 'step' : undefined}
              className={
                'rounded-xl px-4 py-3 text-left text-xs font-bold ' +
                (step === 1
                  ? 'bg-white text-slate-950 shadow-lg'
                  : 'border border-white/30 bg-white/10 text-white')
              }
            >
              01 · Package & floor costing
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              aria-current={step === 2 ? 'step' : undefined}
              className={
                'rounded-xl px-4 py-3 text-left text-xs font-bold ' +
                (step === 2
                  ? 'bg-white text-slate-950 shadow-lg'
                  : 'border border-white/30 bg-white/10 text-white')
              }
            >
              02 · Package specifications
            </button>
          </div>
        </div>

        {step === 1 ? (
          <div className="space-y-5 p-4 sm:p-7">
            <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="grid gap-2 text-xs font-bold text-slate-700">
                Construction package <span className="text-rose-600">*</span>
                <select
                  className={field}
                  value={packageId}
                  onChange={(event) => applyPackage(event.target.value)}
                >
                  <option value="">
                    {activePackages.length
                      ? 'Choose company package'
                      : 'No packages configured'}
                  </option>
                  {activePackages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {money(Number(item.ratePerSqft))}/sq ft
                    </option>
                  ))}
                </select>
                <span className="font-normal text-slate-500">
                  Applies the package rate to each floor. Individual work rates
                  may be adjusted before saving.
                </span>
              </label>
              <Link
                href="/dashboard/pricing/construction"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-bold text-blue-700"
              >
                Manage packages ↗
              </Link>
            </div>
            {selectedPackage && (
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <strong className="text-sm text-slate-950">
                    {selectedPackage.name}
                  </strong>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {selectedPackage.description ||
                      'Edit package scope in step two.'}
                  </p>
                </div>
                <strong className="text-base text-blue-700">
                  {money(Number(selectedPackage.ratePerSqft))}/SFT
                </strong>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-lg font-extrabold text-slate-950">
                  Floors & construction work
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  G only, G+1, G+2 or higher — add exactly what is needed.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                {floorCount} floors · {extraCount} additional works
              </span>
            </div>
            <div className="space-y-3">
              {rows.map((row, index) => {
                const record = quote?.rows[index];
                const numericArea =
                  Number(row.lengthFeet) * Number(row.widthFeet);
                const amount = record
                  ? Number(record.amount)
                  : numericArea * Number(row.ratePerSqft);
                return (
                  <div
                    key={index}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={
                            'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-extrabold ' +
                            (row.kind === 'floor'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-800')
                          }
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            {row.kind === 'floor' ? 'Floor' : 'Additional work'}
                          </p>
                          <strong className="block truncate text-sm text-slate-900">
                            {row.name}
                          </strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={
                          rows.length === 1 ||
                          (row.kind === 'floor' && floorCount === 1)
                        }
                        onClick={() => {
                          setRows((items) =>
                            items.filter((_, i) => i !== index),
                          );
                          setSaved(false);
                        }}
                        aria-label={'Remove ' + row.name}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 disabled:opacity-30"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <label className="col-span-2 grid gap-1.5 text-xs font-semibold text-slate-600 sm:col-span-1">
                        Description
                        <input
                          className={field}
                          aria-label={'Work description ' + (index + 1)}
                          maxLength={90}
                          value={row.name}
                          onChange={(e) =>
                            update(index, { name: e.target.value })
                          }
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                        Length (ft)
                        <input
                          className={field}
                          type="number"
                          min=".01"
                          max="9999.99"
                          step=".01"
                          value={row.lengthFeet}
                          onChange={(e) =>
                            update(index, { lengthFeet: e.target.value })
                          }
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                        Width (ft)
                        <input
                          className={field}
                          type="number"
                          min=".01"
                          max="9999.99"
                          step=".01"
                          value={row.widthFeet}
                          onChange={(e) =>
                            update(index, { widthFeet: e.target.value })
                          }
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                        Rate (₹/SFT)
                        <input
                          className={field}
                          type="number"
                          min="0"
                          max="999999.99"
                          step=".01"
                          value={row.ratePerSqft}
                          onChange={(e) =>
                            update(index, { ratePerSqft: e.target.value })
                          }
                        />
                      </label>
                      <div className="grid gap-1.5 text-xs font-semibold text-slate-600">
                        Area
                        {selectedPackage?.attachmentFilename && (
                <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs font-semibold text-teal-800">
                  ▤ {selectedPackage.attachmentFilename} · The company package PDF
                  will be attached to this quotation when you save the draft.
                </p>
              )}
              <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm font-extrabold text-slate-900">
                          {numericArea > 0 ? numericArea.toFixed(2) : '—'} SFT
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                          Work amount
                        </p>
                        <strong className="text-lg font-extrabold text-slate-950">
                          {Number.isFinite(amount) && amount > 0
                            ? money(amount)
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addFloor}
                disabled={rows.length >= 18}
                className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-40"
              >
                + Add next floor
              </button>
              <select
                aria-label="Add additional construction work"
                className={field + ' max-w-xs'}
                value=""
                disabled={rows.length >= 18}
                onChange={(event) => addWork(event.target.value)}
              >
                <option value="">+ Add footing, shelves, elevation…</option>
                {extraNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 rounded-2xl bg-slate-950 p-5 text-white sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-300">Total floor area</p>
                <strong className="mt-1 block text-xl font-extrabold">
                  {quote?.totalAreaSqft ?? '—'} SFT
                </strong>
              </div>
              <div>
                <p className="text-xs text-slate-300">Additional work area</p>
                <strong className="mt-1 block text-xl font-extrabold">
                  {quote?.additionalAreaSqft ?? '—'} SFT
                </strong>
              </div>
              <div>
                <p className="text-xs text-blue-200">Total construction cost</p>
                <strong className="mt-1 block text-xl font-extrabold text-white">
                  {quote
                    ? money(Number(quote.total))
                    : 'Complete areas & rates'}
                </strong>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-extrabold text-white"
            >
              Continue to package specifications →
            </button>
          </div>
        ) : (
          <div className="space-y-5 p-4 sm:p-7">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-blue-700">
                Step 02 · Editable scope
              </p>
              <h4 className="mt-2 text-xl font-extrabold text-slate-950">
                Package materials & specifications
              </h4>
              <p className="mt-2 text-xs leading-6 text-slate-600">
                Customize the selected package for this client. Add brands,
                quantities, exclusions, warranty or delivery conditions. Only
                filled specifications are printed on the following PDF pages;
                changing them does not silently change floor rates.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {sections.map((section, index) => (
                <details
                  key={index}
                  className="group rounded-2xl border border-slate-200 bg-white p-4"
                  open={index === 0 ? true : undefined}
                >
                  <summary className="cursor-pointer text-sm font-extrabold text-slate-950">
                    {String(index + 1).padStart(2, '0')} · {section.title}
                  </summary>
                  <label className="mt-4 grid gap-2 text-xs font-semibold text-slate-600">
                    Section title
                    <input
                      className={field}
                      maxLength={90}
                      value={section.title}
                      onChange={(event) => {
                        setSections((items) =>
                          items.map((item, i) =>
                            index === i
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        );
                        setSaved(false);
                      }}
                    />
                  </label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {([
                      ['brand', 'Brand / manufacturer'],
                      ['grade', 'Grade / material size'],
                      ['allowancePerSqft', 'Price allowance per SFT (₹)'],
                    ] as const).map(([key, title]) => (
                      <label key={key} className="grid gap-1.5 text-xs font-semibold text-slate-600">
                        {title}
                        <input
                          className={field}
                          maxLength={key === 'allowancePerSqft' ? 40 : 120}
                          value={section[key] ?? ''}
                          onChange={(event) => {
                            setSections((items) =>
                              items.map((item, i) =>
                                i === index
                                  ? { ...item, [key]: event.target.value }
                                  : item,
                              ),
                            );
                            setSaved(false);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="mt-3 grid gap-2 text-xs font-semibold text-slate-600">
                    Editable inclusions, material brands & conditions
                    <textarea
                      className={field + ' min-h-32 resize-y leading-6'}
                      maxLength={1100}
                      rows={5}
                      placeholder="Enter the specification included with this package…"
                      value={section.description}
                      onChange={(event) => {
                        setSections((items) =>
                          items.map((item, i) =>
                            index === i
                              ? { ...item, description: event.target.value }
                              : item,
                          ),
                        );
                        setSaved(false);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setSections((items) =>
                        items.filter((_, i) => i !== index),
                      );
                      setSaved(false);
                    }}
                    className="mt-3 text-xs font-bold text-rose-600"
                  >
                    Remove section
                  </button>
                </details>
              ))}
            </div>
            <button
              type="button"
              disabled={sections.length >= 18}
              onClick={() => {
                setSections((items) => [
                  ...items,
                  { title: 'Custom specification', description: '' },
                ]);
                setSaved(false);
              }}
              className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-bold text-blue-700 disabled:opacity-40"
            >
              + Add specification section
            </button>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h4 className="text-sm font-extrabold text-slate-950">
                Material & brand choices
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                These are included specifications, not additional material
                charges. Configure brands in the company price book.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {categoryNames.map((category) => (
                  <label
                    key={category}
                    className="grid gap-2 text-xs font-bold text-slate-700"
                  >
                    {category}
                    <select
                      className={field}
                      value={brands[category] ?? ''}
                      onChange={(event) => {
                        setBrands((prev) => ({
                          ...prev,
                          [category]: event.target.value,
                        }));
                        setSaved(false);
                      }}
                    >
                      <option value="">Not specified</option>
                      {activeRates
                        .filter((item) => item.category === category)
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
              {archivedBrands.length > 0 && (
                <p
                  role="alert"
                  className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"
                >
                  A previously selected material is no longer available. Select
                  an active option before resaving.
                </p>
              )}
              {categoryNames.length === 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  No configured brands. You can still write specifications
                  above.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700"
              >
                ← Edit floor costing
              </button>
              <Link
                href={
                  '/dashboard/quotations/' + revisionId + '/studio?step=files'
                }
                className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700"
              >
                Attach PDF annexures ↗
              </Link>
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 bg-slate-50 p-4 sm:px-7 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Quotation estimate · {floorCount} floor(s)
              </p>
              <p className="mt-1 text-2xl font-extrabold text-slate-950">
                {quote ? money(Number(quote.total)) : 'Complete floor pricing'}
              </p>
              {activePackages.length > 0 && !selectedPackage && (
                <p className="mt-1 text-xs text-amber-700">
                  Select a company package to save this quotation.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-blue-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? 'Saving quotation…' : 'Save pricing & specifications'}
            </button>
          </div>
          {message && (
            <p
              className={
                'mt-3 rounded-lg p-3 text-xs ' +
                (saved
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-900')
              }
              role={saved ? 'status' : 'alert'}
            >
              {message}
            </p>
          )}
          {saved && (
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={'/dashboard/quotations/' + revisionId + '/preview'}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-blue-700"
              >
                Preview A4 print design ↗
              </a>
              <a
                href={'/dashboard/quotations/' + revisionId + '/pdf'}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-blue-700"
              >
                Download branded PDF ↓
              </a>
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {'Floor and additional-work rates are billed once.'}
            {' Attached PDFs follow the generated quotation.'}
          </p>
        </div>
      </section>
    </div>
  );
}
