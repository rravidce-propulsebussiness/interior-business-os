'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import type { QuotationPackage } from '@business-os/database/quotation-packages';
import { PremiumPackageEditor } from '../../pricing/construction/premium-package-editor';
import {
  installConstructionBrochurePackages, duplicateConstructionPackage, deleteConstructionPackage,
} from '../../pricing/construction/package-actions';
import { IndustryPackageEditor } from '../package-manager';
import { duplicateQuotationPackage, deleteQuotationPackage } from '../package-actions';
import './package-library.css';

type Industry = { key: string; name: string };
type CatalogItem =
  | { kind: 'construction'; item: ConstructionPackage }
  | { kind: 'other'; item: QuotationPackage };
type EditorState = { kind: 'construction' | 'other'; id: string } | null;

const features = [
  { symbol: '▣', title: 'Premium Templates', caption: 'Ready-to-use packages' },
  { symbol: '✧', title: 'Fully Customizable', caption: 'Edit scope, brands & pricing' },
  { symbol: '▤', title: 'Beautiful PDF', caption: 'Generated from saved details' },
  { symbol: '⌂', title: 'Your Own Packages', caption: 'Create, edit or delete anytime' },
];
const cash = (value: string | number, currency = 'INR') => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return String(value) + ' ' + currency;
  }
};

function featureList(entry: CatalogItem): string[] {
  if (entry.kind === 'construction') {
    const spec = (entry.item.specSections || []).filter((s) =>
      s.title && !/floor[- ]?pricing|floor rate/i.test(s.title));
    return spec.slice(0, 5).map((s) =>
      s.title + (s.brand ? ' · ' + s.brand : ''));
  }
  const sentences = entry.item.description.split(/\r?\n|[•;]+/)
    .map((line) => line.trim()).filter(Boolean);
  return sentences.slice(0, 5);
}

function quoteLink(entry: CatalogItem): string {
  const params = new URLSearchParams({
    package: entry.item.id,
    industry: entry.kind === 'construction' ? 'construction' : entry.item.industryKey,
  });
  return '/dashboard/quotations/new?' + params.toString();
}

export function PackageLibrary({
  construction, other, industries, canManage, currency,
}: {
  construction: ConstructionPackage[];
  other: QuotationPackage[] | null;
  industries: Industry[];
  canManage: boolean;
  currency: string;
}) {
  const [tab, setTab] = useState<'construction' | 'other'>('construction');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EditorState>(null);
  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [remove, setRemove] = useState<CatalogItem | null>(null);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentItems: CatalogItem[] = tab === 'construction'
    ? construction.map((item) => ({kind:'construction', item}))
    : (other ?? []).map((item) => ({kind:'other', item}));
  const sorted = [...currentItems].sort((a,b) => {
    if (a.kind === 'construction' && b.kind === 'construction') {
      const order = ['STANDARD', 'PREMIUM', 'LUXURY', 'ROYAL'];
      const ia = order.indexOf(a.item.code), ib = order.indexOf(b.item.code);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) ||
        a.item.name.localeCompare(b.item.name);
    }
    return a.item.name.localeCompare(b.item.name);
  });
  const visible = sorted.filter((entry) =>
    (filter === 'all' || entry.item.status === filter) &&
    (search.trim() === '' ||
      [entry.item.name, entry.item.code, entry.item.description].join(' ')
        .toLowerCase().includes(search.trim().toLowerCase())),
  );
  const selectedItem = editing ? (editing.kind === 'construction'
    ? construction.find((p) => p.id === editing.id)
    : (other ?? []).find((p) => p.id === editing.id)) : null;
  const activeIndustries = industries.filter((i) => i.key !== 'construction');
  const isOpen = Boolean(editing || detail || remove);

  useEffect(() => {
    if (!isOpen) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {setEditing(null);setDetail(null);setRemove(null);}
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  function refreshWith(task: () => Promise<{ok:boolean;message:string}>) {
    setMessage('');
    start(async () => {
      try {
        const result = await task();
        setMessage(result.message);
        if (result.ok) {
          setEditing(null); setRemove(null); setDetail(null);
          router.refresh();
        }
      } catch {
        setMessage('Could not update the package. Please try again.');
      }
    });
  }
  function duplicate(entry: CatalogItem) {
    refreshWith(() => entry.kind === 'construction'
      ? duplicateConstructionPackage(entry.item.id)
      : duplicateQuotationPackage(entry.item.id));
  }
  function deleteSelected(entry: CatalogItem) {
    refreshWith(() => entry.kind === 'construction'
      ? deleteConstructionPackage(entry.item.id, entry.item.version)
      : deleteQuotationPackage(entry.item.id, entry.item.version));
  }
  const addAllowed = canManage && (tab === 'construction' || activeIndustries.length > 0);
  const addStarter = canManage && tab === 'construction' &&
    !['STANDARD','PREMIUM','LUXURY','ROYAL'].every((code) =>
      construction.some((item) => item.code === code));

  return (
    <div className="qpl">
      <div className="qpl-header">
        <div>
          <span className="qpl-eyebrow">QUOTATIONS / PACKAGES</span>
          <h1>Package Library</h1>
          <p>Use pre-defined packages or create a custom quote for your client.</p>
        </div>
        {addAllowed && (
          <button className="qpl-add" type="button"
            onClick={() => setEditing({kind:tab, id:'new'})}>
            <span aria-hidden="true">＋</span> Add New Package
          </button>
        )}
      </div>

      <div className="qpl-tabs" role="tablist" aria-label="Package industry">
        <button type="button" role="tab" aria-selected={tab === 'construction'}
          className={tab === 'construction' ? 'is-active' : ''}
          onClick={() => {setTab('construction');setFilter('all');setSearch('');}}>
          <span aria-hidden="true">⌂</span> Construction Packages
          <span className="qpl-count">{construction.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'other'}
          className={tab === 'other' ? 'is-active' : ''}
          onClick={() => {setTab('other');setFilter('all');setSearch('');}}>
          <span aria-hidden="true">▧</span> Interior &amp; Other Packages
          <span className="qpl-count">{other?.length ?? 0}</span>
        </button>
      </div>

      <div className="qpl-features" aria-label="Package benefits">
        {features.map((item) => <div className="qpl-feature" key={item.title}>
          <span className="qpl-feature-icon" aria-hidden="true">{item.symbol}</span>
          <div><strong>{item.title}</strong><small>{item.caption}</small></div>
        </div>)}
      </div>

      <div className="qpl-section-header">
        <div>
          <h2>{tab === 'construction' ? 'Construction Packages' : 'Interior & Other Packages'}</h2>
          <p>Select a package to create a quote or customize as per client requirement.</p>
        </div>
        <div className="qpl-filters">
          <label className="qpl-search">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search packages..." aria-label="Search packages" />
          </label>
          <label className="qpl-filter">
            <span className="sr-only">Package status</span>
            <select value={filter} onChange={(e) =>
              setFilter(e.target.value as typeof filter)}>
              <option value="all">All Packages</option>
              <option value="active">Active Packages</option>
              <option value="inactive">Inactive Packages</option>
            </select>
          </label>
        </div>
      </div>
      {message && <div role="status" className="qpl-message">{message}</div>}
      {addStarter && <div className="qpl-starter">
        <span>Missing a standard construction package template?</span>
        <button type="button" disabled={pending}
          onClick={() => refreshWith(installConstructionBrochurePackages)}>
          {pending ? 'Working…' : 'Add starter packages'}
        </button>
      </div>}

      <section className="qpl-cards" role="tabpanel"
        aria-label={tab === 'construction' ? 'Construction package cards' : 'Interior package cards'}>
        {visible.slice(0, 3).map((entry,index) => renderCard(entry,index))}
        {renderCustom()}
        {visible.slice(3).map((entry,index) => renderCard(entry,index+3))}
      </section>
      {visible.length === 0 && <p className="qpl-empty">
        No matching saved packages. You can still create a Custom Quote using the card above.
      </p>}
      {other === null && tab === 'other' && <p className="qpl-warning">
        Industry package storage is not available yet. Custom quotations are still accessible;
        ask your administrator to apply the pending quotation packages migration.
      </p>}

      {(editing || detail || remove) && <div className="qpl-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setEditing(null);setDetail(null);setRemove(null);
          }
        }}>
        <div className={'qpl-dialog' + (editing?.kind === 'construction' ? ' qpl-dialog-wide' : '')}
          ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true"
          aria-label={editing ? 'Package editor' : remove ? 'Delete package' : 'Package details'}>
          <button type="button" className="qpl-close" aria-label="Close dialog"
            onClick={() => {setEditing(null);setDetail(null);setRemove(null);}}>×</button>
          {editing?.kind === 'construction' && (
            <PremiumPackageEditor key={editing.id + ':' + (selectedItem?.version ?? '')}
              {...(selectedItem && 'ratePerSqft' in selectedItem
                ? { item: selectedItem } : {})}
              close={() => {setEditing(null);router.refresh();}}/>
          )}
          {editing?.kind === 'other' && activeIndustries.length > 0 && (
            <IndustryPackageEditor key={editing.id + ':' + (selectedItem?.version ?? '')}
              {...(selectedItem && 'basePrice' in selectedItem
                ? { item: selectedItem } : {})}
              industries={activeIndustries} currency={currency}
              onClose={() => {setEditing(null);router.refresh();}}/>
          )}
          {detail && <div className="qpl-details">
            <span className="qpl-details-tag">{detail.item.code}</span>
            <h2>{detail.item.name}</h2>
            <p>{detail.item.description || 'Company specifications can be added in the package editor.'}</p>
            <strong>{detail.kind === 'construction'
              ? cash(detail.item.ratePerSqft) + ' / sq ft'
              : cash(detail.item.basePrice,detail.item.currency)}</strong>
            <h3>Specifications &amp; inclusions</h3>
            <ul>{featureList(detail).map((line,index) => <li key={index}>{line}</li>)}</ul>
            {featureList(detail).length === 0 && <p>Specifications have not been added yet.</p>}
            <div className="qpl-dialog-actions">
              {detail.kind === 'construction' && <Link target="_blank" rel="noopener noreferrer"
                className="qpl-btn-secondary"
                href={'/dashboard/pricing/construction/packages/' + detail.item.id + '/preview?format=pdf'}>
                Preview Package PDF
              </Link>}
              {detail.item.status === 'active' && <Link className="qpl-btn-primary"
                href={quoteLink(detail)}>Use Package →</Link>}
              {canManage && <button type="button" className="qpl-btn-secondary"
                onClick={() => {setEditing({kind:detail.kind,id:detail.item.id});setDetail(null);}}>
                Edit Package
              </button>}
            </div>
          </div>}
          {remove && <div className="qpl-confirm">
            <h2>Delete {remove.item.name}?</h2>
            <p>This removes the company package from the available catalogue.
              Existing issued quotations remain unchanged.</p>
            <div className="qpl-dialog-actions">
              <button type="button" className="qpl-danger" disabled={pending}
                onClick={() => deleteSelected(remove)}>{pending ? 'Deleting…' : 'Confirm Delete'}</button>
              <button type="button" className="qpl-btn-secondary"
                onClick={() => setRemove(null)}>Cancel</button>
            </div>
          </div>}
        </div>
      </div>}
    </div>
  );

  function renderCard(entry: CatalogItem, index: number) {
    const current = entry.item;
    const active = current.status === 'active';
    const rows = featureList(entry);
    const title = current.name;
    const className = entry.kind === 'construction' ? 'construction' : 'interior';
    return <article className={'qpl-card ' + (!active ? 'qpl-card-inactive' : '')}
      key={entry.kind + ':' + current.id}>
      <div className={'qpl-cover qpl-cover-' + className + ' qpl-photo-' + (index % 4 + 1)}>
        <span className="qpl-cover-label">{current.code}</span>
        {!active && <span className="qpl-cover-inactive">Inactive</span>}
      </div>
      <div className="qpl-card-body">
        <h3>{title}</h3>
        <p className="qpl-description">
          {current.description || 'Company-defined specifications and materials'}
        </p>
        <div className="qpl-price">{entry.kind === 'construction'
          ? cash(entry.item.ratePerSqft) : cash(entry.item.basePrice,entry.item.currency)}
          <span>{entry.kind === 'construction' ? 'per sq ft'
            : entry.item.pricingBasis === 'fixed' ? 'fixed price'
              : entry.item.pricingBasis === 'per_sqft' ? 'per sq ft'
                : entry.item.pricingBasis === 'per_bhk' ? 'per BHK' : 'per item'}</span>
        </div>
        <ul className="qpl-specs">
          {rows.length > 0 ? rows.map((line,i)=>
            <li key={i}><span aria-hidden="true">✓</span>{line}</li>) :
            <li><span aria-hidden="true">✓</span>Editable materials, brands and scope</li>}
        </ul>
        <div className="qpl-card-actions">
          <button type="button" className="qpl-btn-secondary"
            onClick={() => setDetail(entry)}>View Details</button>
          {active
            ? <Link className="qpl-btn-primary" href={quoteLink(entry)}>Use Package <span aria-hidden="true">→</span></Link>
            : <span className="qpl-btn-disabled">Inactive Package</span>}
        </div>
        {canManage && <div className="qpl-manage">
          <button type="button" onClick={() => setEditing({kind:entry.kind,id:current.id})}>Edit</button>
          <button type="button" disabled={pending} onClick={() => duplicate(entry)}>Duplicate</button>
          <button type="button" disabled={pending} onClick={() => setRemove(entry)}>Delete</button>
        </div>}
      </div>
    </article>;
  }

  function renderCustom() {
    return <article className="qpl-custom" key="custom">
      <div className="qpl-custom-heading"><span aria-hidden="true">⚙</span>
        <div><h3>Custom Quote</h3><p>Tailored to every client</p></div>
      </div>
      <p>Create a fully customized quote with your own specifications,
        material brands, quantities and pricing.</p>
      <ul>
        {['Add or modify BOQ items','Choose your own brands',
          'Set custom pricing','Use editable item descriptions',
          'Generate a branded customer PDF'].map((line)=>
            <li key={line}><span aria-hidden="true">✓</span>{line}</li>)}
      </ul>
      <Link className="qpl-custom-cta" href="/dashboard/quotations/new?mode=custom">
        Create Custom Quote <span aria-hidden="true">→</span>
      </Link>
      <small>Uses the existing quotation editor. No package is required.</small>
    </article>;
  }
}
