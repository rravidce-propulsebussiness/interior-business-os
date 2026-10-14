'use client';

import { useState } from 'react';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import { PremiumPackageEditor } from './premium-package-editor';

export function ConstructionPackagesManager({
  packages,
  canManage,
}: {
  packages: ConstructionPackage[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
            Option 1 · fixed package pricing
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-slate-950">
            Packages per sq ft
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Create branded company packages with detailed material grades,
            per-SFT allowances and your own PDF specifications. Every
            package stays private to your company.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing(editing === 'new' ? null : 'new')}
            className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white"
          >
            + Create package
          </button>
        )}
      </div>
      {editing === 'new' && (
        <PremiumPackageEditor
          close={() => setEditing(null)}
        />
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {packages.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
            style={{ borderTop: '4px solid ' + item.themeColor }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-500">
                {item.code}
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
                Company package
              </span>
              <span
                className={
                  'text-xs font-semibold ' +
                  (item.status === 'active'
                    ? 'text-emerald-700'
                    : 'text-slate-400')
                }
              >
                {item.status}
              </span>
            </div>
            <h3 className="mt-3 text-lg font-extrabold text-slate-950">
              {item.name}
            </h3>
            <p className="mt-2 text-xl font-black text-blue-700">
              ₹{Number(item.ratePerSqft).toLocaleString('en-IN')}/sq ft
            </p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
              {item.description || 'Scope not yet described'}
            </p>
            <p className="mt-2 text-[11px] font-bold text-slate-500">
              {item.specSections?.length ?? 0} categories ·{' '}
              {item.attachmentFilename
                ? 'PDF attached'
                : 'Manual specifications'}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={() => setEditing(editing === item.id ? null : item.id)}
                className="mt-4 rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-bold text-blue-700"
              >
                Edit package
              </button>
            )}
          </article>
        ))}
      </div>
      {canManage &&
        editing !== null &&
        editing !== 'new' &&
        packages
          .filter((item) => item.id === editing)
          .map((item) => (
            <PremiumPackageEditor
              key={item.id + ':' + item.version}
              item={item}
              close={() => setEditing(null)}
            />
          ))}
      {packages.length === 0 && (
        <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">
          No company packages yet. Create a rate and a scope to enable package
          quotations.
        </p>
      )}
    </section>
  );
}
