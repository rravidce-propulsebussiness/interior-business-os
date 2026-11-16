'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { QuotationPackage } from '@business-os/database/quotation-packages';
import { applyIndustryQuotationPackage } from './industry-package-actions';
import { addInteriorStudioLine } from './interior-actions';

const furniture = [
  'Wardrobe',
  'Modular Kitchen Base Unit',
  'Kitchen Overhead Unit',
  'TV Unit',
  'Loft',
  'Pooja Unit',
  'Crockery Unit',
  'Study Table',
  'Wall Panelling',
  'Custom Work',
];
const roomPresets = [
  'Living Room',
  'Kitchen',
  'Master Bedroom',
  'Children Bedroom',
  'Guest Bedroom',
  'Pooja Room',
  'Utility',
  'Other',
];
const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export function InteriorRoomBuilder({
  revisionId,
  version,
  packages,
  currency,
  initialPackageId,
}: {
  revisionId: string;
  version: number;
  packages: QuotationPackage[];
  currency: string;
  initialPackageId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [packageId, setPackageId] = useState(
    initialPackageId === 'custom'
      ? 'custom'
      : (packages.find((item) => item.id === initialPackageId)?.id ??
          (packages.length ? '' : 'custom')),
  );
  const [packageQuantity, setPackageQuantity] = useState('1');
  const selectedPackage = packages.find((item) => item.id === packageId);
  const packageTotal = selectedPackage
    ? Number(selectedPackage.basePrice) * Number(packageQuantity)
    : 0;
  const displayPrice = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  const priceUnit =
    selectedPackage?.pricingBasis === 'per_sqft'
      ? 'sq ft'
      : selectedPackage?.pricingBasis === 'per_bhk'
        ? 'BHK'
        : selectedPackage?.pricingBasis === 'per_unit'
          ? 'unit'
          : 'package';
  const [entry, setEntry] = useState({
    room: 'Living Room',
    item: 'TV Unit',
    length: '',
    width: '',
    rate: '',
    plywood: '',
    finish: '',
    hardware: '',
    door: '',
    remarks: '',
  });
  const change = (key: keyof typeof entry, value: string) => {
    setEntry((previous) => ({ ...previous, [key]: value }));
    setMessage('');
  };
  const area = Number(entry.length || 0) * Number(entry.width || 0);
  const total = Math.round(area * Number(entry.rate || 0) * 100) / 100;
  const inputClass =
    'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

  return (
    <section className="qs-card" aria-label="Interior BOQ editor">
      <div className="qs-heading" style={{ marginBottom: 12 }}>
        <div>
          <h2>Room-wise Interior BOQ</h2>
          <p className="qs-muted">
            Choose a saved package or Custom Quote to edit individual works,
            brands, dimensions and rates.
          </p>
        </div>
        <span className="qs-selected-pill">L × B × ₹ / SFT</span>
      </div>
      <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <strong className="text-sm font-extrabold text-slate-950">
              Select Quotation Package
            </strong>
            <p className="mt-1 text-xs text-slate-600">
              Saved packages include their rate and specifications. Select
              Custom Quote for individual works.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="qs-field">
            Company package
            <select
              className={inputClass}
              value={packageId}
              onChange={(event) => {
                setPackageId(event.target.value);
                setPackageQuantity('1');
                setMessage('');
              }}
            >
              <option value="">Select a package</option>
              {packages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {displayPrice(Number(item.basePrice))}
                </option>
              ))}
              <option value="custom">Custom Quote</option>
            </select>
          </label>
          {selectedPackage && (
            <label className="qs-field">
              Quantity ({priceUnit})
              <input
                className={inputClass}
                type="number"
                inputMode="decimal"
                min="0.01"
                max={
                  selectedPackage?.pricingBasis === 'per_bhk'
                    ? 20
                    : selectedPackage?.pricingBasis === 'per_unit'
                      ? 1000
                      : 1000000
                }
                step={
                  selectedPackage?.pricingBasis === 'per_unit' ||
                  selectedPackage?.pricingBasis === 'per_bhk' ||
                  selectedPackage?.pricingBasis === 'fixed'
                    ? '1'
                    : '.01'
                }
                disabled={
                  !selectedPackage || selectedPackage.pricingBasis === 'fixed'
                }
                value={packageQuantity}
                onChange={(event) => setPackageQuantity(event.target.value)}
              />
            </label>
          )}
          {selectedPackage && (
            <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-white p-4">
              <p className="text-xs font-semibold text-slate-700">
                {selectedPackage.description ||
                  'Company package specifications'}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <strong className="text-xl font-black text-blue-700">
                  {Number.isFinite(packageTotal)
                    ? displayPrice(packageTotal)
                    : '—'}
                </strong>
                <button
                  type="button"
                  className="qs-btn primary"
                  disabled={
                    pending ||
                    !Number.isFinite(packageTotal) ||
                    Number(packageQuantity) <= 0
                  }
                  data-studio-save={selectedPackage ? 'quote' : undefined}
                  onClick={() => {
                    setMessage('');
                    start(async () => {
                      const result = await applyIndustryQuotationPackage({
                        revisionId,
                        version,
                        packageId,
                        quantity: packageQuantity,
                      });
                      setMessage(result.message);
                      if (result.ok) {
                        setPackageId('');
                        setPackageQuantity('1');
                        router.refresh();
                      }
                    });
                  }}
                >
                  {pending ? 'Applying…' : '+ Add company package'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {packageId === 'custom' && (
        <>
          <div className="mb-3">
            <h3 className="text-sm font-extrabold text-slate-950">
              Editable custom quotation items
            </h3>
          </div>
          <form
            className="qs-fields"
            onSubmit={(event) => {
              event.preventDefault();
              if (pending) return;
              start(async () => {
                const result = await addInteriorStudioLine({
                  revisionId,
                  version,
                  ...entry,
                });
                setMessage(result.message);
                if (result.ok) {
                  setEntry((prev) => ({
                    ...prev,
                    length: '',
                    width: '',
                    remarks: '',
                  }));
                  router.refresh();
                }
              });
            }}
          >
            <label className="qs-field">
              Room / Area *
              <input
                className={inputClass}
                list="studio-rooms"
                value={entry.room}
                maxLength={80}
                minLength={2}
                required
                onChange={(e) => change('room', e.target.value)}
              />
              <datalist id="studio-rooms">
                {roomPresets.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="qs-field qs-field-wide">
              Work description *
              <input
                className={inputClass}
                list="studio-items"
                value={entry.item}
                maxLength={150}
                required
                onChange={(e) => change('item', e.target.value)}
              />
              <datalist id="studio-items">
                {furniture.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>

            <label className="qs-field">
              Length (feet) *
              <input
                className={inputClass}
                type="number"
                inputMode="decimal"
                min=".01"
                max="9999.99"
                step=".01"
                required
                value={entry.length}
                onChange={(e) => change('length', e.target.value)}
                placeholder="8"
              />
            </label>
            <label className="qs-field">
              Breadth / height (feet) *
              <input
                className={inputClass}
                type="number"
                inputMode="decimal"
                min=".01"
                max="9999.99"
                step=".01"
                required
                value={entry.width}
                onChange={(e) => change('width', e.target.value)}
                placeholder="7"
              />
            </label>
            <label className="qs-field">
              Selling rate (₹ / sq ft) *
              <input
                className={inputClass}
                type="number"
                inputMode="decimal"
                min=".01"
                max="999999.99"
                step=".01"
                required
                value={entry.rate}
                onChange={(e) => change('rate', e.target.value)}
                placeholder="Enter company rate"
              />
            </label>
            <label className="qs-field">
              Plywood / core
              <input
                className={inputClass}
                value={entry.plywood}
                maxLength={120}
                onChange={(e) => change('plywood', e.target.value)}
                placeholder="e.g. BWP plywood, 18 mm"
              />
            </label>
            <label className="qs-field">
              Finish / laminate
              <input
                className={inputClass}
                value={entry.finish}
                maxLength={120}
                onChange={(e) => change('finish', e.target.value)}
                placeholder="e.g. 1 mm laminate / PU"
              />
            </label>
            <label className="qs-field">
              Hardware brand
              <input
                className={inputClass}
                value={entry.hardware}
                maxLength={120}
                onChange={(e) => change('hardware', e.target.value)}
                placeholder="e.g. Hettich / Hafele"
              />
            </label>
            <label className="qs-field">
              Door / shutter type
              <input
                className={inputClass}
                value={entry.door}
                maxLength={120}
                onChange={(e) => change('door', e.target.value)}
                placeholder="e.g. Glass / PU / laminate"
              />
            </label>
            <label className="qs-field qs-field-wide">
              Item specification / additional notes
              <input
                className={inputClass}
                value={entry.remarks}
                maxLength={350}
                onChange={(e) => change('remarks', e.target.value)}
                placeholder="Soft-close hinges, profile glass, accessories…"
              />
            </label>
            <div className="qs-field-full qs-totals-bar" role="status">
              <span>
                <span className="qs-muted">Calculated quantity</span>
                <strong
                  style={{ display: 'block', color: '#172842', fontSize: 16 }}
                >
                  {Number.isFinite(area)
                    ? area.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                    : '0'}{' '}
                  sq ft
                </strong>
              </span>
              <span style={{ textAlign: 'right' }}>
                <span className="qs-muted">Line amount (before discounts)</span>
                <strong style={{ display: 'block' }}>
                  {Number.isFinite(total) ? money.format(total) : '—'}
                </strong>
              </span>
            </div>
            <div
              className="qs-field-full qs-toolbar"
              style={{ justifyContent: 'flex-end' }}
            >
              <button
                className="qs-btn primary"
                type="submit"
                disabled={pending}
                data-studio-save={!selectedPackage ? 'quote' : undefined}
              >
                {pending ? 'Saving item…' : '＋ Add item to quotation'}
              </button>
            </div>
          </form>
        </>
      )}
      {packageId === '' && (
        <p className="qs-info-box">Select a saved package or Custom Quote.</p>
      )}
      {message && (
        <p role="status" className="qs-message" style={{ marginTop: 12 }}>
          {message}
        </p>
      )}
    </section>
  );
}
