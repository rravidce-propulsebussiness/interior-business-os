'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ConstructionPackage,
  ConstructionSpecSection,
} from '@business-os/database/construction-packages';
import { saveConstructionPackage } from './package-actions';

const defaultCategories = [
  [
    'Planning & Drawings',
    '',
    '',
    '2D plans, structural plans, 3D elevation and surveys',
  ],
  [
    'Steel / TMT',
    '',
    '',
    'Specify manufacturer, Fe grade, steel usage standard',
  ],
  ['Cement', '', '', 'Specify manufacturer and OPC/PPC grade'],
  [
    'Sand & aggregates',
    '',
    '',
    'River/M sand, aggregate size and approved source',
  ],
  ['Bricks / blocks', '', '', 'Specify brick/AAC grade and wall thickness'],
  [
    'Tiles / flooring',
    '',
    '',
    'Specify tile brand, dimensions and allowance in ₹/sft',
  ],
  [
    'Kitchen & granite',
    '',
    '',
    'Kitchen counter, sink, backsplash and granite allowance',
  ],
  [
    'Doors & windows',
    '',
    '',
    'Main door, internal frames, UPVC/aluminium, fittings',
  ],
  [
    'Bathrooms & plumbing',
    '',
    '',
    'CPVC/PVC lines, fittings, waterproofing, sanitary brands',
  ],
  [
    'Electrical',
    '',
    '',
    'Wiring brand, conduits, switches and circuit provision',
  ],
  ['Painting', '', '', 'Interior/exterior putty, primer and finish coats'],
  [
    'Elevation & metal works',
    '',
    '',
    'Facade, railing, staircase, grills and finishes',
  ],
  [
    'Exclusions & warranty',
    '',
    '',
    'Exclusions, defect liability and handover terms',
  ],
] as const;
const planNames = [
  'Architectural floor plan',
  'Structural drawing',
  'Electrical layout',
  'Plumbing layout',
  'Staircase details',
  'Elevation drawing',
  '3D elevation / views',
  'Section drawings',
  'Working drawings',
  'Site layout',
] as const;
const isPlanSection = (s: ConstructionSpecSection) =>
  s.kind === 'plans' ||
  (!s.kind && /^(architectural plans|planning & drawings)$/i.test(s.title));
const makeSection = (
  title: string,
  kind: 'plans' | 'material' | 'custom' = 'material',
): ConstructionSpecSection => ({
  title,
  kind,
  ...(kind === 'plans' ? {
    deliverables: planNames.map((name) => ({ label: name, included: false })),
  } : {}),
  fields: [],
  brand: '',
  grade: '',
  description: '',
  allowancePerSqft: '',
});
const palettes = [
  '#155EEF',
  '#089E9C',
  '#7945E8',
  '#F18B31',
  '#E94D69',
  '#334155',
];
const field =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const label = 'grid min-w-0 gap-2 text-xs font-bold text-slate-700';
const money = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);

export function PremiumPackageEditor({
  item,
  close,
}: {
  item?: ConstructionPackage;
  close: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveConstructionPackage, {
    message: '',
  });
  const [name, setName] = useState(item?.name ?? '');
  const [code, setCode] = useState(item?.code ?? '');
  const [rate, setRate] = useState(item?.ratePerSqft ?? '');
  const [status, setStatus] = useState(item?.status ?? 'active');
  const [description, setDescription] = useState(item?.description ?? '');
  const [themeColor, setThemeColor] = useState(item?.themeColor ?? '#155EEF');
  const [sections, setSections] = useState<ConstructionSpecSection[]>(
    item?.specSections?.length
      ? item.specSections.map((section) =>
          isPlanSection(section) ? {
            ...section,
            kind: 'plans' as const,
            brand: '',
            grade: '',
            allowancePerSqft: '',
            deliverables: section.deliverables ??
              planNames.map((name) => ({ label: name, included: false })),
          } : { ...section },
        )
      : defaultCategories.map((record, index) =>
          makeSection(record[0], index === 0 ? 'plans' : 'material'),
        ),
  );
  const [mode, setMode] = useState<'manual' | 'pdf'>('manual');
  const [active, setActive] = useState(0);
  const [attachmentName, setAttachmentName] = useState<string | null>(
    item?.attachmentFilename ?? null,
  );
  const [fileMessage, setFileMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const currentId = state.packageId ?? item?.id;
  const currentVersion = state.version ?? item?.version;
  const fileUrl = currentId
    ? '/dashboard/pricing/construction/packages/' + currentId + '/attachment'
    : null;

  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state.saved, state.packageId, router]);

  useEffect(() => {
    if (!fileUrl) return;
    let alive = true;
    void fetch(fileUrl, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw Error('Could not load PDF');
        return response.json() as Promise<{
          attachment: { filename: string } | null;
        }>;
      })
      .then((data) => {
        if (alive) setAttachmentName(data.attachment?.filename ?? null);
      })
      .catch(() => {
        if (alive) setFileMessage('Could not refresh attached PDF');
      });
    return () => {
      alive = false;
    };
  }, [fileUrl]);

  const updateCustomField = (
    index: number,
    fieldIndex: number,
    key: 'label' | 'value',
    value: string,
  ) => setSections((all) =>
    all.map((spec, i) => i === index
      ? { ...spec, fields: (spec.fields ?? []).map((part, n) =>
        n === fieldIndex ? { ...part, [key]: value } : part) }
      : spec),
  );
  const moveSection = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= sections.length) return;
    setSections((prev) => {
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
      return copy;
    });
    setActive(target);
  };
  const updateSection = (
    index: number,
    key: keyof ConstructionSpecSection,
    value: string,
  ) =>
    setSections((all) =>
      all.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)),
    );

  async function upload(file: File) {
    if (!fileUrl || uploading) return;
    if (
      !/\.pdf$/i.test(file.name) ||
      file.type !== 'application/pdf' ||
      file.size > 15 * 1024 * 1024 ||
      file.size < 10
    ) {
      setFileMessage('Choose a genuine PDF under 15 MB.');
      return;
    }
    setUploading(true);
    setFileMessage('');
    try {
      const data = new FormData();
      data.append('file', file);
      const response = await fetch(fileUrl, {
        method: 'POST',
        credentials: 'same-origin',
        body: data,
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw Error(result.message ?? 'Upload failed');
      setAttachmentName(file.name);
      setFileMessage(result.message ?? 'Specification PDF attached.');
      router.refresh();
    } catch (error) {
      setFileMessage(
        error instanceof Error ? error.message : 'PDF upload failed',
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function removePdf() {
    if (!fileUrl || uploading) return;
    setUploading(true);
    try {
      const response = await fetch(fileUrl, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw Error(result.message ?? 'Could not remove PDF');
      setAttachmentName(null);
      setFileMessage('Package PDF removed.');
      router.refresh();
    } catch (error) {
      setFileMessage(
        error instanceof Error ? error.message : 'Unable to remove PDF',
      );
    } finally {
      setUploading(false);
    }
  }

  const specified = sections.filter((entry) =>
    Boolean(
      entry.description.trim() ||
      entry.brand.trim() ||
      entry.grade.trim() ||
      entry.allowancePerSqft.trim() ||
      entry.deliverables?.some((x) => x.included) ||
      entry.fields?.some((x) => x.label.trim() && x.value.trim()),
    ),
  );
  const previewName = name.trim() || 'Your construction package';
  const exampleAmount = Number(rate) > 0 ? Number(rate) * 1000 : 0;

  return (
    <div className="mt-5 overflow-hidden rounded-[28px] border border-blue-100 bg-[#F7FBFF] shadow-[0_12px_45px_rgba(17,62,131,.08)]">
      <div className="bg-gradient-to-r from-[#E4F7FF] via-[#F7FAFF] to-white px-5 py-6 sm:px-7">
        <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-blue-600">
          Package design studio
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black tracking-tight text-[#0A214B]">
              Construction Package Builder
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Create your package, define specifications and generate a branded
              PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600"
          >
            Close
          </button>
        </div>
        <div className="mt-6 flex items-center justify-between gap-1 text-center text-xs font-bold">
          {['01 Package', '02 Specifications', '03 PDF Output'].map(
            (step, i) => (
              <div key={step} className="flex flex-1 items-center gap-2">
                <span
                  className={
                    'grid min-h-11 flex-1 place-items-center rounded-xl px-1 ' +
                    (i === 0
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-500')
                  }
                >
                  {step}
                </span>
                {i < 2 && <span className="h-px w-3 shrink-0 bg-blue-200" />}
              </div>
            ),
          )}
        </div>
      </div>
      <form action={action} className="space-y-5 p-4 sm:p-7">
        {currentId && (
          <>
            <input type="hidden" name="id" value={currentId} />
            <input type="hidden" name="version" value={currentVersion ?? 1} />
          </>
        )}
        <input type="hidden" name="themeColor" value={themeColor} />
        <input
          type="hidden"
          name="specSections"
          value={JSON.stringify(sections)}
        />
        <div className="rounded-[23px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-blue-100 text-2xl text-blue-700">
              ▤
            </span>
            <div>
              <h4 className="text-lg font-extrabold text-[#0C2149]">
                Package Details
              </h4>
              <p className="text-xs text-slate-500">
                Pricing, specifications, theme and company branding.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={label}>
              Package name *
              <input
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                minLength={2}
                required
                className={field}
                placeholder="Royal Premium Construction"
              />
            </label>
            <label className={label}>
              Package code *
              <input
                name="code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={20}
                pattern="[A-Z][A-Z0-9-]{1,19}"
                required
                className={field}
                placeholder="ROYAL-1950"
              />
            </label>
            <label className={label}>
              Rate per built-up sq ft (₹) *
              <input
                name="ratePerSqft"
                type="number"
                min=".01"
                max="999999.99"
                step=".01"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                required
                className={field}
                placeholder="e.g. 1950"
              />
            </label>
            <label className={label}>
              Status
              <select
                name="status"
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value === 'inactive' ? 'inactive' : 'active',
                  )
                }
                className={field}
              >
                <option value="active">● Available</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-teal-50 p-4">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                <span className="grid size-9 place-items-center rounded-xl bg-white text-lg text-blue-700">
                  ▣
                </span>
                Private to your company
              </div>
              <p className="mt-2 text-xs leading-6 text-slate-600">
                All packages are owned by your company. Authorized team members
                can use your saved rates and specifications. Other companies
                cannot view or reuse your packages.
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <span className="text-xs font-bold text-slate-700">
                Quotation theme color
              </span>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {palettes.map((color) => (
                  <button
                    type="button"
                    key={color}
                    aria-label={'Use PDF theme ' + color}
                    aria-pressed={themeColor === color}
                    onClick={() => setThemeColor(color)}
                    className={
                      'size-10 rounded-full border-[3px] transition ' +
                      (themeColor === color
                        ? 'border-white outline outline-2 outline-blue-600'
                        : 'border-white outline outline-1 outline-slate-200')
                    }
                    style={{ backgroundColor: color }}
                  />
                ))}
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  Custom
                  <input
                    type="color"
                    className="h-9 w-10 cursor-pointer rounded-lg border-0"
                    value={themeColor}
                    onChange={(event) => setThemeColor(event.target.value)}
                    aria-label="Custom PDF accent color"
                  />
                </label>
              </div>
            </div>
            <label className={label + ' sm:col-span-2'}>
              Package inclusions & exclusions
              <textarea
                name="description"
                rows={4}
                maxLength={600}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe construction work, labour, project exclusions, GST and warranty."
                className={field + ' resize-y leading-6'}
              />
              <span className="text-right text-[11px] font-medium text-slate-400">
                {description.length}/600
              </span>
            </label>
          </div>
        </div>

        <div className="rounded-[23px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4">
            <h4 className="text-lg font-extrabold text-[#0C2149]">
              Detailed Specifications
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Edit manufacturer, material grade, price allowance per sq ft and
              inclusions separately. Allowances are descriptive, not extra
              charges.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#EDF3FB] p-1">
            <button
              type="button"
              onClick={() => setMode('manual')}
              aria-pressed={mode === 'manual'}
              className={
                'rounded-lg px-3 py-3 text-xs font-extrabold ' +
                (mode === 'manual'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600')
              }
            >
              ✎ Manual Entry
            </button>
            <button
              type="button"
              onClick={() => setMode('pdf')}
              aria-pressed={mode === 'pdf'}
              className={
                'rounded-lg px-3 py-3 text-xs font-extrabold ' +
                (mode === 'pdf' ? 'bg-blue-600 text-white' : 'text-slate-600')
              }
            >
              ▤ Attach PDF
            </button>
          </div>
          {mode === 'manual' && (
            <>
              <div className="mt-4 space-y-2">
                {sections.map((spec, index) => (
                  <div
                    key={index}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-[#F9FBFF]"
                  >
                    <button
                      type="button"
                      onClick={() => setActive(active === index ? -1 : index)}
                      aria-expanded={active === index}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
                    >
                      <div className="min-w-0">
                        <strong className="block truncate text-sm text-slate-900">
                          {String(index + 1).padStart(2, '0')} · {spec.title}
                        </strong>
                        <span className="block truncate text-xs text-slate-500">
                          {[
                            ...(isPlanSection(spec)
                              ? [
                                  (spec.deliverables ?? []).filter((d) => d.included)
                                    .length + ' drawings included',
                                ]
                              : [
                                  spec.brand,
                                  spec.grade,
                                  spec.allowancePerSqft
                                    ? 'Up to ₹' + spec.allowancePerSqft + '/SFT'
                                    : '',
                                ]),
                            ...(spec.fields?.map((part) =>
                              part.label && part.value
                                ? part.label + ': ' + part.value
                                : '',
                            ) ?? []),
                          ].filter(Boolean).join(' · ') ||
                            'Edit specification and included scope'}
                        </span>
                      </div>
                      <span className="text-lg text-blue-600">
                        {active === index ? '−' : '›'}
                      </span>
                    </button>
                    {active === index && (
                      <div className="grid gap-3 border-t border-slate-200 bg-white p-4 sm:grid-cols-2">
                        <label className={label + ' sm:col-span-2'}>
                          Category name
                          <input
                            className={field}
                            value={spec.title}
                            maxLength={90}
                            onChange={(event) =>
                              updateSection(index, 'title', event.target.value)
                            }
                          />
                        </label>
                        <label className={label + ' sm:col-span-2'}>
                          Category type
                          <select
                            className={field}
                            value={isPlanSection(spec) ? 'plans' : (spec.kind ?? 'material')}
                            onChange={(e) =>
                              setSections((all) => all.map((part, n) =>
                                n !== index ? part : {
                                  ...part,
                                  kind: e.target.value as 'plans' | 'material' | 'custom',
                                  ...(e.target.value === 'plans'
                                    ? {
                                        brand: '',
                                        grade: '',
                                        allowancePerSqft: '',
                                        deliverables: part.deliverables ??
                                          planNames.map((name) => ({ label: name, included: false })),
                                      }
                                    : {}),
                                }),
                              ))
                            }
                          >
                            <option value="plans">Planning / drawings (no brands)</option>
                            <option value="material">Material / finish (brand and grade)</option>
                            <option value="custom">General / custom specification</option>
                          </select>
                        </label>
                        {isPlanSection(spec) ? (
                          <fieldset className="sm:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                            <legend className="px-2 text-xs font-extrabold text-blue-800">
                              Included drawing deliverables
                            </legend>
                            <p className="mb-3 text-xs text-slate-600">
                              Choose the plans included in this package. Rename a drawing or
                              add your own; no brand, grade or material rate is required.
                            </p>
                            <div className="space-y-2">
                              {(spec.deliverables ?? []).map((drawing, drawingIndex) => (
                                <div key={drawingIndex} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
                                  <input
                                    aria-label={'Include ' + drawing.label}
                                    type="checkbox"
                                    checked={drawing.included}
                                    className="size-5 shrink-0 accent-blue-600"
                                    onChange={(e) =>
                                      setSections((all) => all.map((part, n) =>
                                        n === index ? {
                                          ...part,
                                          deliverables: (part.deliverables ?? []).map((d, j) =>
                                            j === drawingIndex ? { ...d, included: e.target.checked } : d),
                                        } : part,
                                      ))
                                    }
                                  />
                                  <input
                                    aria-label={'Drawing ' + (drawingIndex + 1) + ' name'}
                                    className={field + ' flex-1'}
                                    maxLength={90}
                                    value={drawing.label}
                                    onChange={(e) =>
                                      setSections((all) => all.map((part, n) =>
                                        n === index ? {
                                          ...part,
                                          deliverables: (part.deliverables ?? []).map((d, j) =>
                                            j === drawingIndex ? { ...d, label: e.target.value } : d),
                                        } : part,
                                      ))
                                    }
                                  />
                                  <button
                                    type="button"
                                    aria-label={'Remove drawing ' + drawing.label}
                                    className="min-h-10 rounded-lg px-2 text-xs font-bold text-rose-600"
                                    onClick={() =>
                                      setSections((all) => all.map((part, n) =>
                                        n === index ? {
                                          ...part,
                                          deliverables: (part.deliverables ?? []).filter((_, j) => j !== drawingIndex),
                                        } : part,
                                      ))
                                    }
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              disabled={(spec.deliverables?.length ?? 0) >= 16}
                              className="mt-3 rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-xs font-bold text-blue-700 disabled:opacity-40"
                              onClick={() =>
                                setSections((all) => all.map((part, n) =>
                                  n === index ? {
                                    ...part,
                                    deliverables: [...(part.deliverables ?? []), {
                                      label: 'New drawing',
                                      included: true,
                                    }],
                                  } : part,
                                ))
                              }
                            >
                              + Add drawing / plan
                            </button>
                          </fieldset>
                        ) : spec.kind !== 'custom' ? (
                          <>
                            <label className={label}>
                              Brand / manufacturer
                              <input
                                className={field}
                                maxLength={120}
                                value={spec.brand}
                                placeholder="e.g. Tata, UltraTech, Kajaria"
                                onChange={(e) => updateSection(index, 'brand', e.target.value)}
                              />
                            </label>
                            <label className={label}>
                              Grade / material size
                              <input
                                className={field}
                                maxLength={120}
                                value={spec.grade}
                                placeholder="e.g. Fe 550D, OPC 53, 2×2"
                                onChange={(e) => updateSection(index, 'grade', e.target.value)}
                              />
                            </label>
                            <label className={label}>
                              Allowance per sq ft (₹) · optional
                              <input
                                className={field}
                                maxLength={40}
                                value={spec.allowancePerSqft}
                                placeholder="e.g. 85 for vitrified tiles"
                                onChange={(e) => updateSection(index, 'allowancePerSqft', e.target.value)}
                              />
                            </label>
                          </>
                        ) : null}
                        <label className={label + ' sm:col-span-2'}>
                          Scope and inclusions
                          <textarea
                            className={field + ' min-h-28 resize-y'}
                            rows={4}
                            maxLength={600}
                            value={spec.description}
                            placeholder={isPlanSection(spec)
                              ? 'Number of drawing revisions, site visits, 3D views, approvals and exclusions.'
                              : 'Material usage, finish, exclusions, warranty and additional specification details.'}
                            onChange={(event) =>
                              updateSection(
                                index,
                                'description',
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <fieldset className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <legend className="px-2 text-xs font-extrabold text-slate-800">
                            Custom fields
                          </legend>
                          <p className="mb-3 text-xs text-slate-600">
                            Add your own labelled fields, such as drawing revisions,
                            approved brand, warranty, thickness or finish. They will
                            appear in the generated quotation PDF.
                          </p>
                          <div className="space-y-2">
                            {(spec.fields ?? []).map((part, fieldIndex) => (
                              <div key={fieldIndex} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]">
                                <input
                                  className={field}
                                  aria-label={'Custom field ' + (fieldIndex + 1) + ' name'}
                                  placeholder="Field label"
                                  maxLength={80}
                                  value={part.label}
                                  onChange={(e) => updateCustomField(index, fieldIndex, 'label', e.target.value)}
                                />
                                <input
                                  className={field}
                                  aria-label={'Custom field ' + (fieldIndex + 1) + ' value'}
                                  placeholder="Field value"
                                  maxLength={250}
                                  value={part.value}
                                  onChange={(e) => updateCustomField(index, fieldIndex, 'value', e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="min-h-10 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-600"
                                  onClick={() => setSections((all) => all.map((section, n) =>
                                    n === index ? {
                                      ...section,
                                      fields: (section.fields ?? []).filter((_, j) => j !== fieldIndex),
                                    } : section,
                                  ))}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={(spec.fields?.length ?? 0) >= 10}
                            onClick={() => setSections((all) => all.map((section, n) =>
                              n === index ? {
                                ...section,
                                fields: [...(section.fields ?? []), {
                                  label: 'New field',
                                  value: '',
                                }],
                              } : section,
                            ))}
                            className="mt-3 min-h-10 rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-bold text-blue-700 disabled:opacity-40"
                          >
                            + Add field
                          </button>
                        </fieldset>
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          <button type="button" disabled={index === 0}
                            onClick={() => moveSection(index, -1)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-30">
                            ↑ Move up
                          </button>
                          <button type="button" disabled={index === sections.length - 1}
                            onClick={() => moveSection(index, 1)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-30">
                            ↓ Move down
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSections((items) =>
                              items.filter((_, i) => i !== index),
                            );
                            setActive(-1);
                          }}
                          className="justify-self-start text-xs font-bold text-rose-600"
                        >
                          Remove category
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={sections.length >= 18}
                onClick={() => {
                  setSections((items) => [
                    ...items,
                    makeSection('Custom category', 'custom'),
                  ]);
                  setActive(sections.length);
                }}
                className="mt-4 w-full rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 disabled:opacity-50"
              >
                + Add specification category
              </button>
            </>
          )}
          {mode === 'pdf' && (
            <div className="mt-4 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-5">
              <strong className="text-sm text-slate-900">
                Upload your existing material specification PDF
              </strong>
              <p className="mt-2 text-xs leading-6 text-slate-600">
                One private PDF per package, up to 15 MB and 60 pages. It will
                be snapshotted into the quotation when the client quote is
                saved, then appended after the pricing and manual specification
                pages.
              </p>
              {!currentId && (
                <p className="mt-2 text-xs font-bold text-amber-700">
                  Save the package first to enable PDF uploads.
                </p>
              )}
              <input
                type="file"
                ref={fileInput}
                accept="application/pdf,.pdf"
                disabled={!currentId || uploading}
                aria-label="Upload package specification PDF"
                className="mt-4 w-full text-xs text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-3 file:font-bold file:text-white disabled:opacity-40"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-[23px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h4 className="text-base font-extrabold text-slate-900">
              ▤ Attached specification PDF
            </h4>
            {attachmentName ? (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="break-all text-sm font-bold text-blue-800">
                  📄 {attachmentName}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {fileUrl && (
                    <a
                      href={fileUrl + '?download=1'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700"
                    >
                      View PDF ↗
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={!fileUrl || uploading}
                    onClick={() => void removePdf()}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-xs text-slate-500">
                No PDF attached. Manual specifications still generate a branded
                proposal, or select Attach PDF above.
              </p>
            )}
            <p className="mt-4 rounded-lg bg-[#EBF5FF] px-3 py-3 text-xs leading-5 text-[#34629A]">
              The price calculation and company-brand pages always come first.
              Attached PDFs are added afterwards, in customer download order.
            </p>
            {fileMessage && (
              <p role="status" className="mt-3 text-xs text-slate-700">
                {uploading ? 'Uploading… ' : ''}
                {fileMessage}
              </p>
            )}
          </section>
          <section className="rounded-[23px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h4 className="text-base font-extrabold text-slate-900">
              ◉ Quotation PDF Preview
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Illustrative 1,000 SFT template — client totals are calculated
              separately from actual floor measurements.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="min-h-48 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div
                  className="rounded-lg px-2 py-2 text-xs font-black text-white"
                  style={{ backgroundColor: themeColor }}
                >
                  CONSTRUCTION QUOTE
                </div>
                <h5 className="mt-3 break-words text-xs font-extrabold text-slate-900">
                  {previewName}
                </h5>
                <p className="mt-2 text-[10px] text-slate-500">
                  Sample pricing · 1,000 SFT
                </p>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="flex justify-between gap-1 text-[10px]">
                    <span>Built-up floor area</span>
                    <span>1,000 SFT</span>
                  </div>
                  <div className="mt-2 flex justify-between gap-1 border-t border-slate-100 pt-2 text-[10px] font-bold">
                    <span>Indicative total</span>
                    <span>{exampleAmount ? money(exampleAmount) : '—'}</span>
                  </div>
                </div>
                <p className="mt-6 text-center text-[10px] text-slate-400">
                  Page 1 · Cost calculation
                </p>
              </div>
              <div className="min-h-48 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div
                  className="rounded-lg px-2 py-2 text-xs font-black text-white"
                  style={{ backgroundColor: themeColor }}
                >
                  PACKAGE SPECS
                </div>
                <h5 className="mt-3 text-xs font-extrabold text-slate-900">
                  Material & finishes
                </h5>
                {specified.slice(0, 5).map((spec, index) => (
                  <div
                    key={index}
                    className="mt-2 border-b border-slate-100 pb-1"
                  >
                    <strong className="block truncate text-[10px]">
                      {spec.title}
                    </strong>
                    <span className="block truncate text-[9px] text-slate-500">
                      {spec.brand ||
                        spec.grade ||
                        spec.description ||
                        'Included'}
                    </span>
                  </div>
                ))}
                {specified.length === 0 && (
                  <p className="mt-3 text-[10px] text-slate-400">
                    Enter specifications to preview them.
                  </p>
                )}
                <p className="mt-4 text-center text-[10px] text-slate-400">
                  Page 2 · Specifications
                </p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-teal-50 p-3 text-xs leading-5 text-teal-800">
              ✦ Manual specifications become branded A4 PDF pages using this
              theme. Uploaded PDF pages retain their own original design.
            </p>
          </section>
        </div>
        {state.message && (
          <p
            role={state.saved ? 'status' : 'alert'}
            className={
              'rounded-xl p-3 text-sm ' +
              (state.saved
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-amber-50 text-amber-900')
            }
          >
            {state.message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4">
          <button
            disabled={pending}
            type="submit"
            className="min-h-12 flex-1 rounded-xl bg-blue-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-blue-100 disabled:opacity-40"
          >
            {pending ? 'Saving package…' : '▣ Save package'}
          </button>
          {currentId ? (
            <a
              className="min-h-12 flex-1 rounded-xl border border-blue-200 bg-blue-50 px-6 py-3 text-center text-sm font-extrabold text-blue-700"
              href={
                '/dashboard/pricing/construction/packages/' +
                currentId +
                '/preview'
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Preview branded PDF ↗
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="min-h-12 flex-1 rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold text-slate-400"
            >
              Save before PDF preview
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
