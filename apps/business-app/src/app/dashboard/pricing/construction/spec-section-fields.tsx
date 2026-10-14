'use client';

import type { ConstructionSpecSection } from '@business-os/database/construction-packages';

const field =
  'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const label = 'grid gap-2 text-xs font-bold text-slate-700';
const planOptions = [
  'Architectural floor plan',
  'Structural drawing',
  'Electrical layout',
  'Plumbing layout',
  'Staircase detail',
  'Elevation design',
  '3D views',
  'Working drawings',
  'Section drawing',
  'Furniture layout',
];

export function SpecSectionFields({
  section,
  onChange,
}: {
  section: ConstructionSpecSection;
  onChange: (next: ConstructionSpecSection) => void;
}) {
  const kind =
    section.kind ??
    (/architectural|planning|drawings/i.test(section.title)
      ? 'plans'
      : 'material');
  const change = (patch: Partial<ConstructionSpecSection>) =>
    onChange({ ...section, ...patch });
  const drawings = section.deliverables ?? [];
  const extras = section.fields ?? [];
  return (
    <>
      <label className={label + ' sm:col-span-2'}>
        Specification type
        <select
          className={field}
          value={kind}
          onChange={(e) => {
            const next = e.target.value as 'plans' | 'material' | 'custom';
            change({
              kind: next,
              deliverables:
                next === 'plans' && drawings.length === 0
                  ? planOptions.map((name) => ({ label: name, included: true }))
                  : drawings,
              brand: next === 'material' ? section.brand : '',
              grade: next === 'material' ? section.grade : '',
              allowancePerSqft:
                next === 'material' ? section.allowancePerSqft : '',
            });
          }}
        >
          <option value="plans">Plans & drawings (no brand fields)</option>
          <option value="material">Material / manufacturer / grade</option>
          <option value="custom">General scope & custom fields</option>
        </select>
      </label>
      {kind === 'plans' && (
        <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
          <h5 className="text-sm font-extrabold text-blue-900">
            Architectural & engineering deliverables
          </h5>
          <p className="mt-1 text-xs text-slate-600">
            Select the drawings included in this package. Rename or add drawings
            to match your company services.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {drawings.map((drawing, index) => (
              <div
                key={index}
                className="flex min-w-0 items-center gap-2 rounded-xl bg-white p-2"
              >
                <input
                  className="size-4 accent-blue-600"
                  aria-label={'Include ' + drawing.label}
                  type="checkbox"
                  checked={drawing.included}
                  onChange={(e) =>
                    change({
                      deliverables: drawings.map((entry, i) =>
                        i === index
                          ? { ...entry, included: e.target.checked }
                          : entry,
                      ),
                    })
                  }
                />
                <input
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2 text-xs"
                  aria-label={'Drawing label ' + (index + 1)}
                  maxLength={90}
                  value={drawing.label}
                  onChange={(e) =>
                    change({
                      deliverables: drawings.map((entry, i) =>
                        i === index
                          ? { ...entry, label: e.target.value }
                          : entry,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  aria-label={'Remove drawing ' + drawing.label}
                  onClick={() =>
                    change({
                      deliverables: drawings.filter((_, i) => i !== index),
                    })
                  }
                  className="rounded-lg px-2 py-2 text-xs font-bold text-rose-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={drawings.length >= 16}
            onClick={() =>
              change({
                deliverables: [
                  ...drawings,
                  { label: 'New drawing', included: true },
                ],
              })
            }
            className="mt-3 rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-bold text-blue-700 disabled:opacity-40"
          >
            + Add plan / drawing
          </button>
        </div>
      )}
      {kind === 'material' && (
        <>
          <label className={label}>
            Brand / manufacturer
            <input
              className={field}
              maxLength={120}
              value={section.brand}
              placeholder="Manufacturer or approved brand"
              onChange={(e) => change({ brand: e.target.value })}
            />
          </label>
          <label className={label}>
            Grade / material size
            <input
              className={field}
              maxLength={120}
              value={section.grade}
              placeholder="Fe 550D, OPC 53, 2×2 tiles..."
              onChange={(e) => change({ grade: e.target.value })}
            />
          </label>
          <label className={label}>
            Material allowance per sq ft (₹) · optional
            <input
              className={field}
              maxLength={40}
              value={section.allowancePerSqft}
              onChange={(e) => change({ allowancePerSqft: e.target.value })}
              placeholder="85"
            />
          </label>
        </>
      )}
      <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h5 className="mb-1 text-sm font-extrabold text-slate-900">
          Custom specification fields
        </h5>
        <p className="mb-4 text-xs text-slate-500">
          Add a label and value. The exact fields print on the branded PDF.
        </p>
        <div className="space-y-2">
          {extras.map((entry, index) => (
            <div
              key={index}
              className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
            >
              <input
                className={field}
                maxLength={80}
                value={entry.label}
                aria-label={'Custom field label ' + (index + 1)}
                placeholder="Field name"
                onChange={(e) =>
                  change({
                    fields: extras.map((x, i) =>
                      i === index ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <input
                className={field}
                maxLength={250}
                value={entry.value}
                aria-label={'Custom field value ' + (index + 1)}
                placeholder="Field value / notes"
                onChange={(e) =>
                  change({
                    fields: extras.map((x, i) =>
                      i === index ? { ...x, value: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                aria-label={'Remove custom field ' + entry.label}
                onClick={() =>
                  change({ fields: extras.filter((_, i) => i !== index) })
                }
                className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-bold text-rose-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={extras.length >= 10}
          onClick={() =>
            change({
              fields: [...extras, { label: 'New field', value: '' }],
            })
          }
          className="mt-3 min-h-11 rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-bold text-blue-700 disabled:opacity-40"
        >
          + Add field
        </button>
      </div>
    </>
  );
}
