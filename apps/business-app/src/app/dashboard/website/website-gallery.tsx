'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { WebsiteCreate } from './website-create';
import './website-gallery.css';

export type GallerySite = {
  id: string; name: string; slug: string; published: boolean; status: string;
};
export type GalleryTemplate = { id: string; name: string; description: string };
const builtin: GalleryTemplate[] = [
  { id: 'starter:construction', name: 'Construction Company', description: 'Services, company introduction and project portfolio' },
  { id: 'starter:interior', name: 'Interior Design', description: 'Interior design showcase with elegant sections' },
  { id: 'starter:services', name: 'Professional Services', description: 'Simple and clean company services website' },
];

export function WebsiteGallery({ sites, templates, canManage, canCode }: {
  sites: GallerySite[]; templates: GalleryTemplate[];
  canManage: boolean; canCode: boolean;
}) {
  const [create, setCreate] = useState(false);
  const [chosen, setChosen] = useState('');
  const [search, setSearch] = useState('');
  const close = useCallback(() => setCreate(false), []);
  // The default starter and the company's actual saved site are both visible
  // at the top, even if there are no marketplace templates yet.
  const catalog = [...builtin, ...templates.filter(t => !builtin.some(b => b.id === t.id))];
  const shown = catalog.filter(t => (t.name + ' ' + t.description)
    .toLowerCase().includes(search.trim().toLowerCase()));
  const openNew = (id = '') => {setChosen(id);setCreate(true);};

  return <main id="main-content" className="wg-gallery">
    <header className="wg-header">
      <div><span className="wg-eyebrow">PROPULSE BUSINESS OS / WEBSITES</span>
        <h1>Website templates</h1>
        <p>Choose a design, click Edit, and customize your website visually. No code required.</p>
      </div>
      {canManage && <button type="button" className="wg-create" onClick={() => openNew()}>
        + Create website
      </button>}
    </header>
    {sites.length > 0 && <section className="wg-owned">
      <div className="wg-section-heading"><div><span className="wg-eyebrow">YOUR DEFAULT WEBSITE</span>
        <h2>Your website</h2><p>Your saved content stays intact when you edit it.</p></div></div>
      <div className="wg-owned-grid">
        {sites.map((site, index) => <article className="wg-owned-card" key={site.id}>
          <div className="wg-site-art" aria-hidden="true">
            <div className="wg-art-bar"><i/><i/><i/><b>{site.name}</b></div>
            <div className="wg-art-hero"><small>WELCOME TO</small>
              <strong>{site.name}</strong><span>Quality projects and professional services</span>
              <em>Explore website</em></div>
            <div className="wg-art-blocks"><i/><i/><i/></div>
          </div>
          <div className="wg-owned-meta"><span className="wg-status">{site.published ? '● Published' : '● Draft website'}</span>
            <strong>{site.name}</strong><small>{site.slug}</small>
            {index === 0 && <span className="wg-default-tag">Default</span>}
          </div>
          <div className="wg-card-actions">
            <Link className="wg-edit" href={`/dashboard/website/${site.id}/layout`}>✎ Edit website</Link>
            {canCode && <Link className="wg-secondary" href={`/dashboard/website/${site.id}/developer`}>Files</Link>}
            <Link className="wg-secondary" href={`/dashboard/website/${site.id}/design`}>Design</Link>
          </div>
        </article>)}
      </div>
    </section>}
    <section className="wg-catalog">
      <div className="wg-section-heading"><div><span className="wg-eyebrow">READY TO CUSTOMIZE</span>
        <h2>All templates</h2><p>Choose a starting design and change its words, images and sections.</p></div>
        <input type="search" aria-label="Search website templates" value={search}
          onChange={event => setSearch(event.target.value)} placeholder="Find a template…" />
      </div>
      <div className="wg-template-grid">
        {shown.map((template, index) => <article className="wg-template-card" key={template.id}>
          <div className={`wg-template-preview palette-${index % 4}`} aria-hidden="true">
            <div className="wg-template-window"><div className="wg-template-nav">
              <b>{template.name}</b><span>Home &nbsp; About &nbsp; Services</span></div>
              <div className="wg-template-hero"><small>WELCOME TO OUR COMPANY</small>
                <strong>{index === 1 ? 'Spaces made for living.' :
                  index === 0 ? 'Built around your vision.' : template.name}</strong>
                <span>Design · Build · Create</span><i/></div>
              <div className="wg-template-cards"><i/><i/><i/></div>
            </div>
          </div>
          <div className="wg-template-details">
            <strong>{template.name}</strong>
            <p>{template.description || 'A customizable website for your business.'}</p>
            {template.id === 'starter:construction' && <span className="wg-default-tag">Default template</span>}
            {canManage ? <button className="wg-edit" type="button" onClick={() => openNew(template.id)}>
              Use this template
            </button> : <span className="wg-disabled-note">Contact your website manager to use this design.</span>}
          </div>
        </article>)}
      </div>
      {!shown.length && <p className="wg-empty">No templates match that search.</p>}
    </section>
    {create && <WebsiteCreate
      key={chosen || 'default'}
      open={create}
      onClose={close}
      templates={catalog}
      canCode={canCode}
      initialTemplate={chosen || catalog[0]?.id || ''}
    />}
  </main>;
}
