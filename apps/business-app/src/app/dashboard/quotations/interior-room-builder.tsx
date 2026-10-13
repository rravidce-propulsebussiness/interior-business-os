'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
}: {
  revisionId: string;
  version: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
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
          <p className="qs-muted">Each item has dimensions, core material, finish, hardware and an independent price.</p>
        </div>
        <span className="qs-selected-pill">L × B × ₹ / SFT</span>
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
            {roomPresets.map((name) => <option key={name} value={name} />)}
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
            {furniture.map((name) => <option key={name} value={name} />)}
          </datalist>
        </label>

        <label className="qs-field">
          Length (feet) *
          <input className={inputClass} type="number" inputMode="decimal" min=".01" max="9999.99" step=".01" required
            value={entry.length} onChange={(e) => change('length', e.target.value)} placeholder="8" />
        </label>
        <label className="qs-field">
          Breadth / height (feet) *
          <input className={inputClass} type="number" inputMode="decimal" min=".01" max="9999.99" step=".01" required
            value={entry.width} onChange={(e) => change('width', e.target.value)} placeholder="7" />
        </label>
        <label className="qs-field">
          Selling rate (₹ / sq ft) *
          <input className={inputClass} type="number" inputMode="decimal" min=".01" max="999999.99" step=".01" required
            value={entry.rate} onChange={(e) => change('rate', e.target.value)} placeholder="Enter company rate" />
        </label>
        <label className="qs-field">
          Plywood / core
          <input className={inputClass} value={entry.plywood} maxLength={120}
            onChange={(e) => change('plywood', e.target.value)} placeholder="e.g. BWP plywood, 18 mm" />
        </label>
        <label className="qs-field">
          Finish / laminate
          <input className={inputClass} value={entry.finish} maxLength={120}
            onChange={(e) => change('finish', e.target.value)} placeholder="e.g. 1 mm laminate / PU" />
        </label>
        <label className="qs-field">
          Hardware brand
          <input className={inputClass} value={entry.hardware} maxLength={120}
            onChange={(e) => change('hardware', e.target.value)} placeholder="e.g. Hettich / Hafele" />
        </label>
        <label className="qs-field">
          Door / shutter type
          <input className={inputClass} value={entry.door} maxLength={120}
            onChange={(e) => change('door', e.target.value)} placeholder="e.g. Glass / PU / laminate" />
        </label>
        <label className="qs-field qs-field-wide">
          Item specification / additional notes
          <input className={inputClass} value={entry.remarks} maxLength={350}
            onChange={(e) => change('remarks', e.target.value)} placeholder="Soft-close hinges, profile glass, accessories…" />
        </label>
        <div className="qs-field-full qs-totals-bar" role="status">
          <span>
            <span className="qs-muted">Calculated quantity</span>
            <strong style={{ display: 'block', color: '#172842', fontSize: 16 }}>
              {Number.isFinite(area) ? area.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0'} sq ft
            </strong>
          </span>
          <span style={{ textAlign: 'right' }}>
            <span className="qs-muted">Line amount (before discounts)</span>
            <strong style={{ display: 'block' }}>{Number.isFinite(total) ? money.format(total) : '—'}</strong>
          </span>
        </div>
        <div className="qs-field-full qs-toolbar" style={{ justifyContent: 'flex-end' }}>
          <button className="qs-btn primary" type="submit" disabled={pending}>
            {pending ? 'Saving item…' : '＋ Add item to quotation'}
          </button>
        </div>
      </form>
      {message && <p role="status" className="qs-message" style={{ marginTop: 12 }}>{message}</p>}
    </section>
  );
}
