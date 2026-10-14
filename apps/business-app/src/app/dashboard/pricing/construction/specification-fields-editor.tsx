'use client';

import { useState } from 'react';
import {
  ARCHITECTURAL_PLAN_OPTIONS,
  constructionSectionKind,
  makeConstructionSection,
  type ConstructionSpecKind,
  type ConstructionSpecSection,
} from '@business-os/core/construction-specifications';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelClass = 'grid gap-1.5 text-xs font-bold text-slate-600';

export function SpecificationFieldsEditor({
  sections,
  onChange,
  maxSections = 18,
  heading = 'Specification categories',
}: {
  sections: ConstructionSpecSection[];
  onChange: (sections: ConstructionSpecSection[]) => void;
  maxSections?: number;
  heading?: string;
}) {
  const [open, setOpen] = useState<number>(0);
  const update = (index: number, next: Partial<ConstructionSpecSection>) =>
    onChange(sections.map((s, i) => (i === index ? { ...s, ...next } : s)));
  const swap = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return;
    const rows = [...sections];
    const selected = rows.splice(from, 1)[0];
    if (!selected) return;
    rows.splice(to, 0, selected);
    onChange(rows);
    setOpen(to);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-extrabold text-slate-900">{heading}</h4>
        <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700">
          {sections.length} / {maxSections} categories
        </span>
      </div>
      {sections.map((section, index) => {
        const kind = constructionSectionKind(section);
        const selectedDrawings = section.deliverables ?? [];
        const customFields = section.extraFields ?? [];
        return (
          <article key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-3">
              <button
                type="button"
                aria-expanded={open === index}
                aria-label={'Edit ' + section.title}
                onClick={() => setOpen(open === index ? -1 : index)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-100 text-xs font-extrabold text-blue-700">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-slate-900">{section.title}</strong>
                  <span className="text-[11px] text-slate-500">
                    {kind === 'plans'
                      ? selectedDrawings.length + ' included drawing deliverables'
                      : kind === 'custom'
                        ? 'Scope and editable custom fields'
                        : 'Brand, grade, material allowance and scope'}
                  </span>
                </span>
              </button>
              <button type="button" onClick={() => swap(index, index - 1)}
                disabled={index === 0} aria-label={'Move ' + section.title + ' up'}
                className="rounded-lg px-2 py-2 text-slate-500 disabled:opacity-30">↑</button>
              <button type="button" onClick={() => swap(index, index + 1)}
                disabled={index === sections.length - 1}
                aria-label={'Move ' + section.title + ' down'}
                className="rounded-lg px-2 py-2 text-slate-500 disabled:opacity-30">↓</button>
              <button type="button" onClick={() => setOpen(open === index ? -1 : index)}
                aria-label={open === index ? 'Collapse' : 'Expand'}
                className="rounded-lg px-2 py-2 text-blue-700">
                {open === index ? '−' : '+'}
              </button>
            </div>
            {open === index && (
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <label className={labelClass + ' sm:col-span-2'}>
                  Category name
                  <input className={inputClass} maxLength={90} value={section.title}
                    onChange={(event) => update(index, { title: event.target.value })} />
                </label>
                <label className={labelClass + ' sm:col-span-2'}>
                  Category type
                  <select className={inputClass} value={kind}
                    onChange={(event) => {
                      const selected = event.target.value as ConstructionSpecKind;
                      update(index, {
                        kind: selected,
                        ...(selected === 'plans'
                          ? { brand: '', grade: '', allowancePerSqft: '',
                              deliverables: section.deliverables ?? [] }
                          : { deliverables: [] }),
                      });
                    }}>
                    <option value="plans">Plans &amp; design deliverables (no brands)</option>
                    <option value="material">Materials &amp; brands</option>
                    <option value="custom">General scope / terms</option>
                  </select>
                </label>
                {kind === 'plans' && (
                  <fieldset className="sm:col-span-2">
                    <legend className="mb-2 text-xs font-extrabold text-slate-700">
                      Included drawings and deliverables
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[...new Set([...ARCHITECTURAL_PLAN_OPTIONS, ...selectedDrawings])].map((drawing) => (
                        <label key={drawing}
                          className="flex min-h-11 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs font-bold text-slate-700">
                          <input type="checkbox" className="size-4 accent-blue-600"
                            checked={selectedDrawings.includes(drawing)}
                            onChange={(event) => update(index, {
                              deliverables: event.target.checked
                                ? [...selectedDrawings, drawing]
                                : selectedDrawings.filter((s) => s !== drawing),
                            })} />
                          {drawing}
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input className={inputClass} maxLength={90}
                        aria-label="New plan deliverable" placeholder="Custom drawing, e.g. Vastu plan"
                        id={'new-drawing-' + index} />
                      <button type="button" className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white"
                        onClick={() => {
                          const element = document.getElementById('new-drawing-' + index) as HTMLInputElement | null;
                          const value = element?.value.trim() ?? '';
                          if (!value || selectedDrawings.length >= 20 || selectedDrawings.includes(value)) return;
                          update(index, { deliverables: [...selectedDrawings, value] });
                          if (element) element.value = '';
                        }}>+ Add plan</button>
                    </div>
                  </fieldset>
                )}
                {kind === 'material' && (
                  <>
                    {([
                      ['brand', 'Brand / manufacturer', 'e.g. Tata, UltraTech, Kajaria'],
                      ['grade', 'Grade / material size', 'e.g. Fe 550D, OPC 53, 2×2'],
                      ['allowancePerSqft', 'Allowance per SFT (₹), if applicable', 'e.g. 85 for vitrified tiles'],
                    ] as const).map(([fieldName, fieldLabel, placeholder]) => (
                      <label key={fieldName} className={labelClass}>
                        {fieldLabel}
                        <input className={inputClass}
                          value={section[fieldName]} maxLength={fieldName === 'allowancePerSqft' ? 40 : 120}
                          placeholder={placeholder}
                          onChange={(event) => update(index, { [fieldName]: event.target.value })} />
                      </label>
                    ))}
                  </>
                )}
                <label className={labelClass + ' sm:col-span-2'}>
                  {kind === 'plans' ? 'Drawing scope & delivery notes' : 'Scope, inclusions & notes'}
                  <textarea className={inputClass + ' min-h-28 resize-y'}
                    maxLength={600} rows={4} value={section.description}
                    onChange={(event) => update(index, { description: event.target.value })} />
                </label>
                <div className="sm:col-span-2">
                  <p className="mb-2 text-xs font-bold text-slate-700">
                    Additional fields (custom labels and values)
                  </p>
                  <div className="space-y-2">
                    {customFields.map((field, j) => (
                      <div key={j} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2">
                        <input className={inputClass} value={field.label} maxLength={70}
                          aria-label={'Field name ' + (j + 1)}
                          placeholder="Field name"
                          onChange={(event) => update(index, {
                            extraFields: customFields.map((x, k) => k === j
                              ? { ...x, label: event.target.value } : x),
                          })} />
                        <input className={inputClass} value={field.value} maxLength={250}
                          aria-label={'Field value ' + (j + 1)}
                          placeholder="Value / detail"
                          onChange={(event) => update(index, {
                            extraFields: customFields.map((x, k) => k === j
                              ? { ...x, value: event.target.value } : x),
                          })} />
                        <button type="button" className="rounded-xl border border-rose-100 px-3 text-rose-600"
                          aria-label={'Remove field ' + (j + 1)}
                          onClick={() => update(index, { extraFields: customFields.filter((_, k) => k !== j) })}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" disabled={customFields.length >= 8}
                    className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-700 disabled:opacity-40"
                    onClick={() => update(index, {
                      extraFields: [...customFields, { label: 'Custom field', value: '' }],
                    })}>
                    + Add editable field
                  </button>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button type="button"
                    className="rounded-lg px-3 py-2 text-xs font-bold text-rose-600"
                    onClick={() => {
                      onChange(sections.filter((_, i) => index !== i));
                      setOpen(-1);
                    }}>
                    Remove category
                  </button>
                </div>
              </div>
            )}
          </article>
        );
      })}
      <button type="button" disabled={sections.length >= maxSections}
        onClick={() => {
          onChange([...sections, makeConstructionSection('Custom category', 'custom')]);
          setOpen(sections.length);
        }}
        className="w-full rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 disabled:opacity-40">
        + Add category
      </button>
    </section>
  );
}
