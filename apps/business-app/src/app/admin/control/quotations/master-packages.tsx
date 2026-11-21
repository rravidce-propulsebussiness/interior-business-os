'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { OsIcon } from '../../dashboard-shell';
import {
  saveMasterQuotationPackage,
  setMasterQuotationPackageStatus,
} from './master-actions';

export type MasterSpec = {
  title: string;
  brand: string;
  grade: string;
  description: string;
  allowancePerSqft: string;
  unit:
    | 'none'
    | 'sqft'
    | 'bathroom'
    | 'door'
    | 'piece'
    | 'kg'
    | 'tonne'
    | 'bag'
    | 'cubic_meter'
    | 'running_ft'
    | 'point'
    | 'lumpsum'
    | 'meter'
    | 'bhk';
  pricingTreatment: 'included' | 'allowance' | 'extra' | 'excluded';
  allowanceValue: string;
};
export type MasterPackage = {
  id: string;
  industryKey: string;
  name: string;
  code: string;
  description: string;
  pricingBasis: 'fixed' | 'per_sqft' | 'per_bhk' | 'per_unit';
  basePrice: string;
  currency: string;
  themeColor: string;
  specSections: MasterSpec[];
  status: 'draft' | 'published' | 'archived';
  version: number;
  publishedAt: string | null;
  companyCount: number;
};
export type IndustryOption = { key: string; name: string };
type Draft = Omit<
  MasterPackage,
  'id' | 'version' | 'status' | 'publishedAt' | 'companyCount'
> & {
  id?: string;
  version?: number;
};
type Tab = 'specifications' | 'boq' | 'payments' | 'distribution';

const money = (n: string | number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
const emptySpec = (title = 'New specification'): MasterSpec => ({
  title,
  brand: '',
  grade: '',
  description: '',
  allowancePerSqft: '',
  unit: 'none',
  pricingTreatment: 'included',
  allowanceValue: '',
});
const starterNames = [
  'Structure & Civil',
  'Walls & Masonry',
  'Doors & Windows',
  'Flooring & Tiles',
  'Electrical',
  'Plumbing & Sanitary',
  'Painting & Finishes',
  'Warranty & Support',
];
const initialDraft = (industryKey: string): Draft => ({
  industryKey,
  code: '',
  name: '',
  description: '',
  pricingBasis: industryKey === 'construction' ? 'per_sqft' : 'fixed',
  basePrice: '',
  currency: 'INR',
  themeColor: '#88352B',
  specSections: starterNames.map(emptySpec),
});
const normalize = (p: MasterPackage): Draft => ({
  id: p.id,
  version: p.version,
  industryKey: p.industryKey,
  code: p.code,
  name: p.name,
  description: p.description,
  pricingBasis: p.pricingBasis,
  basePrice: p.basePrice,
  currency: p.currency,
  themeColor: p.themeColor,
  specSections: p.specSections.map((s) => ({ ...emptySpec(), ...s })),
});
const sortPackages = (a: MasterPackage, b: MasterPackage) => {
  const order = ['STANDARD', 'PREMIUM', 'LUXURY', 'ROYAL'];
  const ai = order.indexOf(a.code),
    bi = order.indexOf(b.code);
  return (
    (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name)
  );
};
const tabs: {
  value: Tab;
  name: string;
  icon: 'marketplace' | 'quotation' | 'billing' | 'users';
}[] = [
  { value: 'specifications', name: 'Specifications', icon: 'marketplace' },
  { value: 'boq', name: 'BOQ & Inclusions', icon: 'quotation' },
  { value: 'payments', name: 'Payment Stages', icon: 'billing' },
  { value: 'distribution', name: 'Distribution', icon: 'users' },
];

export function MasterPackageStudio({
  packages,
  industries,
  canManage,
  error,
}: {
  packages: MasterPackage[];
  industries: IndustryOption[];
  canManage: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [industry, setIndustry] = useState('construction');
  const [selectedId, setSelectedId] = useState<string | null>(
    packages.find(
      (p) => p.code === 'PREMIUM' && p.industryKey === 'construction',
    )?.id ??
      packages[0]?.id ??
      null,
  );
  const [tab, setTab] = useState<Tab>('specifications');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, start] = useTransition();

  const filtered = useMemo(
    () => packages.filter((p) => p.industryKey === industry).sort(sortPackages),
    [industry, packages],
  );
  const selected =
    filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null;
  const published = packages.filter((p) => p.status === 'published');
  const copies = packages.reduce(
    (sum, p) => sum + Number(p.companyCount || 0),
    0,
  );
  const latest = published
    .map((p) => p.publishedAt)
    .filter((value): value is string => !!value)
    .sort()
    .at(-1);
  const previewData: Draft | null =
    draft && editing ? draft : selected ? normalize(selected) : null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0]!.id);
    }
  }, [selectedId, filtered]);

  function changeIndustry(key: string) {
    setIndustry(key);
    setSelectedId(
      packages.find((p) => p.industryKey === key && p.code === 'PREMIUM')?.id ??
        packages.find((p) => p.industryKey === key)?.id ??
        null,
    );
    setEditing(false);
    setDraft(null);
    setTab('specifications');
    setExpanded(null);
  }
  function choose(item: MasterPackage) {
    setSelectedId(item.id);
    setEditing(false);
    setDraft(null);
    setExpanded(null);
    setTab('specifications');
    setMessage('');
  }
  function create() {
    if (!canManage) return;
    setDraft(initialDraft(industry));
    setEditing(true);
    setSelectedId(null);
    setTab('specifications');
    setExpanded(null);
    setMessage('');
  }
  function beginEdit() {
    if (!selected || !canManage) return;
    setDraft(normalize(selected));
    setEditing(true);
    setTab('specifications');
    setMessage('');
  }
  function duplicate() {
    if (!selected || !canManage) return;
    const next = normalize(selected);
    delete next.id;
    delete next.version;
    next.name = selected.name + ' Copy';
    next.code = (selected.code.slice(0, 14) + '-COPY').slice(0, 20);
    setDraft(next);
    setEditing(true);
    setSelectedId(null);
    setTab('specifications');
    setMessage('Review the new package before saving.');
  }
  function update(field: keyof Draft, value: unknown) {
    setDraft((old) => (old ? ({ ...old, [field]: value } as Draft) : old));
  }
  function updateSpec(index: number, field: keyof MasterSpec, value: string) {
    setDraft((old) =>
      old
        ? {
            ...old,
            specSections: old.specSections.map((s, i) =>
              i === index ? { ...s, [field]: value } : s,
            ),
          }
        : old,
    );
  }
  function save() {
    if (!draft || busy || !canManage) return;
    if (
      !draft.name.trim() ||
      !draft.code.trim() ||
      !(Number(draft.basePrice) > 0)
    ) {
      setMessage('Enter a package name, code and valid base rate.');
      return;
    }
    setMessage('');
    start(async () => {
      const result = await saveMasterQuotationPackage(draft);
      setMessage(result.message);
      if (result.ok) {
        setEditing(false);
        setDraft(null);
        setSelectedId(result.id ?? null);
        router.refresh();
      }
    });
  }
  function statusChange(status: 'published' | 'archived') {
    if (!selected || busy || !canManage) return;
    setMessage('');
    start(async () => {
      const result = await setMasterQuotationPackageStatus({
        id: selected.id,
        version: selected.version,
        status,
      });
      setMessage(result.message);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }
  const hasCustomPlaceholder =
    industry === 'construction' && !filtered.some((p) => p.code === 'CUSTOM');
  const activeIndustry =
    industries.find((i) => i.key === industry)?.name ?? 'Construction';
  const categories = previewData?.specSections ?? [];
  return (
    <div className="master-packages">
      <header className="mp-head">
        <div className="mp-head-copy">
          <div className="mp-breadcrumb">
            SUPER ADMIN <span>/</span> QUOTATIONS <span>/</span> MASTER PACKAGES
          </div>
          <h1>Master Quotation Packages</h1>
          <p>
            Create standard quotation packages and distribute to companies. Each
            company can customize its own copy.
          </p>
        </div>
        <div className="mp-head-actions">
          <label className="mp-industry">
            <OsIcon name="projects" size={18} />
            <span>Industry:</span>
            <select
              aria-label="Select industry"
              value={industry}
              onChange={(e) => changeIndustry(e.target.value)}
            >
              {!industries.some((i) => i.key === 'construction') && (
                <option value="construction">Construction</option>
              )}
              {industries.map((i) => (
                <option value={i.key} key={i.key}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          {canManage && (
            <button
              type="button"
              className="mp-button primary"
              onClick={create}
            >
              <span className="mp-add">+</span> Create Package
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="mp-notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="mp-notice" role="status">
          {message}
        </p>
      )}
      <section className="mp-metrics" aria-label="Master package overview">
        <div className="mp-metric">
          <span className="mp-metric-icon">
            <OsIcon name="marketplace" size={24} />
          </span>
          <div>
            <small>Total Packages</small>
            <strong>{packages.length}</strong>
          </div>
        </div>
        <div className="mp-metric">
          <span className="mp-metric-icon">
            <OsIcon name="users" size={24} />
          </span>
          <div>
            <small>Company Copies</small>
            <strong>{copies}</strong>
          </div>
        </div>
        <div className="mp-metric">
          <span className="mp-metric-icon">
            <OsIcon name="settings" size={24} />
          </span>
          <div>
            <small>Last Published</small>
            <strong className="mp-metric-date">
              {latest
                ? new Date(latest).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Not yet'}
            </strong>
          </div>
        </div>
        <div className="mp-metric mp-metric-enabled">
          <span className="mp-metric-icon">
            <OsIcon name="check" size={24} />
          </span>
          <div>
            <small>Auto Distribution</small>
            <strong>{error ? 'Unavailable' : 'Enabled'}</strong>
          </div>
        </div>
      </section>

      <div className="mp-layout">
        <div className="mp-left">
          <section className="mp-library">
            <div className="mp-section-header">
              <OsIcon name="marketplace" size={22} />
              <h2>
                Package Library <span>({activeIndustry})</span>
              </h2>
            </div>
            {filtered.length === 0 && !error && (
              <div className="mp-empty">
                <OsIcon name="quotation" size={30} />
                <strong>
                  No {activeIndustry.toLowerCase()} master packages yet.
                </strong>
                <p>
                  Create a draft and publish it to distribute new company
                  copies.
                </p>
                {canManage && (
                  <button
                    type="button"
                    className="mp-button primary"
                    onClick={create}
                  >
                    Create Package
                  </button>
                )}
              </div>
            )}
            <div className="mp-library-list">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => choose(item)}
                  className={
                    'mp-package-row' +
                    (selected?.id === item.id && !editing ? ' active' : '')
                  }
                  aria-pressed={selected?.id === item.id && !editing}
                >
                  <span className="mp-villa-thumbnail" aria-hidden="true" />
                  <span className="mp-package-info">
                    <span className="mp-package-title">{item.name}</span>
                    <span className="mp-package-description">
                      {item.description || 'Company-editable quotation package'}
                    </span>
                    <b>
                      {money(item.basePrice, item.currency)}{' '}
                      <small>
                        /{' '}
                        {item.pricingBasis === 'per_sqft'
                          ? 'sq ft'
                          : item.pricingBasis.replace('per_', '')}
                      </small>
                    </b>
                  </span>
                  <span className="mp-package-meta">
                    <span className={'mp-state ' + item.status}>
                      {item.status === 'published'
                        ? 'Published'
                        : item.status === 'draft'
                          ? 'Draft'
                          : 'Archived'}
                    </span>
                    <span className="mp-version">v{item.version}.0</span>
                    <span className="mp-more" aria-hidden="true">
                      ⋮
                    </span>
                  </span>
                </button>
              ))}
              {hasCustomPlaceholder && (
                <button
                  type="button"
                  className="mp-package-row mp-custom-row"
                  onClick={create}
                  disabled={!canManage}
                >
                  <span className="mp-villa-thumbnail" aria-hidden="true" />
                  <span className="mp-package-info">
                    <span className="mp-package-title">Custom Package</span>
                    <span className="mp-package-description">
                      Project-specific &amp; fully customizable
                    </span>
                    <b>On Request</b>
                  </span>
                  <span className="mp-package-meta">
                    <span className="mp-state draft">Create</span>
                  </span>
                </button>
              )}
            </div>
          </section>
          <section
            className="mp-flow"
            aria-label="Package distribution workflow"
          >
            <div className="mp-flow-steps">
              <div>
                <span>
                  <OsIcon name="marketplace" size={24} />
                </span>
                <b>
                  Create
                  <br />
                  Master Package
                </b>
              </div>
              <i aria-hidden="true">→</i>
              <div>
                <span>
                  <OsIcon name="users" size={24} />
                </span>
                <b>
                  Auto Distribute
                  <br />
                  to Companies
                </b>
              </div>
              <i aria-hidden="true">→</i>
              <div>
                <span>
                  <OsIcon name="quotation" size={24} />
                </span>
                <b>
                  Companies
                  <br />
                  Customize &amp; Use
                </b>
              </div>
            </div>
            <p>
              <OsIcon name="check" size={17} /> New copies are company-owned.
              Existing packages, prices and issued quotations remain unchanged.
            </p>
          </section>
        </div>

        <section className="mp-detail" aria-label="Package details">
          {!previewData && !editing ? (
            <div className="mp-empty">
              <strong>Select a package to see its specifications.</strong>
              {canManage && (
                <button
                  type="button"
                  className="mp-button primary"
                  onClick={create}
                >
                  Create Package
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="mp-hero">
                <div className="mp-hero-content">
                  <div className="mp-hero-title">
                    <OsIcon name="crown" size={27} />
                    <h2>
                      {editing
                        ? draft?.name || 'New Master Package'
                        : selected?.name}
                    </h2>
                  </div>
                  <p>
                    {editing
                      ? draft?.description ||
                        'Design your company-editable master template.'
                      : selected?.description}
                  </p>
                  <div className="mp-hero-badges">
                    <span className="mp-rate-badge">
                      {previewData?.basePrice
                        ? money(previewData.basePrice, previewData.currency)
                        : 'Set rate'}{' '}
                      <small>
                        /
                        {previewData?.pricingBasis === 'per_sqft'
                          ? 'sq ft'
                          : 'package'}
                      </small>
                    </span>
                    <span className="mp-hero-status">
                      {editing
                        ? 'Editing Draft'
                        : selected?.status === 'published'
                          ? 'Published'
                          : selected?.status === 'draft'
                            ? 'Draft'
                            : 'Archived'}
                    </span>
                    <span className="mp-hero-version">
                      {editing && !draft?.id
                        ? 'New'
                        : selected
                          ? 'Version ' + selected.version
                          : ''}
                    </span>
                  </div>
                </div>
                <div className="mp-hero-villa" aria-hidden="true" />
              </div>
              <nav className="mp-detail-tabs" aria-label="Package details tabs">
                {tabs.map((t) => (
                  <button
                    type="button"
                    key={t.value}
                    onClick={() => setTab(t.value)}
                    className={tab === t.value ? 'active' : ''}
                    aria-current={tab === t.value ? 'page' : undefined}
                  >
                    <OsIcon name={t.icon} size={17} />
                    {t.name}
                  </button>
                ))}
              </nav>

              {editing && draft ? (
                <div className="mp-editor">
                  <div className="mp-editor-grid">
                    <label>
                      Package Name
                      <input
                        value={draft.name}
                        maxLength={120}
                        placeholder="e.g. Premium Construction"
                        onChange={(e) => update('name', e.target.value)}
                      />
                    </label>
                    <label>
                      Package Code
                      <input
                        value={draft.code}
                        maxLength={20}
                        placeholder="e.g. PREMIUM"
                        disabled={Boolean(
                          draft.id && selected?.status !== 'draft',
                        )}
                        onChange={(e) =>
                          update('code', e.target.value.toUpperCase())
                        }
                      />
                    </label>
                    <label>
                      Base Rate (₹)
                      <input
                        type="number"
                        min=".01"
                        max="999999999"
                        step=".01"
                        value={draft.basePrice}
                        onChange={(e) => update('basePrice', e.target.value)}
                      />
                    </label>
                    <label>
                      Pricing Basis
                      <select
                        value={draft.pricingBasis}
                        disabled={draft.industryKey === 'construction'}
                        onChange={(e) => update('pricingBasis', e.target.value)}
                      >
                        <option value="per_sqft">Per sq ft</option>
                        <option value="fixed">Fixed price</option>
                        <option value="per_bhk">Per BHK</option>
                        <option value="per_unit">Per unit</option>
                      </select>
                    </label>
                    <label className="wide">
                      Description
                      <textarea
                        value={draft.description}
                        maxLength={600}
                        rows={2}
                        onChange={(e) => update('description', e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="mp-spec-editor-heading">
                    <h3>Specifications &amp; allowances</h3>
                    <button
                      type="button"
                      disabled={draft.specSections.length >= 32}
                      onClick={() =>
                        update('specSections', [
                          ...draft.specSections,
                          emptySpec(),
                        ])
                      }
                    >
                      + Add specification
                    </button>
                  </div>
                  <div className="mp-spec-edit-list">
                    {draft.specSections.map((s, i) => (
                      <div className="mp-spec-edit" key={i}>
                        <div className="mp-spec-edit-title">
                          <b>
                            {i + 1}. {s.title}
                          </b>
                          <button
                            type="button"
                            aria-label={'Remove ' + s.title}
                            onClick={() =>
                              update(
                                'specSections',
                                draft.specSections.filter(
                                  (_, index) => index !== i,
                                ),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <div className="mp-editor-grid">
                          <label>
                            Category
                            <input
                              value={s.title}
                              maxLength={90}
                              onChange={(e) =>
                                updateSpec(i, 'title', e.target.value)
                              }
                            />
                          </label>
                          <label>
                            Brand
                            <input
                              value={s.brand}
                              maxLength={120}
                              onChange={(e) =>
                                updateSpec(i, 'brand', e.target.value)
                              }
                            />
                          </label>
                          <label>
                            Grade
                            <input
                              value={s.grade}
                              maxLength={120}
                              onChange={(e) =>
                                updateSpec(i, 'grade', e.target.value)
                              }
                            />
                          </label>
                          <label>
                            Unit
                            <select
                              value={s.unit}
                              onChange={(e) =>
                                updateSpec(i, 'unit', e.target.value)
                              }
                            >
                              {(
                                [
                                  'none',
                                  'sqft',
                                  'bathroom',
                                  'door',
                                  'piece',
                                  'kg',
                                  'tonne',
                                  'bag',
                                  'cubic_meter',
                                  'running_ft',
                                  'point',
                                  'lumpsum',
                                  'meter',
                                  'bhk',
                                ] as MasterSpec['unit'][]
                              ).map((unit) => (
                                <option value={unit} key={unit}>
                                  {unit.replace('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Pricing
                            <select
                              value={s.pricingTreatment}
                              onChange={(e) =>
                                updateSpec(
                                  i,
                                  'pricingTreatment',
                                  e.target.value,
                                )
                              }
                            >
                              <option value="included">Included</option>
                              <option value="allowance">Allowance</option>
                              <option value="extra">Extra</option>
                              <option value="excluded">Excluded</option>
                            </select>
                          </label>
                          <label>
                            Allowance (₹)
                            <input
                              value={s.allowanceValue}
                              inputMode="decimal"
                              placeholder="0"
                              onChange={(e) =>
                                updateSpec(i, 'allowanceValue', e.target.value)
                              }
                            />
                          </label>
                          <label className="wide">
                            Specification
                            <textarea
                              rows={2}
                              value={s.description}
                              maxLength={600}
                              onChange={(e) =>
                                updateSpec(i, 'description', e.target.value)
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mp-editor-actions">
                    <button
                      className="mp-button outline"
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setDraft(null);
                        setMessage('');
                        setSelectedId(
                          selected?.id ??
                            packages.find((p) => p.industryKey === industry)
                              ?.id ??
                            null,
                        );
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="mp-button primary"
                      type="button"
                      onClick={save}
                      disabled={busy}
                    >
                      {busy ? 'Saving…' : 'Save Draft'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {tab === 'specifications' && (
                    <div className="mp-specs">
                      {categories.length === 0 && (
                        <div className="mp-empty">No specifications saved.</div>
                      )}
                      {categories.map((s, i) => (
                        <div className="mp-spec" key={i}>
                          <button
                            type="button"
                            className="mp-spec-row"
                            aria-expanded={expanded === String(i)}
                            onClick={() =>
                              setExpanded(
                                expanded === String(i) ? null : String(i),
                              )
                            }
                          >
                            <span className="mp-spec-symbol">
                              <OsIcon
                                name={
                                  i === 7
                                    ? 'check'
                                    : i === 4
                                      ? 'integrations'
                                      : i === 5
                                        ? 'settings'
                                        : 'marketplace'
                                }
                                size={18}
                              />
                            </span>
                            <b>{s.title}</b>
                            <span>
                              {s.brand ||
                                s.grade ||
                                s.description ||
                                'Specification not defined'}
                            </span>
                            <OsIcon
                              name="chevron"
                              size={17}
                              className={
                                expanded === String(i) ? 'mp-rotated' : ''
                              }
                            />
                          </button>
                          {expanded === String(i) && (
                            <div className="mp-spec-expanded">
                              {s.description && <p>{s.description}</p>}
                              {s.brand && (
                                <p>
                                  <strong>Brand:</strong> {s.brand}
                                </p>
                              )}
                              {s.grade && (
                                <p>
                                  <strong>Grade:</strong> {s.grade}
                                </p>
                              )}
                              <p>
                                <strong>Pricing:</strong> {s.pricingTreatment}
                                {s.allowanceValue &&
                                  ' · ' +
                                    money(s.allowanceValue) +
                                    ' / ' +
                                    s.unit.replace('_', ' ')}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {tab === 'boq' && (
                    <div className="mp-tab-body">
                      <h3>BOQ &amp; inclusions</h3>
                      <p>
                        Master packages define inclusion defaults and
                        allowances. The company's project BOQ calculates
                        quantities from drawings and measurements.
                      </p>
                      {categories.map((s, i) => (
                        <div className="mp-mini-row" key={i}>
                          <strong>{s.title}</strong>
                          <span>
                            {s.pricingTreatment}
                            {s.allowanceValue
                              ? ' · ' + money(s.allowanceValue) + ' / ' + s.unit
                              : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {tab === 'payments' && (
                    <div className="mp-tab-body">
                      <h3>Company payment stages</h3>
                      <p>
                        Payment percentages, stage work, checks and QC are
                        controlled in each company's Payments &amp; Work
                        settings and imported into its quotations. Master
                        packages do not overwrite them.
                      </p>
                      <div className="mp-info-card">
                        <OsIcon name="billing" size={23} />
                        Payment stages stay company-specific and can vary by
                        project floor count.
                      </div>
                    </div>
                  )}
                  {tab === 'distribution' && (
                    <div className="mp-tab-body">
                      <h3>Automatic company distribution</h3>
                      <div className="mp-distribution-number">
                        {selected?.companyCount ?? 0}
                        <span>company copies created from this master</span>
                      </div>
                      <p>
                        Publishing creates a separate package only for eligible
                        companies missing this package code. Existing copies and
                        company-specific edits are never overwritten.
                      </p>
                      <p>
                        New companies receive published master templates when
                        their industry is assigned.
                      </p>
                    </div>
                  )}
                  <div className="mp-detail-footer">
                    <button
                      type="button"
                      className="mp-button outline"
                      onClick={() => setPreview(true)}
                    >
                      <OsIcon name="quotation" size={18} /> Preview / PDF
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        className="mp-button outline"
                        onClick={duplicate}
                      >
                        <OsIcon name="marketplace" size={18} /> Duplicate
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className="mp-button primary"
                        onClick={beginEdit}
                      >
                        <OsIcon name="settings" size={18} /> Edit Package
                      </button>
                    )}
                  </div>
                  {canManage && selected && (
                    <div className="mp-publish-strip">
                      <span>
                        {selected.status === 'published'
                          ? 'Published master · company copies remain independent'
                          : selected.status === 'draft'
                            ? 'Draft · publish to distribute new company copies'
                            : 'Archived · existing company copies remain available'}
                      </span>
                      <div>
                        {selected.status === 'published' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => statusChange('archived')}
                          >
                            Archive
                          </button>
                        )}
                        {selected.status !== 'published' && (
                          <button
                            type="button"
                            className="mp-button primary"
                            disabled={busy}
                            onClick={() => statusChange('published')}
                          >
                            {busy ? 'Publishing…' : 'Publish Template'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
      {preview && previewData && (
        <div
          className="mp-modal-backdrop"
          role="presentation"
          onClick={() => setPreview(false)}
        >
          <div
            className="mp-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Master quotation template preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mp-modal-toolbar">
              <strong>Master Template Preview</strong>
              <div>
                <button
                  type="button"
                  className="mp-button primary"
                  onClick={() => window.print()}
                >
                  Print / Save as PDF
                </button>
                <button
                  type="button"
                  className="mp-button outline"
                  onClick={() => setPreview(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="mp-print-preview">
              <div className="mp-preview-brand">ProPulse Business OS</div>
              <h2>{previewData.name}</h2>
              <p>{previewData.description}</p>
              <strong>
                {money(previewData.basePrice, previewData.currency)}
                {previewData.pricingBasis === 'per_sqft' ? ' / sq ft' : ''}
              </strong>
              <h3>Specifications &amp; inclusions</h3>
              {previewData.specSections.map((s, i) => (
                <div key={i} className="mp-print-line">
                  <b>{s.title}</b>
                  <span>
                    {[s.brand, s.grade, s.description]
                      .filter(Boolean)
                      .join(' · ')}
                    {s.allowanceValue
                      ? ' · Allowance: ' +
                        money(s.allowanceValue) +
                        '/' +
                        s.unit
                      : ''}
                  </span>
                </div>
              ))}
              <small>
                Illustrative master template. Not a customer quotation. A
                company must confirm project rates, scope, payment terms and
                warranties.
              </small>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
