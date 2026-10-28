'use client';
import { useWebsitePreviewSrcDoc } from './website-preview-nonce';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { WebsiteDocument } from '@business-os/website-builder';
import { defaultTheme } from '@business-os/website-builder';
import { saveWebsiteSection } from './actions';
import { renderWebsiteThemePreview } from './design-preview';
import './design-studio.css';

type Theme = WebsiteDocument['theme'];
type ColorKey = 'primary' | 'secondary' | 'accent' | 'background' | 'surface' | 'text' | 'muted' | 'border';
type Device = 'desktop' | 'tablet' | 'mobile';
const colors: { key: ColorKey; label: string; help: string }[] = [
  { key: 'primary', label: 'Primary brand', help: 'Primary buttons and accents' },
  { key: 'secondary', label: 'Secondary brand', help: 'Supporting brand elements' },
  { key: 'accent', label: 'Accent', help: 'Highlights and calls to action' },
  { key: 'background', label: 'Page background', help: 'Overall website background' },
  { key: 'surface', label: 'Cards and surfaces', help: 'Panels and sections' },
  { key: 'text', label: 'Body text', help: 'Main text color' },
  { key: 'muted', label: 'Secondary text', help: 'Descriptions and captions' },
  { key: 'border', label: 'Borders', help: 'Outlines and dividers' },
];
const presets: { name: string; detail: string; values: Pick<Theme, ColorKey> }[] = [
  { name: 'Warm Contemporary', detail: 'Copper, ivory and natural neutrals', values: {
    primary: '#E76424', secondary: '#F1D5C0', accent: '#F59D55',
    background: '#FFF9F4', surface: '#FFFFFF', text: '#322C2B', muted: '#786F6B', border: '#E9DBCF',
  }},
  { name: 'Soft Sage', detail: 'Natural, quiet and architectural', values: {
    primary: '#58745E', secondary: '#DFE8D8', accent: '#C69F70',
    background: '#F8FAF5', surface: '#FFFFFF', text: '#28342B', muted: '#687569', border: '#DBE4D8',
  }},
  { name: 'Terracotta', detail: 'Earthy modern interior palette', values: {
    primary: '#A8563A', secondary: '#F3DCCB', accent: '#D89456',
    background: '#FFF8F1', surface: '#FFFEFC', text: '#49372F', muted: '#806D61', border: '#E8D4C6',
  }},
  { name: 'Minimal Sand', detail: 'Gentle neutral professional look', values: {
    primary: '#74614A', secondary: '#E8DED2', accent: '#BA905F',
    background: '#FBFAF7', surface: '#FFFFFF', text: '#34302B', muted: '#766F67', border: '#E8E1D9',
  }},
];
const fontNames: Record<Theme['headingFont'], string> = {
  'sans-serif': 'Sans serif', serif: 'Serif', monospace: 'Monospace',
};
const fontFamilies: Record<Theme['headingFont'], string> = {
  'sans-serif': 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, Times New Roman, serif',
  monospace: 'monospace',
};
const isLight = (hex: string) => {
  const pairs = hex.slice(1).match(/../g);
  if (!pairs) return true;
  const [r, g, b] = pairs.map(item => parseInt(item, 16));
  return ((r ?? 0) * .299 + (g ?? 0) * .587 + (b ?? 0) * .114) > 158;
};

export function WebsiteDesignStudio({
  id, name, initialTheme, pages, initialVersion, canEdit,
}: {
  id: string;
  name: string;
  initialTheme: Theme;
  pages: { id: string; title: string; path: string }[];
  initialVersion: number;
  canEdit: boolean;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [saved, setSaved] = useState<Theme>(initialTheme);
  const [version, setVersion] = useState(initialVersion);
  const [device, setDevice] = useState<Device>('desktop');
  const [previewMode, setPreviewMode] = useState<'site' | 'sample'>('sample');
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [pagePath, setPagePath] = useState(pages.find(p => p.path === '/')?.path ?? pages[0]?.path ?? '/');
  const [message, setMessage] = useState('');
  const [saving, startSaving] = useTransition();
  const [previewPending, startPreview] = useTransition();
  const requestRef = useRef(0);
  const changed = JSON.stringify(saved) !== JSON.stringify(theme);
  const previewSrcDoc = useWebsitePreviewSrcDoc(preview);
  const foreground = isLight(theme.primary) ? '#302D2A' : '#FFFFFF';

  // Full preview is opt-in. Instant style sample never waits for the server.
  const loadPreview = (path: string, nextTheme: Theme) => {
    const request = ++requestRef.current;
    setPreviewError('');
    startPreview(async () => {
      try {
        const html = await renderWebsiteThemePreview(id, nextTheme, path);
        if (request !== requestRef.current) return;
        setPreview(html ?? '');
        setPreviewError(html ? '' : 'There is no preview for this page.');
      } catch {
        if (request !== requestRef.current) return;
        setPreview('');
        setPreviewError('Website preview is temporarily unavailable. The style sample is still interactive.');
      }
    });
  };
  const choosePreviewMode = (mode: 'site' | 'sample') => {
    setPreviewMode(mode);
    if (mode === 'site') loadPreview(pagePath, theme);
    else ++requestRef.current; // Ignore stale preview responses if user exits.
  };
  const selectPreviewPage = (path: string) => {
    setPagePath(path);
    loadPreview(path, theme);
  };
  const showInstantSample = () => {
    if (previewMode === 'site') {
      setPreviewMode('sample');
      ++requestRef.current;
    }
  };

  const edit = <K extends keyof Theme>(key: K, value: Theme[K]) => {
    if (!canEdit) return;
    setTheme(current => ({ ...current, [key]: value }));
    showInstantSample();
    setMessage('');
  };
  const applyPreset = (values: Pick<Theme, ColorKey>) => {
    if (!canEdit) return;
    setTheme(current => ({ ...current, ...values }));
    showInstantSample();
    setMessage('');
  };
  const save = () => {
    startSaving(async () => {
      const result = await saveWebsiteSection(id, version, 'theme', theme);
      if (result.version) {
        setVersion(result.version);
        setSaved(theme);
      }
      setMessage(result.message);
    });
  };

  return <main id="main-content" className="website-design">
    <header className="wd-heading">
      <div className="wd-heading-main">
        <span className="wd-heading-icon" aria-hidden="true">◈</span>
        <div>
          <span className="wd-eyebrow">WEBSITE STUDIO / DESIGN SYSTEM</span>
          <h1>Design &amp; appearance</h1>
          <p>Fine-tune your website's personality, colors, typography and layout.</p>
        </div>
      </div>
      <div className="wd-actions">
        <span className={changed ? 'wd-save-state dirty' : 'wd-save-state'}>{changed ? '● Unsaved changes' : '✓ Draft saved'}</span>
        <Link href={`/dashboard/website/${id}`} className="wd-outline">← Website Studio</Link>
        <button type="button" disabled={!canEdit || saving || !changed}
          className="wd-primary" onClick={save}>{saving ? 'Saving…' : 'Save design changes'}</button>
      </div>
    </header>

    {message && <p role="status" className="wd-notice">{message}</p>}
    <div className="wd-tabs">
      <span className="wd-tab selected">◈ &nbsp;Design</span>
      <Link href={`/dashboard/website/${id}`}>▣ &nbsp; Pages &amp; layout</Link>
      <Link href={`/dashboard/website/${id}/seo`}>⚙ &nbsp; SEO settings</Link>
      <Link href={`/dashboard/website/${id}/versions`}>↶ &nbsp; Versions</Link>
    </div>

    <div className="wd-layout">
      <div className="wd-settings-column">
        <section className="wd-card">
          <div className="wd-card-title">
            <span className="wd-section-icon">✦</span>
            <div><h2>Theme collections</h2><p>Start with a curated look or keep your current design.</p></div>
          </div>
          <div className="wd-presets">
            {presets.map(preset =>
              <button type="button" key={preset.name} disabled={!canEdit}
                className="wd-preset" onClick={() => applyPreset(preset.values)}>
                <span className="wd-preset-colors" aria-hidden="true">
                  {(['primary','secondary','background','text'] as const).map(key =>
                    <i key={key} style={{backgroundColor:preset.values[key]}}/>)}
                </span>
                <strong>{preset.name}</strong>
                <small>{preset.detail}</small>
              </button>)}
          </div>
        </section>

        <section className="wd-card">
          <div className="wd-card-title">
            <span className="wd-section-icon">◉</span>
            <div><h2>Brand colors</h2><p>A consistent palette for every page and component.</p></div>
          </div>
          <div className="wd-color-grid">
            {colors.map(item => <label className="wd-color-item" key={item.key}>
              <input type="color" aria-label={item.label}
                disabled={!canEdit} value={theme[item.key]}
                onChange={event => edit(item.key, event.target.value)}
              />
              <span><strong>{item.label}</strong><small>{item.help}</small>
                <code>{theme[item.key]}</code></span>
            </label>)}
          </div>
        </section>

        <section className="wd-card">
          <div className="wd-card-title">
            <span className="wd-section-icon">Aa</span>
            <div><h2>Typography</h2><p>Select clean and readable fonts for the entire website.</p></div>
          </div>
          <div className="wd-field-row">
            {(['headingFont','bodyFont'] as const).map(key =>
              <label key={key} className="wd-field">
                <strong>{key === 'headingFont' ? 'Heading font' : 'Body font'}</strong>
                <select disabled={!canEdit} value={theme[key]}
                  onChange={event => edit(key, event.target.value as Theme[typeof key])}>
                  {(Object.keys(fontNames) as Theme['headingFont'][]).map(value =>
                    <option key={value} value={value}>{fontNames[value]}</option>)}
                </select>
              </label>)}
          </div>
          <div className="wd-type-sample" style={{backgroundColor:theme.background,color:theme.text}}>
            <strong style={{fontFamily:fontFamilies[theme.headingFont]}}>Design with confidence.</strong>
            <p style={{fontFamily:fontFamilies[theme.bodyFont],color:theme.muted}}>
              Spaces made for the way you live, crafted with thoughtful details.
            </p>
          </div>
        </section>

        <section className="wd-card">
          <div className="wd-card-title">
            <span className="wd-section-icon">▦</span>
            <div><h2>Layout &amp; components</h2><p>Adjust spacing, corners, buttons and site width.</p></div>
          </div>
          <div className="wd-field-row">
            {([
              ['containerWidth','Content width (px)',320,1920,20],
              ['spacing','Base spacing (px)',2,32,1],
              ['radius','Corner radius (px)',0,64,1],
            ] as const).map(([key,label,min,max,step]) =>
              <label className="wd-field" key={key}>
                <strong>{label}</strong>
                <input disabled={!canEdit} type="number" min={min} max={max} step={step}
                  value={theme[key]} onChange={event => {
                    const num = Number(event.target.value);
                    if(Number.isFinite(num)) edit(key, Math.max(min,Math.min(max,num)));
                  }} />
              </label>)}
          </div>
          <div className="wd-field-row wd-field-row-two">
            {([
              ['shadow','Card shadows',['none','soft','strong']],
              ['buttonStyle','Button style',['solid','outline','rounded']],
            ] as const).map(([key,label,options]) =>
              <label className="wd-field" key={key}>
                <strong>{label}</strong>
                <select disabled={!canEdit} value={theme[key]} onChange={event =>
                  edit(key, event.target.value as Theme[typeof key])}>
                  {options.map(value => <option value={value} key={value}>{value.replace(/^./,letter=>letter.toUpperCase())}</option>)}
                </select>
              </label>)}
          </div>
          <div className="wd-reset-actions">
            <button disabled={!canEdit || !changed} type="button" onClick={() => {setTheme(saved);showInstantSample();setMessage('Unsaved theme edits discarded.');}}>
              Discard unsaved changes
            </button>
            <button disabled={!canEdit} type="button" onClick={() => {setTheme({ ...defaultTheme });showInstantSample();setMessage('Default palette loaded in your draft. Save to keep it.');}}>
              Use original website defaults
            </button>
          </div>
        </section>
      </div>
      <aside className="wd-preview-column">
        <section className="wd-preview-card">
          <div className="wd-preview-head">
            <div><h2>Live design preview</h2><p>{name} · Draft only</p></div>
            <span className="wd-live-indicator">● {previewPending ? 'Updating' : 'Preview'}</span>
          </div>
          <div className="wd-preview-controls">
            <div className="wd-device-group" role="group" aria-label="Preview device">
              {(['desktop','tablet','mobile'] as const).map(value =>
                <button type="button" key={value} title={value}
                  aria-label={value+' preview'} aria-pressed={device === value}
                  className={device === value ? 'active' : ''}
                  onClick={() => setDevice(value)}>
                  {value === 'desktop' ? '▣' : value === 'tablet' ? '▥' : '▯'}
                </button>)}
            </div>
            <div className="wd-device-group" role="group" aria-label="Preview content">
              <button className={previewMode === 'site' ? 'active' : ''}
                onClick={() => choosePreviewMode('site')}>My site</button>
              <button className={previewMode === 'sample' ? 'active' : ''}
                onClick={() => choosePreviewMode('sample')}>Style sample</button>
            </div>
          </div>
          {previewMode === 'site' && <label className="wd-page-picker">Preview page
            <select value={pagePath} onChange={event => selectPreviewPage(event.target.value)}>
              {pages.map(page => <option key={page.id} value={page.path}>{page.title} ({page.path})</option>)}
            </select>
          </label>}
          {previewMode === 'site' && <div className="wd-preview-refresh">
            <span>{previewPending ? 'Rendering your website…' : 'Real website preview is generated only when requested.'}</span>
            <button type="button" disabled={previewPending}
              onClick={() => loadPreview(pagePath, theme)}>
              ↻ Refresh website preview
            </button>
          </div>}
          <div className="wd-preview-stage">
            <div className={`wd-preview-browser ${device}`}>
              <div className="wd-browser-top"><span>● ● ●</span><small>{name} · {pagePath}</small><span>↗</span></div>
              {previewMode === 'site' && preview && !previewError ? (
                <iframe title="Website theme preview" sandbox="allow-scripts"
                  referrerPolicy="no-referrer" srcDoc={previewSrcDoc} />
              ) : <div className="wd-sample" style={{
                color:theme.text,background:theme.background,fontFamily:fontFamilies[theme.bodyFont],
              }}>
                <nav style={{background:theme.surface,borderBottom:'1px solid '+theme.border}}>
                  <b style={{color:theme.primary}}>{name}</b>
                  <span>Home &nbsp; Services &nbsp; Projects</span>
                </nav>
                <div className="wd-sample-hero">
                  <span style={{color:theme.accent}}>CRAFTED WITH PURPOSE</span>
                  <h3 style={{fontFamily:fontFamilies[theme.headingFont]}}>Create spaces worth coming home to.</h3>
                  <p style={{color:theme.muted}}>Thoughtful design. Quality construction. A home that feels uniquely yours.</p>
                  <div className="wd-sample-buttons">
                    <span style={{background: theme.buttonStyle==='outline'?'transparent':theme.primary,
                      color:theme.buttonStyle==='outline'?theme.primary:foreground,
                      border:'1px solid '+theme.primary,
                      borderRadius:theme.buttonStyle==='rounded'?40:theme.radius}}>
                      Explore services
                    </span>
                    <span style={{border:'1px solid '+theme.border,borderRadius:theme.radius}}>Our projects</span>
                  </div>
                </div>
                <div className="wd-sample-tiles">{['Design','Build','Renovate'].map(item =>
                  <div key={item} style={{background:theme.surface,border:'1px solid '+theme.border,
                    borderRadius:theme.radius,
                    boxShadow:theme.shadow==='none'?'none':theme.shadow==='soft'?'0 6px 20px #00000010':'0 12px 30px #00000020'}}>
                    <span style={{color:theme.accent}}>◈</span><strong>{item}</strong>
                  </div>)}</div>
              </div>}
            </div>
          </div>
          {previewError && previewMode === 'site' && <p className="wd-preview-warning" role="status">{previewError}</p>}
          <p className="wd-preview-note">Style sample updates instantly without a server request. Open My site for the actual website preview. Publishing remains separate.</p>
        </section>
        <section className="wd-guide">
          <strong>✦ &nbsp; Design tips</strong>
          <p>Use a readable contrast between your page background and text. Keep the accent color focused on important actions.</p>
          <Link href={`/dashboard/website/${id}`}>Return to page editor →</Link>
        </section>
      </aside>
    </div>
  </main>;
}
