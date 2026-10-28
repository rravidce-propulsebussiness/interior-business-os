'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { previewWebsite } from './actions';
import { applyWebsiteTemplate } from './entry-actions';
import './website-entry.css';

type TemplateOption = { id: string; name: string; description: string };
type Props = {
  id: string; name: string; version: number;
  hasContent: boolean; published: boolean; publishedVersionId: string | null;
  homePath: string; domainUrl: string | null;
  templates: TemplateOption[];
  canManage: boolean; canEdit: boolean; canCode: boolean;
  canDesign: boolean; canPublish: boolean;
};
const fallbackTemplates: TemplateOption[] = [
  {id:'starter:construction',name:'Construction Company',description:'Project showcase, services and enquiry-ready sections'},
  {id:'starter:interior',name:'Interior Design Studio',description:'Warm interiors portfolio and services'},
  {id:'starter:services',name:'Professional Services',description:'Clear business introduction, services and contact'},
];
function templateIcon(name: string) {
  const value = name.toLowerCase();
  if(value.includes('interior')) return '▤';
  if(value.includes('construct') || value.includes('home')) return '⌂';
  return '◈';
}

export function WebsiteEntry({
  id, name, version, hasContent, published, publishedVersionId,
  homePath, domainUrl, templates, canManage, canEdit, canCode, canDesign, canPublish,
}: Props) {
  const router = useRouter();
  const [html, setHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [message, setMessage] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const available = templates.length ? templates : fallbackTemplates;
  const base = `/dashboard/website/${id}`;

  // The overview itself renders immediately. Preview code is only loaded
  // when there is already a real page, without serializing the full document.
  useEffect(() => {
    if (!hasContent) return;
    let active = true;
    void previewWebsite(id, homePath, publishedVersionId ?? undefined)
      .then(result => {
        if (!active) return;
        setHtml(result);
        if (!result) setPreviewError('There is no preview for the selected home page.');
      })
      .catch(() => {
        if (active) setPreviewError('Preview is unavailable. You can still edit your website.');
      });
    return () => { active = false; };
  }, [id, homePath, publishedVersionId, hasContent]);

  const apply = () => {
    if (!chosen || !canManage || pending) return;
    start(async () => {
      const result = await applyWebsiteTemplate(id, version, chosen);
      setMessage(result.message);
      if (result.saved) {
        setChosen(null);
        router.push(`/dashboard/website/${id}/layout`);
        router.refresh();
      }
    });
  };
  return <main id="main-content" className="we-entry">
    <header className="we-head">
      <div className="we-identity"><span aria-hidden="true" className="we-symbol">▣</span>
        <div><span className="we-eyebrow">YOUR BUSINESS WEBSITE</span><h1>{hasContent ? 'Your website' : 'Choose your website design'}</h1>
          <p>{hasContent ? 'View your current site, then choose what you want to change.' :
            'Start with a ready-made design. You can edit all the content later.'}</p>
        </div>
      </div>
      <div className="we-head-actions">
        <Link href="/dashboard/website" className="we-outline">← All websites</Link>
        {hasContent && <span className={published ? 'we-status live' : 'we-status'}>
          ● {published ? 'Published' : 'Unpublished draft'}
        </span>}
      </div>
    </header>
    {message && <div className="we-notice" role="status">{message}</div>}
    {hasContent ? <>
      <div className="we-overview">
        <section className="we-site-card">
          <div className="we-site-top"><div><strong>{name}</strong><span>{published ? 'Published website' : 'Draft website preview'}</span></div>
            {domainUrl && <a href={domainUrl} target="_blank" rel="noopener noreferrer" className="we-outline">↗ Open live website</a>}
          </div>
          <div className="we-iframe-stage">
            {html ? <iframe title={name + ' website preview'} sandbox="allow-scripts"
              referrerPolicy="no-referrer" srcDoc={html}/> :
              <div className="we-preview-loading">
                <span aria-hidden="true">◈</span>
                <strong>{previewError ? 'Website preview unavailable' : 'Preparing your website view…'}</strong>
                <p>{previewError || 'The page editor is available without waiting for this preview.'}</p>
              </div>}
          </div>
        </section>
        <aside className="we-start-actions">
          <h2>What would you like to do?</h2>
          <p>Choose a task. You don't need to work with code for everyday edits.</p>
          {canEdit && <Link className="we-action-main" href={`${base}/layout`}>
            <span>✎</span><span><strong>Edit website</strong><small>Change texts, images, sections and pages</small></span><b>›</b>
          </Link>}
          {canDesign && <Link className="we-action" href={`${base}/design`}>
            <span>◈</span><span><strong>Colors & design</strong><small>Fonts, themes and styling</small></span><b>›</b>
          </Link>}
          {canCode && <Link className="we-action" href={`${base}/developer`}>
            <span>{'{ }'}</span><span><strong>Advanced file editor</strong><small>HTML, CSS and JavaScript components</small></span><b>›</b>
          </Link>}
          {canCode && <Link className="we-action" href={`${base}/git`}>
            <span>⌘</span><span><strong>GitHub & VS Code</strong><small>Edit a separate full-code project</small></span><b>›</b>
          </Link>}
          <Link className="we-action" href={`${base}/domains`}>
            <span>◎</span><span><strong>Website address</strong><small>Domains, publishing and settings</small></span><b>›</b>
          </Link>
          <span className="we-safety-note">{canPublish ? 'Changes stay in your draft until you publish.' :
            'Your role can preview the website. Publishing requires permission.'}</span>
        </aside>
      </div>
    </> : <section className="we-template-landing">
      <div className="we-choose-intro">
        <div><span className="we-step">STEP 1 OF 2</span><h2>Select a starting template</h2>
          <p>These are editable templates—not separate websites. Your current empty pages will be replaced only after you confirm.</p></div>
      </div>
      <div className="we-template-grid">
        {available.map((item,index) => <button key={item.id} type="button"
          className={chosen === item.id ? 'we-template selected' : 'we-template'}
          onClick={() => {setChosen(item.id);setMessage('');}} disabled={!canManage || pending}>
          <div className={`we-template-art variant-${index%4}`} aria-hidden="true">
            <div className="we-art-top"><i/><i/><i/><span/></div>
            <div className="we-art-content"><span className="we-art-symbol">{templateIcon(item.name)}</span>
              <div className="we-art-lines"><i/><i/><i/></div>
              <span className="we-art-button"/></div>
            <div className="we-art-bottom"><i/><i/><i/></div>
          </div>
          <span className="we-template-info"><strong>{item.name}</strong>
            <small>{item.description || 'Ready for your company information'}</small>
          </span>
          <span className="we-template-select">{chosen === item.id ? '✓ Selected' : 'Select template ›'}</span>
        </button>)}
      </div>
      <div className="we-choose-foot">
        <div><strong>{chosen ? 'Template selected' : 'Pick a design to continue'}</strong>
          <p>Next: customize the template with your company name, services and project photographs.</p></div>
        <button type="button" className="we-primary" disabled={!chosen || pending || !canManage} onClick={apply}>
          {pending ? 'Applying template…' : 'Use this template →'}
        </button>
      </div>
      {!canManage && <p className="we-safety-note">Only a website owner or authorized manager can apply a template.</p>}
    </section>}
  </main>;
}
