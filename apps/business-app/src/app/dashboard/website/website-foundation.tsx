'use client';

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createWebsite } from './actions';
import './website-foundation.css';

export type FoundationSite = {
  id: string;
  name: string;
  slug: string;
  status: string;
  published: boolean;
};

function makeSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 63);
}

export function WebsiteFoundation({
  sites,
  canManage,
  canViewDomains,
}: {
  sites: FoundationSite[];
  canManage: boolean;
  canViewDomains: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [notice, setNotice] = useState('');
  const [creating, startCreating] = useTransition();

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || creating) return;
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    if (!trimmedName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug) ||
      trimmedSlug.length < 3 || trimmedSlug.length > 63) {
      setNotice('Enter a website name and a valid subdomain slug (3–63 characters).');
      return;
    }
    setNotice('');
    startCreating(async () => {
      // Blank website only. Do not initialize legacy templates or developer files.
      const result = await createWebsite(trimmedName, trimmedSlug, '');
      if (result.id) {
        router.push(`/dashboard/website/${result.id}/domains`);
        router.refresh();
      } else {
        setNotice(result.message);
      }
    });
  }

  return (
    <main id="main-content" className="wf2">
      <header className="wf2-heading">
        <div>
          <span className="wf2-eyebrow">PROPULSE BUSINESS OS / WEBSITES</span>
          <h1>Website Builder</h1>
          <p>A clean workspace for the new builder. Custom domains and managed subdomains remain part of every website.</p>
        </div>
        <span className="wf2-phase">New foundation</span>
      </header>

      <div className="wf2-summary" aria-label="Website capabilities">
        <div><strong>Managed subdomains</strong><span>Each website keeps its existing platform hostname allocation.</span></div>
        <div><strong>Custom domains</strong><span>Connect and verify your own hostname, with HTTPS status shown separately.</span></div>
        <div><strong>Existing publications</strong><span>Previously published sites remain stored and are not modified by this reset.</span></div>
      </div>

      <div className="wf2-grid">
        <section className="wf2-card" aria-labelledby="wf2-your-sites">
          <div className="wf2-section-heading">
            <h2 id="wf2-your-sites">Your websites</h2>
            <span>{sites.length} {sites.length === 1 ? 'website' : 'websites'}</span>
          </div>
          {sites.length ? (
            <div className="wf2-sites">
              {sites.map(site => (
                <article key={site.id} className="wf2-site">
                  <div className="wf2-site-main">
                    <div className="wf2-site-name">
                      <strong>{site.name}</strong>
                      <span className={site.published ? 'wf2-live' : 'wf2-draft'}>
                        {site.published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p>Managed subdomain slug: <code>{site.slug}</code></p>
                    <small>The actual hostname and custom-domain verification status are shown under Domains.</small>
                  </div>
                  {canViewDomains && (
                    <Link href={`/dashboard/website/${site.id}/domains`} className="wf2-link">
                      Domains &amp; subdomains
                    </Link>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="wf2-empty">
              <strong>No websites yet</strong>
              <p>Create your first blank website to reserve a managed subdomain and begin domain setup.</p>
            </div>
          )}
        </section>

        <section className="wf2-card" aria-labelledby="wf2-create">
          <div className="wf2-section-heading">
            <h2 id="wf2-create">Create a blank website</h2>
          </div>
          <p className="wf2-help">No old templates, visual editor, code editor or GitHub importer will be loaded. We will build the new editor on top of this foundation.</p>
          {canManage ? (
            <form className="wf2-form" onSubmit={handleCreate}>
              <label htmlFor="wf2-name">Website name</label>
              <input id="wf2-name" required maxLength={160} value={name}
                placeholder="e.g. My Construction Company"
                onChange={event => {
                  const value = event.target.value;
                  setName(value);
                  if (!slugEdited) setSlug(makeSlug(value));
                }} />
              <label htmlFor="wf2-slug">Subdomain slug</label>
              <input id="wf2-slug" required minLength={3} maxLength={63}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug} placeholder="my-construction-company"
                onChange={event => {
                  setSlugEdited(true);
                  setSlug(event.target.value.toLowerCase());
                }} />
              <small>Only lowercase letters, numbers and hyphens. The platform domain is configured by the administrator.</small>
              <button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create blank website'}
              </button>
              {notice && <p role="status" className="wf2-notice">{notice}</p>}
            </form>
          ) : (
            <p className="wf2-help">Your account can view websites. A manager must create new websites.</p>
          )}
        </section>
      </div>
    </main>
  );
}
