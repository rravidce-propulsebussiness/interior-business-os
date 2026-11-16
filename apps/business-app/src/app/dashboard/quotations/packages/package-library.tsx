'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ConstructionRate } from '@business-os/database/construction-rates';
import { CustomPackageManager } from './custom-package-manager';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import type { QuotationPackage } from '@business-os/database/quotation-packages';
import { PremiumPackageEditor } from '../../pricing/construction/premium-package-editor';
import {
  duplicateConstructionPackage,
  deleteConstructionPackage,
  installConstructionBrochurePackages,
} from '../../pricing/construction/package-actions';
import { IndustryPackageEditor } from '../package-manager';
import {
  duplicateQuotationPackage,
  deleteQuotationPackage,
} from '../package-actions';
import './package-library.css';

type Industry = { key: string; name: string };
type CatalogItem =
  | { kind: 'construction'; item: ConstructionPackage }
  | { kind: 'other'; item: QuotationPackage };
type EditorState = { kind: 'construction' | 'other'; id: string } | null;

const cash = (value: string | number, currency = 'INR') => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return String(value) + ' ' + currency;
  }
};

function featureList(entry: CatalogItem): string[] {
  if (entry.kind === 'construction') {
    const spec = (entry.item.specSections || []).filter(
      (s) => s.title && !/floor[- ]?pricing|floor rate/i.test(s.title),
    );
    return spec
      .slice(0, 5)
      .map((s) => s.title + (s.brand ? ' · ' + s.brand : ''));
  }
  const sentences = entry.item.description
    .split(/\r?\n|[•;]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return sentences.slice(0, 5);
}

function quoteLink(entry: CatalogItem): string {
  const params = new URLSearchParams({
    package: entry.item.id,
    industry:
      entry.kind === 'construction' ? 'construction' : entry.item.industryKey,
  });
  return '/dashboard/quotations/new?' + params.toString();
}

export function PackageLibrary({
  construction,
  rates,
  other,
  industries,
  canManage,
  currency,
}: {
  construction: ConstructionPackage[];
  rates: ConstructionRate[];
  other: QuotationPackage[] | null;
  industries: Industry[];
  canManage: boolean;
  currency: string;
}) {
  const [tab, setTab] = useState<'construction' | 'other'>('construction');
  const [showCustomManagement, setShowCustomManagement] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EditorState>(null);
  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [remove, setRemove] = useState<CatalogItem | null>(null);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<[string, string]>(['', '']);
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentItems: CatalogItem[] =
    tab === 'other'
      ? (other ?? []).map((item) => ({ kind: 'other', item }))
      : construction.map((item) => ({ kind: 'construction', item }));
  const sorted = [...currentItems].sort((a, b) => {
    if (a.kind === 'construction' && b.kind === 'construction') {
      const order = ['STANDARD', 'PREMIUM', 'ROYAL', 'LUXURY'];
      const ia = order.indexOf(a.item.code),
        ib = order.indexOf(b.item.code);
      return (
        (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) ||
        a.item.name.localeCompare(b.item.name)
      );
    }
    return a.item.name.localeCompare(b.item.name);
  });
  const visible = sorted.filter(
    (entry) =>
      (filter === 'all' || entry.item.status === filter) &&
      (search.trim() === '' ||
        [entry.item.name, entry.item.code, entry.item.description]
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  );
  const selectedItem = editing
    ? editing.kind === 'construction'
      ? construction.find((p) => p.id === editing.id)
      : (other ?? []).find((p) => p.id === editing.id)
    : null;
  const activeIndustries = industries.filter((i) => i.key !== 'construction');
  const isOpen = Boolean(editing || detail || remove || compareOpen);

  useEffect(() => {
    if (!isOpen) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditing(null);
        setDetail(null);
        setRemove(null);
        setCompareOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  function refreshWith(task: () => Promise<{ ok: boolean; message: string }>) {
    setMessage('');
    start(async () => {
      try {
        const result = await task();
        setMessage(result.message);
        if (result.ok) {
          setEditing(null);
          setRemove(null);
          setDetail(null);
          router.refresh();
        }
      } catch {
        setMessage('Could not update the package. Please try again.');
      }
    });
  }
  function duplicate(entry: CatalogItem) {
    refreshWith(() =>
      entry.kind === 'construction'
        ? duplicateConstructionPackage(entry.item.id)
        : duplicateQuotationPackage(entry.item.id),
    );
  }
  function deleteSelected(entry: CatalogItem) {
    refreshWith(() =>
      entry.kind === 'construction'
        ? deleteConstructionPackage(entry.item.id, entry.item.version)
        : deleteQuotationPackage(entry.item.id, entry.item.version),
    );
  }
  const addAllowed =
    canManage && (tab === 'construction' || activeIndustries.length > 0);
  const missingStarterCodes = ['STANDARD', 'PREMIUM', 'ROYAL'].filter(
    (code) => !construction.some((item) => item.code === code),
  );

  return (
    <div className="qpl">
      <div className="qpl-header">
        <div className="qpl-heading">
          <span className="qpl-eyebrow">QUOTATIONS / PACKAGES</span>
          <h1>Package Library</h1>
          <p>Manage, edit and compare your company packages.</p>
        </div>
        <div className="qpl-header-actions">
          {addAllowed && (
            <button
              className="qpl-add"
              type="button"
              onClick={() => setEditing({ kind: tab, id: 'new' })}
            >
              <span className="qpl-action-icon" aria-hidden="true">
                ＋
              </span>{' '}
              Add Package
            </button>
          )}
          <button
            className="qpl-compare"
            type="button"
            disabled={
              currentItems.filter((p) => p.item.status === 'active').length < 2
            }
            onClick={() => {
              setCompareIds(['', '']);
              setCompareOpen(true);
            }}
          >
            <span className="qpl-action-icon" aria-hidden="true">
              ▥
            </span>{' '}
            Compare
          </button>
          <button
            className={
              'qpl-manage-custom-top' +
              (showCustomManagement ? ' is-selected' : '')
            }
            type="button"
            aria-pressed={showCustomManagement}
            onClick={() => setShowCustomManagement((value) => !value)}
          >
            <span className="qpl-action-icon" aria-hidden="true">
              ⚙
            </span>
            {showCustomManagement
              ? 'View Packages'
              : 'Custom Package Management'}
          </button>
        </div>
      </div>

      <div className="qpl-tabs" role="tablist" aria-label="Package industry">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'construction'}
          className={tab === 'construction' ? 'is-active' : ''}
          onClick={() => {
            setTab('construction');
            setShowCustomManagement(false);
            setFilter('all');
            setSearch('');
          }}
        >
          <span className="qpl-tab-symbol" aria-hidden="true">
            ⌂
          </span>
          <span>Construction Packages</span>
          <span className="qpl-count">{construction.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'other'}
          className={tab === 'other' ? 'is-active' : ''}
          onClick={() => {
            setTab('other');
            setShowCustomManagement(false);
            setFilter('all');
            setSearch('');
          }}
        >
          <span className="qpl-tab-symbol" aria-hidden="true">
            ▧
          </span>
          <span>Interior &amp; Other Packages</span>
          <span className="qpl-count">{other?.length ?? 0}</span>
        </button>
      </div>

      {!showCustomManagement && (
        <div className="qpl-section-header">
          <div className="qpl-section-title">
            <h2>
              {tab === 'construction'
                ? 'Construction Packages'
                : 'Interior & Other Packages'}
            </h2>
          </div>
          <div className="qpl-filters">
            <label className="qpl-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search packages..."
                aria-label="Search packages"
              />
            </label>
            <label className="qpl-filter">
              <span className="sr-only">Package status</span>
              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as typeof filter)
                }
              >
                <option value="all">All Packages</option>
                <option value="active">Active Packages</option>
                <option value="inactive">Inactive Packages</option>
              </select>
            </label>
          </div>
        </div>
      )}
      {message && (
        <div role="status" className="qpl-message">
          {message}
        </div>
      )}
      {!showCustomManagement &&
        tab === 'construction' &&
        canManage &&
        missingStarterCodes.length > 0 && (
          <section
            className="qpl-starter"
            aria-label="Construction starter package templates"
          >
            <span>
              <strong>Standard · Premium · Royal</strong>
              <br />
              Add{' '}
              {missingStarterCodes.length === 3
                ? 'the three original'
                : 'the missing'}{' '}
              editable construction package templates. Existing packages,
              quotations and your edits stay unchanged.
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => refreshWith(installConstructionBrochurePackages)}
            >
              {pending ? 'Adding…' : 'Add Missing Templates'}
            </button>
          </section>
        )}
      {!showCustomManagement && (
        <>
          <section
            className="qpl-cards"
            role="tabpanel"
            aria-label={
              tab === 'construction'
                ? 'Construction package cards'
                : 'Interior package cards'
            }
          >
            {visible.map((entry, index) => renderCard(entry, index))}
          </section>
          {visible.length === 0 && (
            <p className="qpl-empty">
              No matching saved packages.{' '}
              {canManage
                ? 'Add the original templates above or create your own.'
                : 'Try another filter.'}
            </p>
          )}
          {other === null && tab === 'other' && (
            <p className="qpl-warning">
              Interior package storage is unavailable. Ask your administrator to
              apply the package migration.
            </p>
          )}
        </>
      )}
      {showCustomManagement && (
        <CustomPackageManager rates={rates} canManage={canManage} />
      )}
      {(editing || detail || remove || compareOpen) && (
        <div
          className="qpl-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditing(null);
              setDetail(null);
              setRemove(null);
              setCompareOpen(false);
            }
          }}
        >
          <div
            className={
              'qpl-dialog' +
              (editing?.kind === 'construction' ? ' qpl-dialog-wide' : '')
            }
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={
              editing
                ? 'Package editor'
                : remove
                  ? 'Delete package'
                  : 'Package details'
            }
          >
            <button
              type="button"
              className="qpl-close"
              aria-label="Close dialog"
              onClick={() => {
                setEditing(null);
                setDetail(null);
                setRemove(null);
                setCompareOpen(false);
              }}
            >
              ×
            </button>
            {compareOpen && (
              <div className="qpl-compare-dialog">
                <h2>Compare Packages</h2>
                <p>
                  Choose any two company packages to compare their prices and
                  inclusions.
                </p>
                <div className="qpl-compare-selects">
                  {[0, 1].map((slot) => (
                    <label key={slot}>
                      Package {slot + 1}
                      <select
                        value={compareIds[slot]}
                        onChange={(event) =>
                          setCompareIds((curr) =>
                            slot === 0
                              ? [event.target.value, curr[1]]
                              : [curr[0], event.target.value],
                          )
                        }
                      >
                        <option value="">Choose package</option>
                        {currentItems
                          .filter((entry) => entry.item.status === 'active')
                          .map((entry) => (
                            <option value={entry.item.id} key={entry.item.id}>
                              {entry.item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </div>
                {compareIds[0] &&
                  compareIds[1] &&
                  compareIds[0] !== compareIds[1] && (
                    <div className="qpl-comparison">
                      {compareIds.map((id) => {
                        const entry = currentItems.find(
                          (p) => p.item.id === id,
                        );
                        if (!entry) return null;
                        return (
                          <article key={id}>
                            <h3>{entry.item.name}</h3>
                            <p className="qpl-comparison-price">
                              {entry.kind === 'construction'
                                ? cash(entry.item.ratePerSqft) + ' / SFT'
                                : cash(
                                    entry.item.basePrice,
                                    entry.item.currency,
                                  )}
                            </p>
                            <ul>
                              {featureList(entry).map((s, i) => (
                                <li key={i}>✓ {s}</li>
                              ))}
                            </ul>
                            <Link
                              className="qpl-btn-primary"
                              href={quoteLink(entry)}
                            >
                              Use Package →
                            </Link>
                          </article>
                        );
                      })}
                    </div>
                  )}
                {compareIds[0] === compareIds[1] && compareIds[0] && (
                  <p className="qpl-warning">Choose two different packages.</p>
                )}
              </div>
            )}
            {editing?.kind === 'construction' && (
              <PremiumPackageEditor
                key={editing.id + ':' + (selectedItem?.version ?? '')}
                {...(selectedItem && 'ratePerSqft' in selectedItem
                  ? { item: selectedItem }
                  : {})}
                close={() => {
                  setEditing(null);
                  router.refresh();
                }}
              />
            )}
            {editing?.kind === 'other' && activeIndustries.length > 0 && (
              <IndustryPackageEditor
                key={editing.id + ':' + (selectedItem?.version ?? '')}
                {...(selectedItem && 'basePrice' in selectedItem
                  ? { item: selectedItem }
                  : {})}
                industries={activeIndustries}
                currency={currency}
                onClose={() => {
                  setEditing(null);
                  router.refresh();
                }}
              />
            )}
            {detail && (
              <div className="qpl-details">
                <span className="qpl-details-tag">{detail.item.code}</span>
                <h2>{detail.item.name}</h2>
                <p>
                  {detail.item.description ||
                    'Company specifications can be added in the package editor.'}
                </p>
                <strong>
                  {detail.kind === 'construction'
                    ? cash(detail.item.ratePerSqft) + ' / sq ft'
                    : cash(detail.item.basePrice, detail.item.currency)}
                </strong>
                <h3>Specifications &amp; inclusions</h3>
                <ul>
                  {featureList(detail).map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
                {featureList(detail).length === 0 && (
                  <p>Specifications have not been added yet.</p>
                )}
                <div className="qpl-dialog-actions">
                  {detail.kind === 'construction' && (
                    <Link
                      target="_blank"
                      rel="noopener noreferrer"
                      className="qpl-btn-secondary"
                      href={
                        '/dashboard/pricing/construction/packages/' +
                        detail.item.id +
                        '/preview?format=pdf'
                      }
                    >
                      Preview Package PDF
                    </Link>
                  )}
                  {detail.item.status === 'active' && (
                    <Link className="qpl-btn-primary" href={quoteLink(detail)}>
                      Use Package →
                    </Link>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      className="qpl-btn-secondary"
                      onClick={() => {
                        setEditing({ kind: detail.kind, id: detail.item.id });
                        setDetail(null);
                      }}
                    >
                      Edit Package
                    </button>
                  )}
                </div>
              </div>
            )}
            {remove && (
              <div className="qpl-confirm">
                <h2>Delete {remove.item.name}?</h2>
                <p>
                  This removes the company package from the available catalogue.
                  Existing issued quotations remain unchanged.
                </p>
                <div className="qpl-dialog-actions">
                  <button
                    type="button"
                    className="qpl-danger"
                    disabled={pending}
                    onClick={() => deleteSelected(remove)}
                  >
                    {pending ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    type="button"
                    className="qpl-btn-secondary"
                    onClick={() => setRemove(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function renderCard(entry: CatalogItem, index: number) {
    const current = entry.item;
    const active = current.status === 'active';
    const specs = featureList(entry);
    const title = current.name;
    const kind = entry.kind === 'construction' ? 'construction' : 'interior';
    const price =
      entry.kind === 'construction'
        ? cash(entry.item.ratePerSqft)
        : cash(entry.item.basePrice, entry.item.currency);
    const basis =
      entry.kind === 'construction'
        ? 'per SFT'
        : entry.item.pricingBasis === 'fixed'
          ? 'fixed price'
          : entry.item.pricingBasis === 'per_sqft'
            ? 'per SFT'
            : entry.item.pricingBasis === 'per_bhk'
              ? 'per BHK'
              : 'per item';
    return (
      <article
        className={'qpl-card ' + (!active ? 'qpl-card-inactive' : '')}
        key={entry.kind + ':' + current.id}
      >
        <button
          type="button"
          aria-label={'View ' + title + ' details'}
          className={
            'qpl-cover qpl-cover-' + kind + ' qpl-photo-' + ((index % 4) + 1)
          }
          onClick={() => setDetail(entry)}
        >
          <span className="qpl-cover-label">{current.code}</span>
          {!active && <span className="qpl-cover-inactive">Inactive</span>}
        </button>
        <div className="qpl-card-body">
          <div className="qpl-card-top">
            <div className="qpl-card-copy">
              <button
                type="button"
                className="qpl-card-title"
                onClick={() => setDetail(entry)}
              >
                {title}
              </button>
              <p className="qpl-description">
                {current.description ||
                  'Company-defined construction and material specifications.'}
              </p>
            </div>
            <div className="qpl-price">
              <strong>{price}</strong>
              <span>{basis}</span>
            </div>
          </div>
          <div className="qpl-card-meta" aria-label="Package highlights">
            <span>
              <span aria-hidden="true">⌂</span> {specs[0] || 'Project scope'}
            </span>
            <span>
              <span aria-hidden="true">▱</span>{' '}
              {specs[1] || 'Material specifications'}
            </span>
            <span>
              <span aria-hidden="true">◺</span>{' '}
              {basis === 'per SFT'
                ? Number(
                    entry.kind === 'construction'
                      ? entry.item.ratePerSqft
                      : entry.item.basePrice,
                  ).toLocaleString('en-IN') + ' / SFT'
                : basis}
            </span>
          </div>
          {canManage ? (
            <div className="qpl-manage" aria-label={title + ' package actions'}>
              <button
                type="button"
                onClick={() => setEditing({ kind: entry.kind, id: current.id })}
              >
                <span aria-hidden="true">✎</span> Edit
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => duplicate(entry)}
              >
                <span aria-hidden="true">▢</span> Duplicate
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setRemove(entry)}
              >
                <span aria-hidden="true">♜</span> Delete
              </button>
            </div>
          ) : (
            <div className="qpl-manage qpl-manage-viewer">
              <button type="button" onClick={() => setDetail(entry)}>
                View Details
              </button>
              {active && (
                <Link className="qpl-btn-primary" href={quoteLink(entry)}>
                  Use Package →
                </Link>
              )}
            </div>
          )}
        </div>
      </article>
    );
  }
}
