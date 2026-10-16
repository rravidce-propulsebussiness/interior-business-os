'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ConstructionPackage,
  ConstructionSpecSection,
} from '@business-os/database/construction-packages';
import { saveConstructionPackage } from './package-actions';
import { FLOOR_RATE_TITLE, readFloorRateDefaults, writeFloorRateDefaults } from './floor-rate-rules';

type Unit = NonNullable<ConstructionSpecSection['unit']>;
type Treatment = NonNullable<ConstructionSpecSection['pricingTreatment']>;
const unitLabels: Record<Unit, string> = {
  none: 'As specified',
  sqft: 'per sq ft',
  bathroom: 'per bathroom',
  door: 'per door',
  piece: 'per piece',
  kg: 'per kg',
  tonne: 'per tonne',
  bag: 'per bag',
  cubic_meter: 'per m³',
  running_ft: 'per running ft',
  point: 'per point',
  lumpsum: 'lump sum',
  meter: 'per metre',
  bhk: 'per BHK',
};
const treatments: Record<Treatment, string> = {
  included: 'Included in package',
  allowance: 'Allowance included',
  extra: 'Chargeable extra',
  excluded: 'Excluded',
};
const starter = [
  ['Architectural plans', '2D floor plans, structural drawings, 3D elevation, soil test', 'none', 'included'],
  ['Steel / TMT', 'As per approved structural engineer design', 'none', 'included'],
  ['Cement', 'Structural and masonry grades as specified', 'none', 'included'],
  ['Sand & aggregates', 'Approved quarry and applicable aggregate sizes', 'none', 'included'],
  ['Bricks / blocks', 'Wall thickness and material specifications', 'none', 'included'],
  ['Flooring tiles', 'Tiles for living, dining and bedrooms', 'sqft', 'allowance'],
  ['Bathroom fittings', 'Sanitary ware, taps, showers and CP fittings', 'bathroom', 'allowance'],
  ['Main door', 'Main entrance door, frame, hardware and finish', 'door', 'allowance'],
  ['Internal doors', 'Door shutter, frame, fittings and polish', 'door', 'allowance'],
  ['Windows', 'UPVC / aluminium windows including hardware', 'sqft', 'allowance'],
  ['Kitchen & countertop', 'Kitchen platform, sink and backsplash', 'sqft', 'allowance'],
  ['Electrical', 'Copper wiring, conduits and switches', 'none', 'included'],
  ['Plumbing', 'Water supply and drainage, pipe brand and grade', 'none', 'included'],
  ['Painting', 'Putty, primer and interior / exterior finish coats', 'none', 'included'],
  ['Railings & metal works', 'Staircase railings, gates and grills', 'running_ft', 'allowance'],
  ['Exclusions & warranty', 'Clarify exclusions, workmanship and warranty', 'none', 'included'],
] as const;
const brandless = /architectural|drawing|plan|design|exclusion|warranty|soil test/i;
const orange = '#F97316';
const field = 'min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100';
const label = 'grid min-w-0 gap-1.5 text-xs font-bold text-slate-600';
const currency = (n: string | number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const safeUnit = (title: string): Unit => {
  if (/architectural|design|drawing|warranty|exclusion|steel|tmt/i.test(title)) return 'none';
  if (/bathroom(?! door)|sanitary|toilet|fixture/i.test(title)) return 'bathroom';
  if (/door/i.test(title)) return 'door';
  if (/window|tile|floor|granite|countertop|wallpaper|ceiling|painting|cladding/i.test(title)) return 'sqft';
  if (/railing|skirting/i.test(title)) return 'running_ft';
  if (/light|switch|socket/i.test(title)) return 'point';
  if (/sink|tank|gate/i.test(title)) return 'piece';
  return 'none';
};
const initialSpec = (record: readonly string[]): ConstructionSpecSection => ({
  title: record[0] ?? 'Custom specification',
  description: record[1] ?? '',
  brand: '',
  grade: '',
  allowancePerSqft: '',
  unit: record[2] as Unit || 'none',
  pricingTreatment: record[3] as Treatment || 'included',
  allowanceValue: '',
});
const prepare = (s: ConstructionSpecSection): ConstructionSpecSection => {
  const unit = s.unit || safeUnit(s.title);
  const value = s.allowanceValue ?? (s.allowancePerSqft || '');
  return {
    ...s,
    unit,
    pricingTreatment: s.pricingTreatment || (value ? 'allowance' : 'included'),
    allowanceValue: value,
    allowancePerSqft: s.allowancePerSqft || '',
  };
};

export function PremiumPackageEditor({
  item,
  close,
}: {
  item?: ConstructionPackage;
  close: () => void;
}) {
  const router = useRouter();
  const [result, submit, pending] = useActionState(saveConstructionPackage, { message: '' });
  const [name, setName] = useState(item?.name ?? '');
  const [code, setCode] = useState(item?.code ?? '');
  const [rate, setRate] = useState(item?.ratePerSqft ?? '');
  const originalFloorRates = readFloorRateDefaults(item?.specSections ?? []);
  const [parkingRate, setParkingRate] = useState(originalFloorRates.parking);
  const [penthouseRate, setPenthouseRate] = useState(originalFloorRates.penthouse);
  const [floorRateError, setFloorRateError] = useState('');
  const [description, setDescription] = useState(item?.description ?? '');
  const [status, setStatus] = useState(item?.status ?? 'active');
  const [themeColor, setThemeColor] = useState(item?.themeColor ?? orange);
  const [sections, setSections] = useState<ConstructionSpecSection[]>(
    item?.specSections?.length ? item.specSections.filter(s => s.title !== FLOOR_RATE_TITLE).map(prepare) :
      starter.map((record) => initialSpec(record)),
  );
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<'manual' | 'pdf'>('manual');
  const [attachmentName, setAttachmentName] = useState<string | null>(item?.attachmentFilename ?? null);
  const [fileMessage, setFileMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const currentId = result.packageId ?? item?.id;
  const fileUrl = currentId ? '/dashboard/pricing/construction/packages/' + currentId + '/attachment' : null;
  const previewUrl = currentId ? '/dashboard/pricing/construction/packages/' + currentId + '/preview?format=pdf' : null;
  const specified = sections.filter((s) => Boolean(s.description || s.brand || s.grade || s.allowanceValue));
  const update = (index: number, patch: Partial<ConstructionSpecSection>) =>
    setSections((previous) => previous.map((s, i) => i === index ? { ...s, ...patch } : s));
  useEffect(() => {
    if (result.saved) router.refresh();
  }, [result.saved, router]);
  useEffect(() => {
    if (!fileUrl) return;
    let alive = true;
    void fetch(fileUrl, { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => { if (!response.ok) throw Error('Not available'); return response.json(); })
      .then((data: { attachment?: { filename: string } | null }) => {
        if (alive) setAttachmentName(data.attachment?.filename ?? null);
      }).catch(() => { if (alive) setFileMessage('Could not load attached PDF'); });
    return () => { alive = false; };
  }, [fileUrl]);

  async function upload(file: File) {
    if (!fileUrl || uploading) return;
    if (!/\.pdf$/i.test(file.name) || file.type !== 'application/pdf' ||
        file.size > 15 * 1024 * 1024 || file.size < 10) {
      setFileMessage('Choose a PDF smaller than 15 MB.'); return;
    }
    setUploading(true);
    setFileMessage('');
    try {
      const body = new FormData(); body.append('file', file);
      const response = await fetch(fileUrl, { method: 'POST', body, credentials: 'same-origin' });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw Error(data.message ?? 'Upload failed');
      setAttachmentName(file.name);
      setFileMessage('Source PDF attached to this package.');
      router.refresh();
    } catch (error) {
      setFileMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function removePdf() {
    if (!fileUrl || uploading) return;
    setUploading(true);
    try {
      const response = await fetch(fileUrl, { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) throw Error('Cannot remove attachment');
      setAttachmentName(null);
      setFileMessage('Attachment removed.');
      router.refresh();
    } catch (error) {
      setFileMessage(error instanceof Error ? error.message : 'Remove failed');
    } finally { setUploading(false); }
  }
  const isBrandless = (title: string) => brandless.test(title);
  const moneyPreview = (Number(rate) || 0) * 1000;
  let savedSections = sections;
  let pricingValidation = '';
  try {
    savedSections = writeFloorRateDefaults(sections, {
      parking: parkingRate, penthouse: penthouseRate,
    });
  } catch (error) {
    pricingValidation = error instanceof Error ? error.message : 'Invalid floor rates';
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-[#F8FAFD] shadow-2xl sm:rounded-[30px]">
      <form action={submit} onSubmit={(event) => {
        if (pricingValidation) {
          event.preventDefault();
          setFloorRateError(pricingValidation);
        }
      }}>
        {currentId && <>
          <input type="hidden" name="id" value={currentId} />
          <input type="hidden" name="version" value={result.version ?? item?.version ?? 1} />
        </>}
        <input type="hidden" name="themeColor" value={themeColor} />
        <input type="hidden" name="specSections" value={JSON.stringify(savedSections)} />
        <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-orange-600">Quotations / Packages</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-[#122341] sm:text-2xl">Construction Package Studio</h2>
              <p className="mt-1 text-xs text-slate-500">Create company-specific packages with detailed, correctly measured specifications.</p>
            </div>
            <button type="button" onClick={close} aria-label="Close package editor"
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-xl text-slate-700">×</button>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_125px]">
            <label className={label}>Package name
              <input name="name" required minLength={2} maxLength={120} className={field}
                value={name} onChange={(e) => setName(e.target.value)} placeholder="Premium Construction" />
            </label>
            <label className={label}>Package price (₹/built-up sq ft)
              <input name="ratePerSqft" required type="number" min="1" max="999999.99" step=".01" className={field}
                value={rate} onChange={(e) => setRate(e.target.value)} placeholder="1750" />
            </label>
            <label className={label}>Status
              <select name="status" className={field} value={status}
                onChange={(e) => setStatus(e.target.value === 'inactive' ? 'inactive' : 'active')}>
                <option value="active">● Active</option><option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <label className={label}>Package code
              <input required className={field} name="code" maxLength={20} pattern="[A-Z][A-Z0-9-]{1,19}"
                value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PREMIUM" />
            </label>
            <label className={label}>Description, inclusions & exclusions
              <input className={field} maxLength={600} name="description" value={description}
                onChange={(e) => setDescription(e.target.value)} placeholder="Scope, warranties and exclusions" />
            </label>
          </div>
          <section className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/60 p-4" aria-label="Construction area rate defaults">
            <h3 className="text-sm font-extrabold text-[#172845]">Separate floor-area rates</h3>
            <p className="mt-1 text-xs text-slate-600">
              Construction uses the package rate above. Parking and penthouse can have different rates.
              These defaults are copied into new quotes and remain editable per floor.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={label}>Parking / stilt area (₹ per SFT)
                <input className={field} aria-label="Default parking area rate"
                  type="number" min="1" max="999999.99" step=".01"
                  placeholder="Enter parking rate"
                  value={parkingRate} onChange={(e) => { setParkingRate(e.target.value); setFloorRateError(''); }} />
              </label>
              <label className={label}>Penthouse area (₹ per SFT)
                <input className={field} aria-label="Default penthouse rate"
                  type="number" min="1" max="999999.99" step=".01"
                  placeholder="Enter penthouse rate"
                  value={penthouseRate} onChange={(e) => { setPenthouseRate(e.target.value); setFloorRateError(''); }} />
              </label>
            </div>
            {(floorRateError || pricingValidation) &&
              <p role="alert" className="mt-2 text-xs font-bold text-red-700">
                {floorRateError || pricingValidation}</p>}
            <p className="mt-2 text-[11px] text-slate-500">
              Leave a rate blank to configure it directly in a customer quotation.
              Neither rate changes the normal construction ₹/SFT.
            </p>
          </section>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-500">01 &nbsp; Package details</span>
            <span className="rounded-lg bg-orange-600 px-3 py-2 text-white">02 &nbsp; Specifications</span>
            <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-500">03 &nbsp; PDF & branding</span>
          </div>
        </div>
        <div className="grid min-w-0 gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)]">
          <section className="min-w-0 space-y-3" aria-label="Package specifications">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-black text-[#172845]">Package specifications</h3>
                <p className="mt-1 text-xs text-slate-500">Set the unit and treatment separately for every item.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500">{sections.length} items</span>
            </div>
            {sections.map((spec, index) => {
              const opened = active === index;
              const unit = spec.unit || 'none';
              const treatment = spec.pricingTreatment || 'included';
              const amount = spec.allowanceValue || '';
              return (
                <article key={index} className={'min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm ' +
                  (opened ? 'border-orange-400 ring-1 ring-orange-100' : 'border-slate-200')}>
                  <button type="button" className="flex w-full min-w-0 items-center gap-3 px-3 py-4 text-left sm:px-4"
                    aria-expanded={opened} onClick={() => setActive(opened ? -1 : index)}>
                    <span className={'grid size-10 shrink-0 place-items-center rounded-xl text-sm font-black ' +
                      (opened ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-700')}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-[#172845]">{spec.title}</strong>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {[spec.brand, spec.grade, amount && unit !== 'none' ? currency(amount) + ' / ' + unitLabels[unit] : '',
                          !amount ? treatments[treatment] : ''].filter(Boolean).join(' · ') ||
                          spec.description || 'Add specifications'}
                      </span>
                    </span>
                    <span className={'text-xs font-extrabold ' + (opened ? 'text-orange-600' : 'text-slate-500')}>{opened ? '⌃' : '⌄'}</span>
                  </button>
                  {opened && <div className="grid min-w-0 gap-3 border-t border-slate-100 bg-[#FFFCF9] p-3 sm:grid-cols-2 sm:p-4">
                    <label className={label + ' sm:col-span-2'}>Item / category
                      <input className={field} maxLength={90} value={spec.title}
                        onChange={(e) => update(index, { title: e.target.value })} />
                    </label>
                    {!isBrandless(spec.title) && <label className={label}>Brand / manufacturer
                      <input className={field} maxLength={120} value={spec.brand}
                        onChange={(e) => update(index, { brand: e.target.value })} placeholder="Brand or equivalent" />
                    </label>}
                    {!isBrandless(spec.title) && <label className={label}>Grade / size / finish
                      <input className={field} maxLength={120} value={spec.grade}
                        onChange={(e) => update(index, { grade: e.target.value })} placeholder="Fe 550D, 2×2, etc." />
                    </label>}
                    <label className={label}>Pricing treatment
                      <select className={field} value={treatment}
                        onChange={(e) => update(index, {
                          pricingTreatment: e.target.value as Treatment,
                          ...(e.target.value === 'excluded' || e.target.value === 'included' ? { allowanceValue: '', allowancePerSqft: '' } : {}),
                        })}>
                        {Object.entries(treatments).map(([key, value]) =>
                          <option key={key} value={key}>{value}</option>)}
                      </select>
                    </label>
                    <label className={label}>Measurement unit
                      <select className={field} value={unit} onChange={(e) => update(index, {
                        unit: e.target.value as Unit,
                        ...(e.target.value === 'none' ? { allowanceValue: '', allowancePerSqft: '' } : {}),
                      })}>
                        {Object.entries(unitLabels).map(([key, value]) =>
                          <option key={key} value={key}>{value}</option>)}
                      </select>
                    </label>
                    {unit !== 'none' && (treatment === 'allowance' || treatment === 'extra') &&
                      <label className={label + ' sm:col-span-2'}>{treatment === 'extra' ? 'Extra rate' : 'Included allowance'} (₹ / {unitLabels[unit]})
                        <input className={field} type="number" min="0" max="999999999" step=".01"
                          value={amount} placeholder="Enter price, e.g. 70"
                          onChange={(e) => update(index, {
                            allowanceValue: e.target.value,
                            allowancePerSqft: unit === 'sqft' ? e.target.value : '',
                          })} />
                      </label>}
                    <label className={label + ' sm:col-span-2'}>
                      {isBrandless(spec.title) ? 'Drawings / deliverables / inclusions' : 'Scope and inclusions'}
                      <textarea className={field + ' min-h-24 resize-y'} maxLength={600} rows={3}
                        value={spec.description} onChange={(e) => update(index, { description: e.target.value })}
                        placeholder="What is included, quantity limits, exclusions and technical details" />
                    </label>
                    <p className="text-[11px] leading-5 text-slate-500 sm:col-span-2">
                      {treatment === 'allowance' ? 'Allowance is included in the base package rate. Do not add it twice.' :
                       treatment === 'extra' ? 'Extras are priced separately only when the customer quote adds the actual quantity.' :
                       treatment === 'included' ? 'Included in the base construction rate; no additional material charge.' :
                       'Not included in this package.'}
                    </p>
                    <button type="button" className="justify-self-start rounded-lg px-2 py-2 text-xs font-bold text-red-600"
                      onClick={() => { setSections((prev) => prev.filter((_, i) => i !== index)); setActive(-1); }}>
                      Remove item
                    </button>
                  </div>}
                </article>
              );
            })}
            <button type="button" disabled={sections.length >= 18} onClick={() => {
              setSections((prev) => [...prev, initialSpec(['Custom item', '', 'none', 'included'])]); setActive(sections.length);
            }} className="min-h-12 w-full rounded-2xl border border-dashed border-orange-300 bg-white px-4 text-sm font-extrabold text-orange-600 disabled:opacity-40">
              + Add item or category
            </button>
          </section>

          <aside className="min-w-0 space-y-4" aria-label="PDF branding and preview">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-[#172845]">Live PDF summary</h3>
                {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-bold text-orange-600">View full PDF ↗</a>}
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-t-[5px] px-4 pb-5 pt-4" style={{ borderTopColor: themeColor }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Company-branded package</p>
                  <h4 className="mt-2 text-lg font-black text-[#172845]">{name || 'Premium Construction'}</h4>
                  <p className="mt-2 text-2xl font-black" style={{ color: themeColor }}>{currency(rate)}<span className="ml-1 text-xs text-slate-500">/ sq ft</span></p>
                  <p className="mt-2 text-[10px] text-slate-400">Built-up area basis · specification allowances included</p>
                </div>
                <div className="bg-orange-50 px-3 py-2 text-center text-[10px] font-bold text-orange-700">Allowances included — no double counting</div>
                <div className="divide-y divide-slate-100 px-3">
                  {specified.slice(0, 7).map((spec, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-3 text-[11px]">
                      <span className="min-w-0 truncate font-semibold text-slate-700">{spec.title}</span>
                      <span className="max-w-[140px] truncate text-right text-slate-500">
                        {spec.pricingTreatment === 'excluded' ? 'Excluded' :
                         spec.allowanceValue && spec.unit !== 'none'
                           ? currency(spec.allowanceValue) + ' / ' + unitLabels[spec.unit || 'none']
                           : spec.pricingTreatment === 'extra' ? 'Extra' : 'Included'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="px-3 pb-4 pt-3 text-[10px] text-slate-500">Sample: 1,000 sq ft × {currency(rate)} = {currency(moneyPreview)}. Final quantities use the customer's approved quote.</p>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-extrabold text-[#172845]">PDF & branding</h3>
              <p className="mt-1 text-xs text-slate-500">Choose a colour for this company's quotation.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {['#F97316','#EA580C','#155EEF','#089E9C','#334155'].map((color) => (
                  <button type="button" key={color} aria-label={'Select PDF colour ' + color}
                    aria-pressed={themeColor === color} onClick={() => setThemeColor(color)}
                    className={'size-10 rounded-full border-[3px] border-white shadow-sm ' +
                      (themeColor === color ? 'outline outline-2 outline-orange-500' : '')}
                    style={{ backgroundColor: color }} />
                ))}
                <input type="color" aria-label="Choose custom PDF colour" className="size-10" value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                <button type="button" onClick={() => setMode('manual')} aria-pressed={mode === 'manual'}
                  className={'rounded-lg px-2 py-3 text-xs font-bold ' +
                    (mode === 'manual' ? 'bg-orange-600 text-white' : 'bg-white text-slate-600')}>Manual specs</button>
                <button type="button" onClick={() => setMode('pdf')} aria-pressed={mode === 'pdf'}
                  className={'rounded-lg px-2 py-3 text-xs font-bold ' +
                    (mode === 'pdf' ? 'bg-orange-600 text-white' : 'bg-white text-slate-600')}>Attach existing PDF</button>
              </div>
              {mode === 'manual'
                ? <p className="mt-3 text-xs leading-5 text-slate-500">The specifications on the left become editable, branded PDF pages.</p>
                : <div className="mt-3">
                    <label className={label}>Existing specification PDF (up to 15 MB)
                      <input type="file" ref={fileInput} accept=".pdf,application/pdf"
                        disabled={!fileUrl || uploading} className="w-full py-3 text-xs text-slate-600 disabled:opacity-50"
                        onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
                    </label>
                    {!fileUrl && <p className="text-xs text-amber-700">Save the package first to attach a PDF.</p>}
                  </div>}
              {attachmentName && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                <a href={fileUrl + '?download=1'} target="_blank" rel="noopener noreferrer"
                  className="max-w-[180px] truncate font-bold text-slate-700">📄 {attachmentName}</a>
                <button type="button" disabled={uploading} onClick={() => void removePdf()}
                  className="font-bold text-red-600">Remove PDF</button>
              </div>}
              {fileMessage && <p role="status" className="mt-3 text-xs text-slate-600">{fileMessage}</p>}
              <p className="mt-4 text-[11px] leading-5 text-slate-500">
                Existing PDFs appear after the branded price summary. Previously issued quotations keep their saved snapshot.
              </p>
            </section>
          </aside>
        </div>
        {result.message && <p role={result.saved ? 'status' : 'alert'}
          className={'mx-3 mb-2 rounded-xl p-3 text-sm sm:mx-5 ' +
            (result.saved ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>
          {result.message}
        </p>}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_20px_rgba(16,24,40,.06)] backdrop-blur sm:justify-end sm:p-5">
          <button disabled={pending} type="submit"
            className="min-h-12 min-w-0 flex-1 rounded-xl bg-orange-600 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50 sm:flex-none sm:px-7">
            {pending ? 'Saving…' : '▣ Save changes'}
          </button>
          {previewUrl
            ? <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                className="flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-xl border border-orange-300 bg-white px-3 py-3 text-center text-sm font-extrabold text-orange-700 sm:flex-none sm:px-7">Preview PDF ↗</a>
            : <button type="button" disabled className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-400 sm:flex-none">Preview after saving</button>}
        </div>
      </form>
    </div>
  );
}
