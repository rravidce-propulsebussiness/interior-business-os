'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import { PremiumPackageEditor } from './premium-package-editor';
import {
  installConstructionBrochurePackages,
  duplicateConstructionPackage,
  deleteConstructionPackage,
} from './package-actions';

const brochureCodes = new Set(['STANDARD', 'PREMIUM', 'LUXURY', 'ROYAL']);
const cash = (value: string) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(Number(value));

export function ConstructionPackagesManager({
  packages, canManage,
}: { packages: ConstructionPackage[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'custom' | 'inactive'>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const sorted = [...packages].sort((a, b) => {
    const order = ['STANDARD', 'PREMIUM', 'LUXURY', 'ROYAL'];
    const ia = order.indexOf(a.code), ib = order.indexOf(b.code);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
  });
  const visible = sorted.filter((pkg) =>
    filter === 'all' || (filter === 'custom' ? !brochureCodes.has(pkg.code) : pkg.status === filter)
  );
  function run(task: () => Promise<{ ok: boolean; message: string }>) {
    setMessage('');
    start(async () => {
      const result = await task();
      setMessage(result.message);
      if (result.ok) { setConfirmDelete(null); setEditing(null); router.refresh(); }
    });
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Quotation studio / construction</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Construction packages</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Build company-specific packages with detailed brands, material grades, allowances,
            warranties and PDF specifications. Other companies cannot see or edit these packages.
          </p>
        </div>
        {canManage && <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => run(installConstructionBrochurePackages)}
            className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-bold text-orange-700 hover:bg-orange-100 disabled:opacity-50">
            Import 4 brochure packages
          </button>
          <button type="button" onClick={() => setEditing(editing === 'new' ? null : 'new')}
            className="rounded-xl bg-orange-600 px-5 py-3 text-xs font-bold text-white hover:bg-orange-700">
            + New package
          </button>
        </div>}
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter construction packages">
        {([
          ['all', 'All packages', packages.length],
          ['active', 'Active', packages.filter((p) => p.status === 'active').length],
          ['custom', 'Custom', packages.filter((p) => !brochureCodes.has(p.code)).length],
          ['inactive', 'Inactive', packages.filter((p) => p.status === 'inactive').length],
        ] as const).map(([key, label, count]) => (
          <button type="button" key={key} onClick={() => setFilter(key)}
            aria-pressed={filter === key} className={
              'rounded-full border px-4 py-2 text-xs font-bold transition ' +
              (filter === key ? 'border-orange-600 bg-orange-600 text-white' :
                'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100')
            }>
            {label} ({count})
          </button>
        ))}
      </div>

      {message && <p role="status" className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</p>}
      {editing === 'new' && canManage && <div className="mt-5"><PremiumPackageEditor close={() => setEditing(null)} /></div>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((item) => (
          <article key={item.id}
            className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between gap-2 px-4 pt-4">
              <span className="rounded-full px-2 py-1 text-[10px] font-extrabold tracking-widest text-white"
                style={{ backgroundColor: item.themeColor }}>{item.code}</span>
              <span className={'text-[11px] font-bold ' +
                (item.status === 'active' ? 'text-emerald-700' : 'text-amber-700')}>{item.status}</span>
            </div>
            <div className="px-4 pt-4">
              <h3 className="text-lg font-black text-slate-950">{item.name}</h3>
              <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: item.themeColor }}>
                {cash(item.ratePerSqft)}<span className="ml-1 text-xs font-semibold text-slate-500">/ sq ft</span>
              </p>
              <p className="mt-3 line-clamp-3 min-h-14 text-xs leading-5 text-slate-600">
                {item.description || 'Create a detailed construction package with your company specifications.'}
              </p>
              <div className="my-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-700">
                <p>✓ {item.specSections?.length ?? 0} editable specification categories</p>
                <p>✓ {item.attachmentFilename ? 'Original specification PDF attached' : 'Company-branded generated PDF'}</p>
                <p>✓ {brochureCodes.has(item.code) ? 'Brochure starter · fully editable' : 'Custom company package'}</p>
              </div>
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-4">
              <Link href={'/dashboard/pricing/construction/packages/' + item.id + '/preview'}
                target="_blank" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
                Preview PDF
              </Link>
              {canManage && <>
                <button type="button" onClick={() => setEditing(editing === item.id ? null : item.id)}
                  className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white">
                  Edit
                </button>
                <button type="button" disabled={pending}
                  onClick={() => run(() => duplicateConstructionPackage(item.id))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
                  Duplicate
                </button>
                <button type="button" onClick={() => setConfirmDelete(item.id)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">
                  Delete
                </button>
              </>}
            </div>
            {canManage && confirmDelete === item.id && <div className="border-t border-red-100 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-bold">Delete {item.name}?</p>
              <p className="mt-1 text-xs">The package and its source PDF will be removed. Issued quotations remain unchanged.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={pending} onClick={() => run(() => deleteConstructionPackage(item.id, item.version))}
                  className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  Confirm delete
                </button>
                <button type="button" onClick={() => setConfirmDelete(null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">Cancel</button>
              </div>
            </div>}
          </article>
        ))}
      </div>

      {canManage && editing !== null && editing !== 'new' && packages
        .filter((item) => item.id === editing)
        .map((item) => (
          <div key={item.id + ':' + item.version} className="mt-6 scroll-mt-20" id="construction-package-editor">
            <PremiumPackageEditor item={item} close={() => setEditing(null)} />
          </div>
        ))}

      {visible.length === 0 && <p className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        No matching packages. Choose New package, or import the four editable brochure starters.
      </p>}
    </section>
  );
}
