'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createWebsiteProject,
  publishTemplateProject,
  saveWebsiteProject,
} from './project-actions';
import './website-foundation.css';

export type WebsiteProjectRow = {
  websiteId: string;
  sourceKind: 'template' | 'repository';
  templateKey: string;
  repositoryUrl: string;
  branchName: string;
  framework: string;
  deploymentUrl: string;
  version: number;
};
export type WebsiteDomainRow = {
  websiteId: string;
  hostname: string;
  kind: 'subdomain' | 'custom';
  status: string;
  tlsStatus: string;
};
export type FoundationSite = {
  id: string;
  name: string;
  slug: string;
  status: string;
  published: boolean;
  updatedAt: string;
};
type WebsiteMode = 'template' | 'repository' | 'vscode';
type Stack = 'static' | 'react' | 'vite' | 'nextjs' | 'vue' |
  'astro' | 'php' | 'python' | 'node' | 'other';

const templates = [
  { key: 'construction', name: 'Construction & Interiors', headline: 'Modern homes built for better living', color: 'construction', caption: 'Business · Responsive' },
  { key: 'interiors', name: 'Interior Studio', headline: 'Transform your space', color: 'interiors', caption: 'Interior · Responsive' },
  { key: 'real-estate', name: 'Real Estate', headline: 'Find your dream home', color: 'real-estate', caption: 'Real estate · Responsive' },
  { key: 'corporate', name: 'Corporate', headline: 'Grow your business online', color: 'corporate', caption: 'Business · Responsive' },
] as const;
const stackChoices: {value: Stack; name: string}[] = [
  {value:'static', name:'Static HTML / CSS'},
  {value:'react', name:'React'},
  {value:'vite', name:'Vite'},
  {value:'nextjs', name:'Next.js'},
  {value:'vue', name:'Vue'},
  {value:'astro', name:'Astro'},
  {value:'node', name:'Node.js'},
  {value:'php', name:'PHP'},
  {value:'python', name:'Python'},
  {value:'other', name:'Other / Any Language'},
];
function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 63);
}
function vscodeLink(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'github.com' ||
        !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(u.pathname)) return null;
    return 'https://vscode.dev/github' + u.pathname.replace(/\.git$/, '');
  } catch { return null; }
}
function sourceDisplay(project: WebsiteProjectRow | undefined): string {
  if (!project) return 'Existing website';
  if (project.sourceKind === 'template') return 'Template';
  return 'Git repository';
}

export function WebsiteFoundation({
  sites, projects, domains, quota, canManage, canViewDomains,
  canPublish, baseDomain, companyName,
}: {
  sites: FoundationSite[];
  projects: WebsiteProjectRow[];
  domains: WebsiteDomainRow[];
  quota: number;
  canManage: boolean;
  canViewDomains: boolean;
  canPublish: boolean;
  baseDomain: string;
  companyName: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<WebsiteMode>('template');
  const [chosenTemplate, setChosenTemplate] = useState<string>('construction');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(sites[0]?.id || '');
  const [showCreate, setShowCreate] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [newRepository, setNewRepository] = useState('');
  const [branch, setBranch] = useState('main');
  const [framework, setFramework] = useState<Stack>('other');
  const [requestedHost, setRequestedHost] = useState<'subdomain'|'custom'>('subdomain');
  const [notice, setNotice] = useState('');
  const [saving, start] = useTransition();
  const [sourceEdit, setSourceEdit] = useState(false);
  const [editRepo, setEditRepo] = useState('');
  const [editBranch, setEditBranch] = useState('main');
  const [editFramework, setEditFramework] = useState<Stack>('other');
  const [editDeployment, setEditDeployment] = useState('');

  const projectMap = useMemo(() => new Map(projects.map(p => [p.websiteId,p])), [projects]);
  const chosenSite = sites.find(s => s.id === selectedId) ?? sites[0];
  const selected = chosenSite ? projectMap.get(chosenSite.id) : undefined;
  const selectedDomains = chosenSite ? domains.filter(d => d.websiteId === chosenSite.id) : [];
  const managed = selectedDomains.find(d => d.kind === 'subdomain');
  const activeCustom = selectedDomains.find(d =>
    d.kind === 'custom' && d.status === 'active' && d.tlsStatus === 'ready');
  const headlineDomain = activeCustom ?? managed ?? selectedDomains[0];
  const capReached = sites.filter(s => s.status !== 'archived').length >= quota;
  const filteredTemplates = templates.filter(t =>
    (t.name + ' ' + t.caption).toLowerCase().includes(search.trim().toLowerCase()));

  function openCreate(nextMode: WebsiteMode, templateKey = chosenTemplate) {
    setMode(nextMode);
    setChosenTemplate(templateKey);
    setSiteName(companyName);
    setSlug(slugify(companyName));
    setSlugTouched(false);
    setRequestedHost('subdomain');
    setNotice('');
    setShowCreate(true);
  }
  function selectSite(id: string) {
    setSelectedId(id);
    setSourceEdit(false);
    setNotice('');
  }
  function startEdit() {
    if (!selected) return;
    setEditRepo(selected.repositoryUrl || '');
    setEditBranch(selected.branchName || 'main');
    setEditFramework((stackChoices.find(s => s.value === selected.framework)?.value || 'other'));
    setEditDeployment(selected.deploymentUrl || '');
    setSourceEdit(true);
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || capReached || !canManage) return;
    setNotice('');
    start(async () => {
      const result = await createWebsiteProject({
        name: siteName, slug, sourceKind: mode === 'template' ? 'template' : 'repository',
        ...(mode === 'template' ? {templateKey: chosenTemplate} :
          {repositoryUrl: newRepository, branchName: branch, framework}),
      });
      setNotice(result.message);
      if (result.id) {
        setShowCreate(false);
        setSelectedId(result.id);
        router.refresh();
      }
    });
  }
  function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosenSite || !selected || saving) return;
    start(async () => {
      const result = await saveWebsiteProject(chosenSite.id, selected.version, {
        repositoryUrl:editRepo, branchName:editBranch,
        framework:editFramework, deploymentUrl:editDeployment,
      });
      setNotice(result.message);
      if (result.version) {
        setSourceEdit(false);
        router.refresh();
      }
    });
  }
  function publishTemplate() {
    if (!chosenSite || saving) return;
    start(async () => {
      const result = await publishTemplateProject(chosenSite.id);
      setNotice(result.message);
      if (result.ok) router.refresh();
    });
  }

  return <main id="main-content" className="wf3">
    <header className="wf3-heading">
      <div>
        <p className="wf3-kicker">PROPULSE BUSINESS OS / WEBSITES</p>
        <h1>Website Studio</h1>
        <p>Create, connect and manage independent business websites.</p>
      </div>
      <div className="wf3-heading-actions">
        <span className="wf3-quota">{sites.filter(s => s.status !== 'archived').length} / {quota} website{quota === 1 ? '' : 's'}</span>
        <button className="wf3-primary" onClick={() => openCreate(mode)}
          disabled={!canManage || capReached}>＋ Create Website</button>
      </div>
    </header>

    <div className="wf3-columns">
      <div className="wf3-main">
        <section className="wf3-hero">
          <div>
            <span className="wf3-kicker">GO LIVE WITH CONFIDENCE</span>
            <h2>Launch a <em>Professional Website</em></h2>
            <p>Choose a ready-made template or connect a Git repository. Develop the frontend and backend independently in any language, then use a business subdomain or your own domain.</p>
            <span className="wf3-hero-foot">One website per business by default · More only with approved website limits</span>
          </div>
          <div className="wf3-device-art" aria-hidden="true">
            <div className="wf3-laptop"><div className="wf3-mini-nav">◈ &nbsp; HOME &nbsp; PROJECTS &nbsp; SERVICES</div><div className="wf3-mini-hero"><b>Spaces made for living.</b><span>Design. Build. Inspire.</span><i/></div></div>
            <div className="wf3-phone"><span>◈</span><b>Beautiful spaces</b><i/></div>
          </div>
        </section>

        <div className="wf3-source-cards" role="group" aria-label="Website source">
          <button className={'wf3-source-card '+(mode === 'template' ? 'is-active' : '')}
            onClick={() => setMode('template')}>
            <span className="wf3-source-icon">◇</span><span><strong>Use a Template</strong><small>Ready-made, professional and responsive website designs.</small></span><b>{mode === 'template' ? '◉' : '○'}</b>
          </button>
          <button className={'wf3-source-card '+(mode === 'repository' ? 'is-active' : '')}
            onClick={() => setMode('repository')}>
            <span className="wf3-source-icon wf3-git">⌘</span><span><strong>Connect Git Repository</strong><small>Keep each company's code and backend in its own repository.</small></span><b>{mode === 'repository' ? '◉' : '○'}</b>
          </button>
          <button className={'wf3-source-card '+(mode === 'vscode' ? 'is-active' : '')}
            onClick={() => setMode('vscode')}>
            <span className="wf3-source-icon wf3-code">&lt;/&gt;</span><span><strong>Develop with VS Code</strong><small>Open the company's GitHub project in VS Code.</small></span><b>{mode === 'vscode' ? '◉' : '○'}</b>
          </button>
        </div>

        {mode === 'template' ? <section className="wf3-panel wf3-templates">
          <div className="wf3-section-title">
            <div><h2>Choose a Template</h2><p>Templates are independent website starters, not an in-dashboard visual editor.</p></div>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              aria-label="Search templates" placeholder="Search templates…" />
          </div>
          <div className="wf3-template-grid">
            {filteredTemplates.map(template =>
              <article key={template.key} className="wf3-template-card">
                <div className={'wf3-preview wf3-'+template.color}>
                  <div className="wf3-preview-navbar"><span>◈ {template.name.split(' ')[0]}</span><small>HOME &nbsp; ABOUT &nbsp; CONTACT</small></div>
                  <div className="wf3-preview-text"><small>WELCOME TO OUR COMPANY</small><b>{template.headline}</b><i>Explore services</i></div>
                </div>
                <div className="wf3-template-meta"><strong>{template.name}</strong><small>{template.caption}</small></div>
                <button onClick={() => openCreate('template',template.key)}
                  disabled={!canManage || capReached}>Use Template</button>
              </article>)}
          </div>
          {!filteredTemplates.length && <p className="wf3-muted">No templates match your search.</p>}
        </section> : <section className="wf3-panel wf3-git-start">
          <div className="wf3-section-title"><div>
            <h2>{mode === 'vscode' ? 'Develop in VS Code' : 'Connect a Git Repository'}</h2>
            <p>Each company can own a separate codebase and hosting environment.</p>
          </div></div>
          <p>GitHub, GitLab and Bitbucket links are supported. Your source can contain any programming language. Business OS stores the repository link; it does not execute untrusted application code.</p>
          <button className="wf3-primary" disabled={capReached || !canManage} onClick={() => openCreate(mode)}>
            ＋ Connect a website project
          </button>
          <div className="wf3-example"><code>https://github.com/your-company/your-website</code><small>Use VS Code locally or VS Code for Web with GitHub; deployment remains with your hosting provider.</small></div>
        </section>}

        <section className="wf3-panel wf3-sites">
          <div className="wf3-section-title">
            <div><h2>Your Websites <span>{sites.length}</span></h2>
              <p>A custom domain and a subdomain refer to the same website, not two separate websites.</p>
            </div>
            {capReached && <span className="wf3-cap">Website limit reached</span>}
          </div>
          <div className="wf3-table-wrap">
            <table className="wf3-table">
              <thead><tr><th>Website</th><th>Domain / Subdomain</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
              {sites.map(site => {
                const source = projectMap.get(site.id);
                const siteDomains = domains.filter(d => d.websiteId === site.id);
                const primary = siteDomains.find(d => d.kind === 'custom' && d.status === 'active' && d.tlsStatus === 'ready') ??
                  siteDomains.find(d => d.kind === 'subdomain') ?? siteDomains[0];
                return <tr key={site.id} className={chosenSite?.id === site.id ? 'is-selected' : ''}>
                  <td><button className="wf3-site-name" onClick={() => selectSite(site.id)}><strong>{site.name}</strong><small>{site.slug}</small></button></td>
                  <td><span className="wf3-domain-value">{primary?.hostname || (baseDomain ? site.slug+'.'+baseDomain : 'Not configured')}</span></td>
                  <td>{sourceDisplay(source)}</td>
                  <td><span className={'wf3-state ' + (site.published ? 'wf3-published' : 'wf3-pending')}>
                    {site.published ? '● Published' : source?.sourceKind === 'repository' ? '● External' : '● Draft'}</span></td>
                  <td><div className="wf3-row-actions">
                    <button onClick={() => selectSite(site.id)}>Manage</button>
                    {canViewDomains && <Link href={'/dashboard/website/'+site.id+'/domains'}>Domains</Link>}
                    {source?.repositoryUrl && <a href={source.repositoryUrl} target="_blank" rel="noreferrer">Git</a>}
                  </div></td>
                </tr>;
              })}
              {!sites.length && <tr><td colSpan={5}>No websites yet. Choose a template or connect a repository to create one.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="wf3-sidebar">
        <section className="wf3-panel wf3-side-panel">
          <h2>◎ Domain &amp; Deployment</h2>
          <div className="wf3-side-section">
            <div className="wf3-side-title"><strong>Selected website</strong></div>
            {sites.length > 0 ? <select aria-label="Select website" value={chosenSite?.id || ''} onChange={e => selectSite(e.target.value)}>
              {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select> : <p className="wf3-muted">Create a website to configure its domains.</p>}
          </div>
          {chosenSite && <>
            <div className="wf3-side-section">
              <div className="wf3-side-title"><strong>Domains</strong><small>Both address types supported</small></div>
              <div className="wf3-domain-choice">
                <span className="wf3-radio">◉</span><div><strong>Business OS Subdomain</strong>
                  <small>Managed platform hostname</small>
                  <p>{managed?.hostname || (baseDomain ? chosenSite.slug+'.'+baseDomain : 'Platform domain not configured')}</p>
                  <small>{managed ? managed.status + ' · HTTPS '+managed.tlsStatus : 'Pending configuration'}</small>
                </div>
              </div>
              <div className="wf3-domain-choice">
                <span className="wf3-radio">○</span><div><strong>Custom Domain</strong>
                  <small>Your registered domain, e.g. www.company.com</small>
                  {selectedDomains.filter(d => d.kind === 'custom').map(domain =>
                    <p key={domain.hostname}>{domain.hostname}<small>{domain.status} · HTTPS {domain.tlsStatus}</small></p>)}
                  {!selectedDomains.some(d=>d.kind === 'custom') && <p>No custom domain connected</p>}
                </div>
              </div>
              {canViewDomains && <Link className="wf3-outline" href={'/dashboard/website/'+chosenSite.id+'/domains'}>
                Manage domain &amp; DNS
              </Link>}
            </div>
            <div className="wf3-side-section">
              <div className="wf3-side-title"><strong>Deployment</strong></div>
              <div className="wf3-side-field"><small>Website source</small><strong>{sourceDisplay(selected)}</strong></div>
              {selected?.repositoryUrl && <>
                <a className="wf3-repo-url" href={selected.repositoryUrl} target="_blank" rel="noreferrer">{selected.repositoryUrl}</a>
                <div className="wf3-side-field"><small>Branch / Stack</small><strong>{selected.branchName} · {selected.framework}</strong></div>
                <div className="wf3-action-row">
                  <a className="wf3-outline" href={selected.repositoryUrl} target="_blank" rel="noreferrer">Open Git</a>
                  {vscodeLink(selected.repositoryUrl) &&
                    <a className="wf3-outline" href={vscodeLink(selected.repositoryUrl)!} target="_blank" rel="noreferrer">VS Code</a>}
                </div>
              </>}
              {selected?.deploymentUrl && <a className="wf3-repo-url" href={selected.deploymentUrl} target="_blank" rel="noreferrer">View external deployment</a>}
              {selected && canManage && !sourceEdit && <button className="wf3-outline" onClick={startEdit}>
                {selected.repositoryUrl ? 'Update source & deployment' : 'Connect independent Git repository'}
              </button>}
              {sourceEdit && selected && <form className="wf3-edit-form" onSubmit={saveProject}>
                <label>Repository URL<input required type="url" value={editRepo} onChange={e=>setEditRepo(e.target.value)} placeholder="https://github.com/org/project" /></label>
                <label>Branch<input required value={editBranch} onChange={e=>setEditBranch(e.target.value)} /></label>
                <label>Framework<select value={editFramework} onChange={e=>setEditFramework(e.target.value as Stack)}>
                  {stackChoices.map(option=><option key={option.value} value={option.value}>{option.name}</option>)}
                </select></label>
                <label>External deployment URL (optional)<input type="url" value={editDeployment}
                  onChange={e=>setEditDeployment(e.target.value)} placeholder="https://company.hosting-provider.com"/></label>
                <button className="wf3-primary" disabled={saving}>Save repository connection</button>
                <button type="button" className="wf3-outline" onClick={()=>setSourceEdit(false)}>Cancel</button>
              </form>}
              {selected?.sourceKind === 'template' && !selected.repositoryUrl && canPublish &&
                <button className="wf3-primary wf3-deploy" disabled={saving || chosenSite.published} onClick={publishTemplate}>
                  {chosenSite.published ? '✓ Template published' : saving ? 'Publishing…' : 'Publish Template'}
                </button>}
              {selected?.repositoryUrl && <p className="wf3-legal">Full-code sites deploy on isolated external hosting. Connecting a repository or deployment URL does not run a build or activate domain routing.</p>}
            </div>
            <div className="wf3-side-section wf3-ssl">
              <strong>◇ SSL &amp; Security</strong>
              <span className={headlineDomain?.tlsStatus === 'ready' ? 'wf3-ssl-ready' : 'wf3-ssl-pending'}>
                {headlineDomain?.tlsStatus === 'ready' ? 'HTTPS Ready' : 'Pending'}
              </span>
              <small>SSL status is read from the website domain records.</small>
            </div>
          </>}
        </section>
      </aside>
    </div>
    {notice && <div className="wf3-message" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss message">×</button></div>}

    {showCreate && <div className="wf3-modal-backdrop" role="presentation">
      <section className="wf3-modal" role="dialog" aria-modal="true" aria-labelledby="wf3-modal-title">
        <div className="wf3-modal-head"><h2 id="wf3-modal-title">{mode === 'template' ? 'Use a Website Template' : 'Connect an Independent Website'}</h2>
          <button onClick={()=>setShowCreate(false)} aria-label="Close create website">×</button></div>
        <p>{mode === 'template' ? 'Choose a starter design and create a website for this business.' :
          'Connect your company-owned source code. Frontend and backend are developed and hosted separately.'}</p>
        <form onSubmit={create} className="wf3-create-form">
          <label>Website name<input required maxLength={160} value={siteName}
            onChange={e => {setSiteName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value));}} /></label>
          <label>Managed subdomain slug<input required minLength={3} maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={slug} onChange={e=>{setSlugTouched(true);setSlug(e.target.value.toLowerCase());}} /></label>
          <div className="wf3-domain-method" role="group" aria-label="Preferred website address">
            <label><input type="radio" checked={requestedHost === 'subdomain'} onChange={()=>setRequestedHost('subdomain')}/> Business OS subdomain</label>
            <label><input type="radio" checked={requestedHost === 'custom'} onChange={()=>setRequestedHost('custom')}/> Connect custom domain later</label>
          </div>
          <small>{requestedHost === 'custom' ? 'A managed subdomain is reserved first; connect your own domain after creation and DNS verification.' :
            'Your platform hostname will be reserved when the website is created.'}</small>
          {mode === 'template' ? <label>Template<select value={chosenTemplate} onChange={e=>setChosenTemplate(e.target.value)}>
            {templates.map(t=><option key={t.key} value={t.key}>{t.name}</option>)}
          </select></label> : <>
            <label>Git repository URL<input type="url" required placeholder="https://github.com/company/project"
              value={newRepository} onChange={e=>setNewRepository(e.target.value)} /></label>
            <label>Branch<input value={branch} required onChange={e=>setBranch(e.target.value)}/></label>
            <label>Framework / Backend<select value={framework} onChange={e=>setFramework(e.target.value as Stack)}>
              {stackChoices.map(s=><option key={s.value} value={s.value}>{s.name}</option>)}
            </select></label>
          </>}
          <div className="wf3-modal-actions"><button className="wf3-outline" type="button" onClick={()=>setShowCreate(false)}>Cancel</button>
            <button className="wf3-primary" type="submit" disabled={saving || capReached}>{saving?'Creating…':'Create Website'}</button>
          </div>
        </form>
      </section>
    </div>}
  </main>;
}
