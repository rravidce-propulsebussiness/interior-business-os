'use client';
import { useWebsitePreviewSrcDoc } from './website-preview-nonce';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { OwnerIcon } from '../owner-shell';
import { WebsiteCreate } from './website-create';

export type WebsiteHomeSite = {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: string;
  published: boolean;
};

type Template = { id: string; name: string; description: string };
type SiteDomain = { hostname: string; ready: boolean } | null;
type Props = {
  sites: WebsiteHomeSite[];
  previewHtml: string | null;
  pages: number | null;
  enquiries: number | null;
  pageViews: number | null;
  domain: SiteDomain;
  templates: Template[];
  pendingSetup: boolean;
  canManage: boolean;
  canCode: boolean;
  canDesign: boolean;
  canEdit: boolean;
  canForms: boolean;
  canSeo: boolean;
  canDomains: boolean;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }).format(date);
}

function TemplateIllustration({
  variant,
}: {
  variant: 'construction' | 'interior' | 'blank';
}) {
  return (
    <div
      className={`website-template-art website-template-art-${variant}`}
      aria-hidden="true"
    >
      <div className="website-template-browser">
        <span className="website-mini-brand" />
        <span className="website-mini-nav" />
        <span className="website-mini-nav short" />
        <span className="website-mini-action" />
      </div>
      <div className="website-art-scene">
        {variant === 'construction' ? (
          <div className="website-art-house">
            <span className="website-art-roof" />
            <span className="website-art-building" />
            <span className="website-art-building website-art-side" />
            <span className="website-art-window window-one" />
            <span className="website-art-window window-two" />
            <span className="website-art-window window-three" />
          </div>
        ) : variant === 'interior' ? (
          <div className="website-art-room">
            <span className="website-art-wall" />
            <span className="website-art-frame" />
            <span className="website-art-sofa" />
            <span className="website-art-table" />
            <span className="website-art-lamp" />
          </div>
        ) : (
          <div className="website-art-blank-copy">
            <span />
            <span />
            <span />
            <i />
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({
  name,
  description,
  variant,
  onClick,
}: {
  name: string;
  description: string;
  variant: 'construction' | 'interior' | 'blank';
  onClick: () => void;
}) {
  return (
    <button type="button" className="website-template-card" onClick={onClick}>
      <TemplateIllustration variant={variant} />
      <span className="website-template-body">
        <strong>{name}</strong>
        <span>{description || 'Customize this layout for your business.'}</span>
        <span className="website-template-arrow" aria-hidden="true">
          ›
        </span>
      </span>
    </button>
  );
}

export function WebsiteHome({
  sites,
  previewHtml,
  pages,
  enquiries,
  pageViews,
  domain,
  templates,
  pendingSetup,
  canManage,
  canCode,
  canDesign,
  canEdit,
  canForms,
  canSeo,
  canDomains,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const previewSrcDoc = useWebsitePreviewSrcDoc(previewHtml ?? '');
  const closeCreation = useCallback(() => setCreateOpen(false), []);
  const [startingTemplate, setStartingTemplate] = useState('');
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const mainSite = sites[0];
  const base = mainSite ? `/dashboard/website/${mainSite.id}` : '';
  const liveUrl =
    mainSite?.published && domain?.ready ? `https://${domain.hostname}` : null;
  const quickActions = mainSite
    ? [
        {
          title: 'Edit website',
          desc: 'Update content, images and sections',
          icon: 'quotations' as const,
          href: `${base}/layout`,
          allowed: canEdit,
        },
        {
          title: 'Design & Theme',
          desc: 'Manage colors, fonts and layout',
          icon: 'settings' as const,
          href: `${base}/design`,
          allowed: canDesign,
        },
        {
          title: 'Forms',
          desc: 'Set up customer enquiry forms',
          icon: 'leads' as const,
          href: `${base}/forms`,
          allowed: canForms,
        },
        {
          title: 'SEO & Domains',
          desc: 'Search settings and site address',
          icon: 'globe' as const,
          href: canSeo ? `${base}/seo` : `${base}/domains`,
          allowed: canSeo || canDomains,
        },
      ].filter((action) => action.allowed)
    : [];

  const openCreation = (templateId = '') => {
    setStartingTemplate(templateId);
    setCreateOpen(true);
  };
  const displayed = showAllTemplates ? templates : templates.slice(0, 2);
  const metric = (value: number | null) =>
    value === null ? '—' : value.toLocaleString('en-IN');

  return (
    <main id="main-content" className="website-dashboard">
      <header className="website-heading">
        <div className="website-heading-left">
          <span className="website-heading-symbol">
            <OwnerIcon name="globe" size={29} />
          </span>
          <div>
            <h1>Website</h1>
            <p>Manage your online presence in one place</p>
          </div>
        </div>
        {canManage && (
          <button
            className="website-primary website-create-trigger"
            type="button"
            onClick={() => openCreation()}
          >
            <OwnerIcon name="plus" size={18} /> Create Website
          </button>
        )}
      </header>

      {pendingSetup && (
        <p className="website-notice" role="status">
          Shared templates are being set up. Existing websites and the blank
          editor remain available.
        </p>
      )}

      {mainSite ? (
        <>
          <section className="website-main-card">
            <div className="website-section-heading">
              <h2>Your Website</h2>
              <Link
                aria-label="More website settings"
                href={`${base}/versions`}
                className="website-more"
              >
                ⋮
              </Link>
            </div>
            <div className="website-main-layout">
              <div
                className="website-preview"
                aria-label="Preview of your website draft"
              >
                {previewHtml ? (
                  <div className="website-real-preview">
                    <iframe
                      title={`Draft preview of ${mainSite.name}`}
                      sandbox="allow-scripts"
                      referrerPolicy="no-referrer"
                      srcDoc={previewSrcDoc}
                      scrolling="no"
                    />
                  </div>
                ) : (
                  <div className="website-preview-fallback">
                    <div className="website-preview-fallback-nav">
                      <strong>{mainSite.name}</strong>
                      <span>Home</span>
                      <span>Services</span>
                      <span>Contact</span>
                    </div>
                    <div className="website-preview-fallback-content">
                      <div className="website-preview-fallback-globe">
                        <OwnerIcon name="globe" size={42} />
                      </div>
                      <strong>Your website takes shape here.</strong>
                      <span>Open your website to preview it or choose a template.</span>
                      <Link href={base}>Open website →</Link>
                    </div>
                  </div>
                )}
                <span className="website-preview-caption">
                  {previewHtml ? 'Saved draft preview' : 'Website preview'}
                </span>
              </div>

              <div className="website-site-info">
                <span
                  className={`website-status ${mainSite.published ? 'website-status-live' : ''}`}
                >
                  {mainSite.published
                    ? 'Published'
                    : mainSite.status.replaceAll('_', ' ')}
                </span>
                <h3>{mainSite.name}</h3>
                <p className="website-site-address">
                  {domain ? domain.hostname : `Site: ${mainSite.slug}`}
                </p>
                <p className="website-updated">
                  Last updated {formatDate(mainSite.updatedAt)}
                </p>
                <p className="website-site-description">
                  Showcase your services and projects with a professional
                  website and collect enquiries in your CRM.
                </p>

                <div className="website-metrics">
                  <div>
                    <span className="website-metric-symbol">
                      <OwnerIcon name="quotations" size={19} />
                    </span>
                    <strong>{metric(pages)}</strong>
                    <small>Pages</small>
                  </div>
                  <div>
                    <span className="website-metric-symbol">
                      <OwnerIcon name="leads" size={19} />
                    </span>
                    <strong>{metric(enquiries)}</strong>
                    <small>Enquiries · 30d</small>
                  </div>
                  <div>
                    <span className="website-metric-symbol">
                      <OwnerIcon name="reports" size={19} />
                    </span>
                    <strong>{metric(pageViews)}</strong>
                    <small>Page views · 30d</small>
                  </div>
                </div>
                <p className="website-metric-note">
                  Page views include repeat visits and bots, not unique
                  visitors.
                </p>

                {canDomains && (
                  <Link href={`${base}/domains`} className="website-domain-row">
                    <OwnerIcon name="globe" size={19} />
                    <span>Domain</span>
                    <strong className={domain?.ready ? 'ready' : ''}>
                      {domain
                        ? domain.ready
                          ? 'Connected'
                          : 'Setup pending'
                        : 'Set up domain'}
                    </strong>
                    <span className="website-domain-host">
                      {domain?.hostname ?? ''}
                    </span>
                    <span aria-hidden="true">›</span>
                  </Link>
                )}

                <div className="website-main-actions">
                  <Link href={base} className="website-primary">
                    <span aria-hidden="true">◉</span> Open Website
                  </Link>
                  {liveUrl ? (
                    <a
                      href={liveUrl}
                      className="website-outline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ↗ View Live Site
                    </a>
                  ) : (
                    <Link
                      href={canDomains ? `${base}/domains` : base}
                      className="website-outline"
                    >
                      {canDomains ? 'Set Up Live Site' : 'Website Settings'}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>

          {sites.length > 1 && (
            <section
              className="website-other-sites"
              aria-label="Other websites"
            >
              <h2>Other Websites</h2>
              <div className="website-other-site-list">
                {sites.slice(1).map((site) => (
                  <Link
                    key={site.id}
                    href={`/dashboard/website/${site.id}`}
                    className="website-other-site"
                  >
                    <span className="website-other-icon">
                      <OwnerIcon name="globe" size={21} />
                    </span>
                    <span>
                      <strong>{site.name}</strong>
                      <small>
                        {site.slug} · {site.status}
                      </small>
                    </span>
                    <span className="website-other-arrow">View website →</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!!quickActions.length && (
            <section className="website-quick-section">
              <h2>Quick Actions</h2>
              <p>Common tasks to manage your website</p>
              <div className="website-quick-grid">
                {quickActions.map((action) => (
                  <Link
                    href={action.href}
                    className="website-quick-card"
                    key={action.title}
                  >
                    <span className="website-quick-icon">
                      <OwnerIcon name={action.icon} size={21} />
                    </span>
                    <span className="website-quick-content">
                      <strong>{action.title}</strong>
                      <small>{action.desc}</small>
                    </span>
                    <span className="website-quick-arrow">›</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="website-welcome-card">
          <span className="website-welcome-icon">
            <OwnerIcon name="globe" size={33} />
          </span>
          <h2>Build your business website</h2>
          <p>
            Choose a template or start with a blank canvas. Your website stays
            private until you publish it.
          </p>
          {canManage && (
            <button
              type="button"
              className="website-primary"
              onClick={() => openCreation()}
            >
              + Create Your Website
            </button>
          )}
        </section>
      )}

      {canManage && !mainSite && (
        <section className="website-templates-section">
          <div className="website-templates-heading">
            <div>
              <h2>Start with a template</h2>
              <p>Create a new website using a ready template</p>
            </div>
            {templates.length > 2 && (
              <button
                type="button"
                className="website-all-templates"
                onClick={() => setShowAllTemplates(!showAllTemplates)}
              >
                {showAllTemplates ? 'Show fewer' : 'View all templates'} →
              </button>
            )}
          </div>
          <div className="website-template-grid">
            {displayed.map((template) => {
              const words = (
                template.name +
                ' ' +
                template.description
              ).toLowerCase();
              const variant = words.includes('interior')
                ? 'interior'
                : words.includes('construct') || words.includes('home')
                  ? 'construction'
                  : 'blank';
              return (
                <TemplateCard
                  key={template.id}
                  name={template.name}
                  description={template.description}
                  variant={variant}
                  onClick={() => openCreation(template.id)}
                />
              );
            })}
            <TemplateCard
              name="Blank Site"
              description="A clean start for your business"
              variant="blank"
              onClick={() => openCreation('')}
            />
          </div>
        </section>
      )}

      <WebsiteCreate
        key={startingTemplate + ':' + (createOpen ? 'open' : 'closed')}
        open={createOpen}
        onClose={closeCreation}
        initialTemplate={startingTemplate}
        templates={templates}
        canCode={canCode}
      />
    </main>
  );
}
