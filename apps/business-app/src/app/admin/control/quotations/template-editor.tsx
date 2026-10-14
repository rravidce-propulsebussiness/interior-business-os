'use client';
import { useActionState, useState } from 'react';
import type { ConstructionSpecTemplateEntry } from '@business-os/database/construction-packages';
import { updateConstructionSpecDefaults } from './template-actions';

export function AdminSpecTemplateEditor({ initial }: { initial: ConstructionSpecTemplateEntry[] }) {
  const [sections, setSections] = useState(initial.map((x) => ({ ...x })));
  const [status, action, pending] = useActionState(updateConstructionSpecDefaults, { message: '' });
  const change = (i: number, next: Partial<ConstructionSpecTemplateEntry>) =>
    setSections((items) => items.map((item, j) => j === i ? { ...item, ...next } : item));
  const move = (i: number, offset: number) =>
    setSections((items) => {
      const j = i + offset;
      if (j < 0 || j >= items.length) return items;
      const next = [...items];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  return (
    <form action={action} className="rounded-3xl border border-blue-200 bg-white p-6 shadow-sm">
      <input type="hidden" name="sections" value={JSON.stringify(sections)} />
      <h2 className="text-xl font-extrabold text-slate-950">Specification defaults</h2>
      <p className="mt-2 text-sm text-slate-600">Configure category names and plan deliverables for newly created company packages. Each company controls its own package rates.</p>
      <div className="mt-5 space-y-3">
        {sections.map((section, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-bold">Category name
                <input maxLength={90} value={section.title}
                  onChange={(e) => change(index, { title: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm" />
              </label>
              <label className="grid gap-2 text-xs font-bold">Category type
                <select value={section.kind} onChange={(e) =>
                  change(index, { kind: e.target.value as ConstructionSpecTemplateEntry['kind'] })}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <option value="plans">Architectural plans & drawings</option>
                  <option value="material">Materials & brands</option>
                  <option value="custom">Custom specification fields</option>
                </select>
              </label>
            </div>
            {section.kind === 'plans' && (
              <label className="mt-3 grid gap-2 text-xs font-bold">
                Default included drawings (one per line)
                <textarea rows={5} value={section.deliverables.join('\n')}
                  onChange={(e) => change(index, {
                    deliverables: e.target.value.split('\n').slice(0, 16),
                  })}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm" />
              </label>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={index === 0}
                onClick={() => move(index, -1)} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-30">Move up</button>
              <button type="button" disabled={index === sections.length - 1}
                onClick={() => move(index, 1)} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-30">Move down</button>
              <button type="button"
                onClick={() => setSections((items) => items.filter((_, j) => j !== index))}
                className="rounded-lg border px-3 py-2 text-xs text-rose-600">Remove</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={sections.length >= 18}
          onClick={() => setSections((items) => [...items, {
            title: 'New category', kind: 'custom', deliverables: [],
          }])}
          className="rounded-xl border border-blue-200 px-4 py-3 text-sm font-bold text-blue-700">
          + Add category
        </button>
        <button type="submit" disabled={pending || !sections.length}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">
          {pending ? 'Saving…' : 'Save defaults'}
        </button>
      </div>
      {status.message && <p role="status" className="mt-3 text-sm">{status.message}</p>}
    </form>
  );
}
