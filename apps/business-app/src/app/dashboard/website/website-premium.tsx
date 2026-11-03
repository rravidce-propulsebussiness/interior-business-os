'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createWebsite } from './actions';
import './website-premium.css';

export type PremiumSite = {
  id: string;
  name: string;
  slug: string;
  status: string;
  published: boolean;
  version: number;
};
export type PremiumDomain = {
  website_id: string;
  hostname: string;
  status: string;
  tls_status: string;
  kind: string;
};
type Category =
  | 'All Templates'
  | 'Construction'
  | 'Interiors'
  | 'Real Estate'
  | 'Architecture';
type Template = {
  id: string;
  name: string;
  tagline: string;
  category: Exclude<Category, 'All Templates'>;
  badge: string;
  style: 'construction' | 'interior' | 'villa';
  headline: string;
  kicker: string;
  description: string;
};

const templates: Template[] = [
  {
    id: 'starter:premium-construction',
    name: 'Modern Construction Pro',
    tagline: 'Perfect for construction & turnkey projects',
    category: 'Construction',
    badge: 'Popular',
    style: 'construction',
    headline: 'Turnkey Construction & Interior Solutions',
    kicker: 'Build · Design · Deliver',
    description:
      'A complete multi-page business showcase with projects, services, packages and enquiry sections.',
  },
  {
    id: 'starter:premium-interiors',
    name: 'Premium Interiors',
    tagline: 'Modern & elegant interiors showcase',
    category: 'Interiors',
    badge: 'New',
    style: 'interior',
    headline: 'Elegant Interior Spaces',
    kicker: 'Design · Execute · Transform',
    description:
      'A warm, content-first interior design starter. Replace text and photos without shifting the layout.',
  },
  {
    id: 'starter:premium-villas',
    name: 'Luxury Villa Showcase',
    tagline: 'High-end villa & farmhouse projects',
    category: 'Real Estate',
    badge: 'Premium',
    style: 'villa',
    headline: 'Luxury Villas & Farmhouses',
    kicker: 'Design · Build · Live',
    description:
      'A premium construction portfolio starter for villas, farmhouses and architectural work.',
  },
];
const categories: Category[] = [
  'All Templates',
  'Construction',
  'Interiors',
  'Real Estate',
  'Architecture',
];

function StudioIcon({
  name,
  size = 19,
}: {
  name:
    | 'plus'
    | 'globe'
    | 'check'
    | 'clock'
    | 'layers'
    | 'search'
    | 'filter'
    | 'eye'
    | 'arrow'
    | 'edit'
    | 'link'
    | 'copy'
    | 'sparkles'
    | 'code'
    | 'external'
    | 'close'
    | 'shield'
    | 'mobile'
    | 'chart'
    | 'bolt'
    | 'crown';
  size?: number;
}) {
  const paths: Record<typeof name, string> = {
    plus: 'M12 5v14M5 12h14',
    globe:
      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2c-5 6-5 14 0 20M12 2c5 6 5 14 0 20',
    check: 'M5 12l4 4L19 6',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l4 2',
    layers: 'M12 2 2 7l10 5 10-5-10-5ZM2 12l10 5 10-5M2 17l10 5 10-5',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 5 5',
    filter: 'M3 4h18l-7 8v7l-4 2v-9z',
    eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
    arrow: 'M4 12h16m-7-7 7 7-7 7',
    edit: 'M4 20h16M5 15 16 4l4 4-11 11H5z',
    link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
    copy: 'M8 7h12v14H8zM4 17H3V3h14v1',
    sparkles: 'm12 2 2 7 7 3-7 2-2 8-2-8-8-2 8-3z',
    code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-12-3 14',
    external: 'M14 4h6v6m0-6-9 9M20 14v6H4V4h6',
    close: 'M5 5l14 14M19 5 5 19',
    shield: 'M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6zM8 12l3 3 5-6',
    mobile: 'M7 2h10v20H7zM11 18h2',
    chart: 'M4 19V9m6 10V5m6 14v-7m5 7V3',
    bolt: 'M13 2 4 13h7l-1 9 10-12h-7z',
    crown: 'm2 8 5 4 5-8 5 8 5-4-2 12H4z',
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function Thumbnail({
  template,
  brand,
}: {
  template: Template;
  brand: string;
}) {
  return (
    <div
      className={'ps-thumbnail ps-thumbnail-' + template.style}
    >
      <div className="ps-thumbnail-top">
        <span className="ps-thumbnail-logo">
          ⌂ {brand}
        </span>
        <span>Home　 About　 Services　 Contact</span>
      </div>
      <div className="ps-thumbnail-body">
        <span className="ps-thumbnail-kicker">{template.kicker}</span>
        <strong>{template.headline}</strong>
        <span className="ps-thumbnail-action">
          Get a Quote <span aria-hidden="true">↗</span>
        </span>
      </div>
    </div>
  );
}

export function WebsitePremium({
  companyName,
  sites,
  domains,
  quota,
  canManage,
  canCode,
}: {
  companyName: string;
  sites: PremiumSite[];
  domains: PremiumDomain[];
  quota: number;
  canManage: boolean;
  canCode: boolean;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<Category>('All Templates');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<Template | null>(null);
  const [choice, setChoice] = useState<Template>(templates[0]!);
  const [siteName, setSiteName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState('');
  const [saving, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const activeCount = sites.filter((s) => s.status !== 'archived').length;
  const liveCount = sites.filter((s) => s.published).length;
  const draftCount = sites.filter(
    (s) => !s.published && s.status !== 'archived',
  ).length;
  const available = Math.max(0, quota - activeCount);
  const canCreate = canManage && available > 0;
  const visibleSites = useMemo(
    () =>
      sites.filter(
        (site) =>
          (site.name + ' ' + site.slug)
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (statusFilter === 'all' ||
            (statusFilter === 'live' ? site.published : !site.published)),
      ),
    [sites, search, statusFilter],
  );
  const visibleTemplates =
    category === 'All Templates'
      ? templates
      : category === 'Architecture'
        ? templates.filter((t) => t.id === 'starter:premium-villas')
        : templates.filter((t) => t.category === category);
  const closeCreate = useCallback(() => {
    if (!saving) setCreating(false);
  }, [saving]);
  useEffect(() => {
    if (!creating && !preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (preview) setPreview(null);
        else closeCreate();
      }
    };
    document.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (creating) inputRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
    };
  }, [creating, preview, closeCreate]);
  function openCreate(template: Template = templates[0]!) {
    if (!canCreate) return;
    setChoice(template);
    setSiteName(companyName);
    setSlug(
      companyName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63),
    );
    setSlugTouched(false);
    setError('');
    setPreview(null);
    setCreating(true);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || saving) return;
    setError('');
    startTransition(async () => {
      const result = await createWebsite(
        siteName.trim(),
        slug.trim(),
        choice.id,
      );
      if (result.id) {
        setCreating(false);
        router.push('/dashboard/website/' + result.id + '/layout');
      } else {
        setError(result.message || 'Website could not be created.');
      }
    });
  }
  function domainFor(id: string) {
    const set = domains.filter(
      (domain) => domain.website_id === id && domain.status !== 'removed',
    );
    return (
      set.find(
        (domain) =>
          domain.kind === 'custom' &&
          domain.status === 'active' &&
          domain.tls_status === 'ready',
      ) ??
      set.find(
        (domain) =>
          domain.kind === 'subdomain' &&
          domain.status === 'active' &&
          domain.tls_status === 'ready',
      ) ??
      set[0]
    );
  }
  return (
    <main id="main-content" className="ps-studio">
      <section className="ps-hero ps-rise">
        <div className="ps-hero-copy">
          <p className="ps-kicker">
            WEBSITE STUDIO <span>✦</span> DESIGNED FOR GROWTH
          </p>
          <h1>
            Create &amp; Manage <span>Customer Websites</span>
          </h1>
          <p>
            Build professional, high-performance websites for your business with
            beautiful fixed templates and independent developer tools.
          </p>
          <div className="ps-benefits">
            <span>
              <StudioIcon name="bolt" size={19} />
              <span>
                <strong>Quick Setup</strong>
                <small>Launch in minutes</small>
              </span>
            </span>
            <span>
              <StudioIcon name="sparkles" size={19} />
              <span>
                <strong>Premium Themes</strong>
                <small>Modern &amp; responsive</small>
              </span>
            </span>
            <span>
              <StudioIcon name="mobile" size={19} />
              <span>
                <strong>Mobile Ready</strong>
                <small>Every device optimized</small>
              </span>
            </span>
            <span>
              <StudioIcon name="chart" size={19} />
              <span>
                <strong>SEO Friendly</strong>
                <small>Better visibility</small>
              </span>
            </span>
            <span>
              <StudioIcon name="shield" size={19} />
              <span>
                <strong>Fixed Layout</strong>
                <small>Edit text &amp; images</small>
              </span>
            </span>
          </div>
        </div>
        <div className="ps-hero-illustration" aria-hidden="true">
          <span className="ps-hero-glint">✦</span>
        </div>
      </section>

      <section className="ps-overview ps-rise" aria-label="Website overview">
        <button
          type="button"
          className="ps-create-banner"
          onClick={() => openCreate()}
          disabled={!canCreate}
        >
          <span className="ps-create-plus">
            <StudioIcon name="plus" size={31} />
          </span>
          <span>
            <strong>Create New Website</strong>
            <small>
              {canCreate
                ? 'Choose a premium template and start building'
                : 'Website limit reached — ask your administrator for more sites'}
            </small>
          </span>
          <span className="ps-create-arrow">
            <StudioIcon name="arrow" size={19} />
          </span>
        </button>
        <div className="ps-stat">
          <span className="ps-stat-icon ps-stat-blue">
            <StudioIcon name="globe" size={25} />
          </span>
          <div>
            <strong>{activeCount}</strong>
            <small>Total websites</small>
          </div>
        </div>
        <div className="ps-stat">
          <span className="ps-stat-icon ps-stat-green">
            <StudioIcon name="check" size={25} />
          </span>
          <div>
            <strong>{liveCount}</strong>
            <small>Live websites</small>
          </div>
        </div>
        <div className="ps-stat">
          <span className="ps-stat-icon ps-stat-orange">
            <StudioIcon name="clock" size={25} />
          </span>
          <div>
            <strong>{draftCount}</strong>
            <small>In progress</small>
          </div>
        </div>
        <div className="ps-stat">
          <span className="ps-stat-icon ps-stat-purple">
            <StudioIcon name="layers" size={25} />
          </span>
          <div>
            <strong>{available}</strong>
            <small>Available slots</small>
          </div>
        </div>
      </section>

      <section className="ps-panel ps-sites ps-rise">
        <div className="ps-panel-heading">
          <div>
            <h2>Your Websites</h2>
            <p>
              Manage published sites, fixed-template content and connected
              domains.
            </p>
          </div>
          <div className="ps-panel-filters">
            <label className="ps-search">
              <StudioIcon name="search" size={17} />
              <input
                type="search"
                placeholder="Search websites..."
                aria-label="Search websites"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="ps-filter">
              <StudioIcon name="filter" size={16} />
              <select
                aria-label="Filter website status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="live">Published</option>
                <option value="draft">Draft</option>
              </select>
            </label>
          </div>
        </div>
        <div className="ps-table-scroll">
          <table className="ps-table">
            <thead>
              <tr>
                <th>Website</th>
                <th>Business</th>
                <th>Domain</th>
                <th>Status</th>
                <th>Version</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleSites.map((site, i) => {
                const domain = domainFor(site.id);
                return (
                  <tr key={site.id}>
                    <td>
                      <div className="ps-site-info">
                        <div
                          className={'ps-site-mini ps-site-mini-' + (i % 3)}
                          aria-hidden="true"
                        />
                        <div>
                          <strong>{site.name}</strong>
                          <small>Website · {site.slug}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="ps-business">
                        <span>
                          {companyName.trim().slice(0, 2).toUpperCase() || 'CO'}
                        </span>
                        {companyName}
                      </span>
                    </td>
                    <td>
                      {domain ? (
                        <span className="ps-domain">
                          <StudioIcon name="link" size={16} />
                          <span>{domain.hostname}</span>
                        </span>
                      ) : (
                        <span className="ps-unassigned">
                          Domain not connected
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          'ps-status ' +
                          (site.published
                            ? 'ps-status-live'
                            : 'ps-status-draft')
                        }
                      >
                        ● {site.published ? 'Live' : 'Draft'}
                      </span>
                    </td>
                    <td>
                      <span className="ps-version">v{site.version}</span>
                    </td>
                    <td>
                      <div className="ps-row-actions">
                        {domain?.status === 'active' &&
                          domain.tls_status === 'ready' &&
                          site.published && (
                            <a
                              href={'https://' + domain.hostname}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={'Open ' + site.name + ' live website'}
                              title="Visit live site"
                            >
                              <StudioIcon name="external" size={17} />
                            </a>
                          )}
                        <Link
                          href={'/dashboard/website/' + site.id + '/layout'}
                          aria-label={'Edit ' + site.name}
                          title="Edit text & images"
                        >
                          <StudioIcon name="edit" size={17} />
                        </Link>
                        <Link
                          href={'/dashboard/website/' + site.id + '/domains'}
                          aria-label={'Connect domains for ' + site.name}
                          title="Manage domains"
                        >
                          <StudioIcon name="link" size={17} />
                        </Link>
                        <details className="ps-actions-menu">
                          <summary aria-label={'More actions for ' + site.name}>
                            •••
                          </summary>
                          <div>
                            <Link
                              href={
                                '/dashboard/website/' + site.id + '/metrics'
                              }
                            >
                              Analytics
                            </Link>
                            <Link
                              href={
                                '/dashboard/website/' + site.id + '/versions'
                              }
                            >
                              Versions &amp; publish
                            </Link>
                            {canCode && (
                              <Link
                                href={'/dashboard/website/' + site.id + '/git'}
                              >
                                GitHub / VS Code
                              </Link>
                            )}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visibleSites.length && (
          <div className="ps-empty">
            <StudioIcon name="globe" size={26} />
            <strong>
              {sites.length
                ? 'No websites match your filters'
                : 'Your website journey starts here'}
            </strong>
            <p>
              {sites.length
                ? 'Try a different search or status.'
                : 'Select a premium starter template below to create your first website.'}
            </p>
          </div>
        )}
        {activeCount >= quota && (
          <p className="ps-limit-note">
            Plan capacity: {activeCount} of {quota} website
            {quota === 1 ? '' : 's'}. Additional websites require an approved
            entitlement.
          </p>
        )}
      </section>

      <section className="ps-panel ps-templates ps-rise">
        <div className="ps-panel-heading ps-template-heading">
          <div className="ps-title-with-icon">
            <span className="ps-crown">
              <StudioIcon name="crown" size={22} />
            </span>
            <div>
              <h2>Premium Website Templates</h2>
              <p>
                Fresh, conversion-focused designs. Layouts stay locked; text and
                photos are yours to update.
              </p>
            </div>
          </div>
          <div
            className="ps-tabs"
            role="group"
            aria-label="Template categories"
          >
            {categories.map((value) => (
              <button
                key={value}
                type="button"
                className={category === value ? 'is-active' : ''}
                onClick={() => setCategory(value)}
                aria-pressed={category === value}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="ps-template-grid">
          {visibleTemplates.map((template) => (
            <article className="ps-template-card" key={template.id}>
              <div className="ps-template-art">
                <Thumbnail template={template} brand={companyName} />
                <span
                  className={'ps-template-badge ps-badge-' + template.style}
                >
                  <StudioIcon
                    name={template.badge === 'Premium' ? 'crown' : 'sparkles'}
                    size={13}
                  />
                  {template.badge}
                </span>
              </div>
              <div className="ps-template-bottom">
                <div>
                  <h3>{template.name}</h3>
                  <p>{template.tagline}</p>
                </div>
                <div className="ps-template-actions">
                  <button
                    type="button"
                    className="ps-preview-btn"
                    onClick={() => setPreview(template)}
                  >
                    <StudioIcon name="eye" size={15} /> Preview
                  </button>
                  <button
                    type="button"
                    className="ps-use-btn"
                    disabled={!canCreate}
                    onClick={() => openCreate(template)}
                  >
                    Use Template <StudioIcon name="arrow" size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!visibleTemplates.length && (
          <p className="ps-category-empty">
            More premium designs in this category are coming soon. Try All
            Templates.
          </p>
        )}
        <div className="ps-developer-bar">
          <span className="ps-developer-icon">
            <StudioIcon name="code" size={22} />
          </span>
          <div>
            <strong>Need a fully custom website?</strong>
            <p>
              Use GitHub and VS Code to develop your own frontend and backend.
              No drag-and-drop editor is required.
            </p>
          </div>
          {canCode && sites[0] && (
            <Link href={'/dashboard/website/' + sites[0].id + '/git'}>
              GitHub / VS Code <StudioIcon name="arrow" size={16} />
            </Link>
          )}
        </div>
      </section>

      {preview && (
        <div
          className="ps-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreview(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ps-preview-title"
            className="ps-modal ps-preview-modal"
          >
            <button
              className="ps-close"
              type="button"
              aria-label="Close preview"
              onClick={() => setPreview(null)}
            >
              <StudioIcon name="close" />
            </button>
            <span className="ps-kicker">PREMIUM TEMPLATE PREVIEW</span>
            <h2 id="ps-preview-title">{preview.name}</h2>
            <Thumbnail template={preview} brand={companyName} />
            <p>{preview.description}</p>
            <div className="ps-modal-actions">
              <button
                type="button"
                className="ps-secondary"
                onClick={() => setPreview(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="ps-primary"
                disabled={!canCreate}
                onClick={() => openCreate(preview)}
              >
                Use this template <StudioIcon name="arrow" size={16} />
              </button>
            </div>
            <small>
              Illustrative design preview. Your published website uses the
              selected fixed starter template.
            </small>
          </section>
        </div>
      )}

      {creating && (
        <div
          className="ps-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeCreate();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ps-create-title"
            className="ps-modal ps-create-modal"
          >
            <button
              className="ps-close"
              type="button"
              aria-label="Close create website"
              disabled={saving}
              onClick={closeCreate}
            >
              <StudioIcon name="close" />
            </button>
            <span className="ps-kicker">NEW WEBSITE</span>
            <h2 id="ps-create-title">Launch a premium website</h2>
            <p>
              Choose a ready-made layout. Your existing published websites will
              not be changed.
            </p>
            <form onSubmit={submit}>
              <label htmlFor="ps-template-select">Website template</label>
              <select
                id="ps-template-select"
                value={choice.id}
                onChange={(e) =>
                  setChoice(
                    templates.find((t) => t.id === e.target.value) ??
                      templates[0]!,
                  )
                }
              >
                {templates.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <label htmlFor="ps-site-name">Business website name</label>
              <input
                id="ps-site-name"
                ref={inputRef}
                required
                maxLength={160}
                value={siteName}
                placeholder="Your business name"
                onChange={(e) => {
                  setSiteName(e.target.value);
                  if (!slugTouched)
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .trim()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-+|-+$/g, '')
                        .slice(0, 63),
                    );
                }}
              />
              <label htmlFor="ps-site-slug">Subdomain slug</label>
              <input
                id="ps-site-slug"
                required
                minLength={3}
                maxLength={63}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                placeholder="your-business"
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
              />
              <span className="ps-hint">
                Only lowercase letters, numbers and hyphens. Connect your own
                domain after setup.
              </span>
              {error && (
                <p className="ps-error" role="alert">
                  {error}
                </p>
              )}
              <div className="ps-modal-actions">
                <button
                  type="button"
                  className="ps-secondary"
                  disabled={saving}
                  onClick={closeCreate}
                >
                  Cancel
                </button>
                <button
                  className="ps-primary"
                  disabled={!canCreate || saving}
                  type="submit"
                >
                  {saving ? 'Creating website…' : 'Create Website'}{' '}
                  <StudioIcon name="arrow" size={16} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
