'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import type { WebsiteDocument } from '@business-os/website-builder';
import { publishWebsite } from './actions';
import { previewTemplateFiles, saveTemplateFiles, validateTemplateFiles } from './template-actions';
import { fileSlug, type TemplateSources, type TemplatePage, type TemplateDraft } from './template-workspace';
import './template-editor.css';

type Code = WebsiteDocument['code'][number];
type FileField = 'html' | 'css' | 'javascript';
type Selection = { kind: 'page' | 'component' | 'global'; id: string };
type Props = {
  id: string; name: string; initial: TemplateSources; pages: TemplatePage[];
  version: number; canEdit: boolean; canEditCss: boolean; canPublish: boolean;
  canCreatePage: boolean;
};

const makeId = () => 'n' + crypto.randomUUID().replaceAll('-', '');
const displayName = (item: Code) => item.name
  .replace(/^components\//, '').replace(/^pages\//, '').replace(/\.html$/, '');
const titleName = (value: string) => value.replace(/-/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

export function TemplateEditor({
  id, name, initial, pages: initialPages, version: startVersion,
  canEdit, canEditCss, canPublish, canCreatePage,
}: Props) {
  const [sources, setSources] = useState(initial);
  const [savedSources, setSavedSources] = useState(initial);
  const [pages, setPages] = useState(initialPages);
  const [newPageIds, setNewPageIds] = useState<string[]>([]);
  const [version, setVersion] = useState(startVersion);
  const [selected, setSelected] = useState<Selection>(
    initialPages.length ? { kind: 'page', id: initialPages[0]!.id } :
    { kind: 'global', id: 'global' },
  );
  const [field, setField] = useState<FileField>('html');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<'page' | 'component' | 'rename' | 'remove' | null>(null);
  const [filename, setFilename] = useState('');
  const [message, setMessage] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewPath, setPreviewPath] = useState('/');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pending, start] = useTransition();

  const currentPage = selected.kind === 'page' ? pages.find(p => p.id === selected.id) : undefined;
  const currentCodeId = selected.kind === 'component' ? selected.id : currentPage?.codeId;
  const currentCode = sources.code.find(c => c.id === currentCodeId);
  const isSource = selected.kind === 'global' || !!currentCode;
  const editable = !blocked && !pending &&
    (selected.kind === 'global' ? canEditCss : canEdit);
  const dirty = JSON.stringify(sources) !== JSON.stringify(savedSources) || newPageIds.length > 0;
  const shownPages = useMemo(() => pages.filter(page =>
    (page.title + ' ' + page.path).toLowerCase().includes(search.toLowerCase())), [pages, search]);
  const shownComponents = useMemo(() => sources.code.filter(c =>
    !c.name.startsWith('pages/') && (displayName(c) + ' ' + c.name)
      .toLowerCase().includes(search.toLowerCase())), [sources.code, search]);
  const draft = (): TemplateDraft => ({ ...sources, newPageCodeIds: newPageIds });

  const openPage = (page: TemplatePage) => {
    setSelected({ kind: 'page', id: page.id }); setField('html'); setMessage('');
  };
  const openComponent = (code: Code) => {
    setSelected({ kind: 'component', id: code.id }); setField('html'); setMessage('');
  };
  const setValue = (value: string) => {
    if (!editable) return;
    if (value.length > 50000) {
      setMessage('Each source file can contain up to 50,000 characters.');
      return;
    }
    if (selected.kind === 'global') setSources(prev => ({ ...prev, css: value }));
    else if (currentCode) setSources(prev => ({
      ...prev, code: prev.code.map(c => c.id === currentCode.id
        ? { ...c, [field]: value } : c),
    }));
  };
  const codeValue = selected.kind === 'global' ? sources.css : currentCode?.[field] ?? '';
  const codePath = selected.kind === 'global' ? 'styles/global.css'
    : !currentCode ? '' : currentCode.name.startsWith('pages/')
      ? currentCode.name.replace(/\.html$/, field === 'html' ? '.html'
        : field === 'css' ? '.css' : '.js')
      : 'components/' + displayName(currentCode) + '/' +
        (field === 'html' ? 'index.html' : field === 'css' ? 'style.css' : 'script.js');

  const addFile = () => {
    if (blocked || !canEdit) return;
    const slug = fileSlug(filename);
    if (!slug || slug.length > 48) { setMessage('Enter a valid filename.'); return; }
    if (sources.code.length >= 30) { setMessage('Maximum 30 custom components per website.'); return; }
    if (form === 'page' && !canCreatePage) {
      setMessage('Page creation permissions required.'); return;
    }
    const isPage = form === 'page';
    const path = isPage ? 'pages/' + slug + '.html' : 'components/' + slug;
    if (sources.code.some(c => c.name === path)) { setMessage('A file with this name already exists.'); return; }
    if (isPage && pages.some(p => p.path === (slug === 'index' ? '/' : '/' + slug))) {
      setMessage('That page already exists. Select it in Pages to edit.'); return;
    }
    const codeId = makeId();
    const created: Code = {
      id: codeId, name: path,
      html: isPage ? '<main>\n  <h1>' + titleName(slug) + '</h1>\n</main>' :
        '<section>\n  <h2>' + titleName(slug) + '</h2>\n</section>',
      css: '', javascript: '',
    };
    setSources(prev => ({ ...prev, code: [...prev.code, created] }));
    if (isPage) {
      const page: TemplatePage = {
        id: 'p' + codeId.slice(1, 17), title: titleName(slug),
        path: slug === 'index' ? '/' : '/' + slug, visibility: 'public', codeId,
      };
      setPages(prev => [...prev, page]);
      setNewPageIds(prev => [...prev, codeId]);
      openPage(page);
    } else openComponent(created);
    setForm(null); setFilename('');
    setMessage('Added to draft. Save to keep your new file.');
  };
  const rename = () => {
    if (!currentCode || selected.kind !== 'component') return;
    const slug = fileSlug(filename);
    if (!slug) { setMessage('Enter a valid name.'); return; }
    const next = 'components/' + slug;
    if (sources.code.some(c => c.id !== currentCode.id && c.name === next)) {
      setMessage('That component name already exists.'); return;
    }
    setSources(prev => ({
      ...prev, code: prev.code.map(c => c.id === currentCode.id ? { ...c, name: next } : c),
    }));
    setForm(null); setFilename(''); setMessage('Name changed in draft.');
  };
  const remove = () => {
    if (!currentCode || selected.kind !== 'component') return;
    setSources(prev => ({ ...prev, code: prev.code.filter(c => c.id !== currentCode.id) }));
    setSelected(pages.length ? { kind: 'page', id: pages[0]!.id } : { kind: 'global', id: 'global' });
    setForm(null); setMessage('Component removed from draft. Used components cannot be deleted when saving.');
  };
  const save = () => {
    if (!canEdit || blocked || pending || !dirty) return;
    const snapshot = draft();
    start(async () => {
      const result = await saveTemplateFiles(id, version, snapshot);
      setMessage(result.message);
      if (result.partial) { setBlocked(true); return; }
      if (result.saved) {
        if (result.version !== undefined) setVersion(result.version);
        setSavedSources({ css: snapshot.css, code: snapshot.code });
        setNewPageIds([]);
      }
    });
  };
  const validate = () => start(async () => {
    const result = await validateTemplateFiles(id, draft());
    setMessage(result.message);
  });
  const preview = () => {
    const path = currentPage?.path ?? pages.find(p => p.path === '/')?.path ?? pages[0]?.path ?? '/';
    start(async () => {
      try {
        const html = await previewTemplateFiles(id, draft(), path);
        if (!html) throw new Error('Nothing to preview');
        setPreviewHtml(html); setPreviewPath(path); setPreviewOpen(true);
        setMessage('Draft preview generated. Live website unchanged.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Preview unavailable');
      }
    });
  };
  const publish = () => {
    if (dirty) { setMessage('Save files before publishing.'); return; }
    start(async () => {
      const result = await publishWebsite(id, version, 'Published from Template Editor');
      setMessage(result.message);
      if (result.id) setVersion(v => v + 1);
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        document.getElementById('template-save-button')?.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return <main id="main-content" className="template-editor">
    <header className="te-header">
      <div className="te-title">
        <span className="te-logo" aria-hidden="true">◈</span>
        <div><span className="te-eyebrow">WEBSITE STUDIO</span>
          <h1>Template Editor</h1><p>{name} · Pages, components and website files in one place</p>
        </div>
      </div>
      <div className="te-actions">
        <span className={dirty ? 'te-state dirty' : 'te-state'}>{dirty ? '● Unsaved changes' : '✓ Draft saved'}</span>
        <button type="button" className="te-outline" onClick={preview} disabled={pending}>Preview</button>
        <button type="button" className="te-outline" onClick={validate} disabled={pending}>Check code</button>
        <button id="template-save-button" type="button" className="te-primary"
          onClick={save} disabled={!canEdit || blocked || pending || !dirty}>{pending ? 'Working…' : 'Save draft'}</button>
        {canPublish && <button type="button" className="te-publish" onClick={publish}
          disabled={pending || blocked || dirty}>Publish</button>}
      </div>
    </header>
    <nav className="te-nav" aria-label="Website tools">
      <span className="te-current">▣ &nbsp; Template Editor</span>
      <Link href={`/dashboard/website/${id}/design`}>Design & colors</Link>
      <Link href={`/dashboard/website/${id}/media`}>Images & assets</Link>
      <Link href={`/dashboard/website/${id}/seo`}>SEO</Link>
      <Link href={`/dashboard/website/${id}/versions`}>Versions</Link>
    </nav>
    {message && <div className="te-message" role="status">{message}
      {blocked && <button type="button" onClick={() => window.location.reload()}>Reload editor</button>}
    </div>}
    <div className="te-workspace">
      <aside className="te-sidebar" aria-label="Template pages and components">
        <div className="te-side-title"><strong>Website files</strong><span>{pages.length} pages</span></div>
        <input className="te-search" type="search" value={search}
          onChange={e => setSearch(e.target.value)} placeholder="Find pages or components…" aria-label="Find website file"/>
        <div className="te-side-scroll">
          <div className="te-folder-title">
            <strong>▤ &nbsp; Pages</strong>
            <button title="Add page" aria-label="Add page" type="button" disabled={!canCreatePage || blocked}
              onClick={() => { setForm('page'); setFilename(''); }}>+</button>
          </div>
          {shownPages.map(page => <button key={page.id} type="button"
            className={selected.kind === 'page' && selected.id === page.id ? 'te-item selected' : 'te-item'}
            onClick={() => openPage(page)}>
            <span aria-hidden="true">{page.path === '/' ? '⌂' : '▤'}</span>
            <span className="te-item-label">{page.title}<small>{page.path}</small></span>
            <span className="te-tag">{page.codeId ? 'Code' : 'Visual'}</span>
          </button>)}
          {!shownPages.length && <p className="te-empty">No matching pages</p>}
          <div className="te-folder-title">
            <strong>▣ &nbsp; Components</strong>
            <button type="button" title="Add component" aria-label="Add component"
              disabled={!canEdit || blocked} onClick={() => {setForm('component');setFilename('');}}>+</button>
          </div>
          {shownComponents.map(component => <button type="button" key={component.id}
            className={selected.kind === 'component' && selected.id === component.id ? 'te-item selected' : 'te-item'}
            onClick={() => openComponent(component)}>
            <span aria-hidden="true">◇</span><span className="te-item-label">{titleName(displayName(component))}<small>HTML · CSS · JS</small></span>
          </button>)}
          {!shownComponents.length && <p className="te-empty">No matching components</p>}
          <div className="te-folder-title"><strong>◈ &nbsp; Styles</strong></div>
          <button type="button" className={selected.kind === 'global' ? 'te-item selected' : 'te-item'}
            onClick={() => {setSelected({kind:'global',id:'global'});setMessage('');}}>
            <span aria-hidden="true">CSS</span><span className="te-item-label">Global styles<small>styles/global.css</small></span>
          </button>
        </div>
        <div className="te-side-bottom"><strong>Quick start</strong>
          <p>Choose a page or component. Edit HTML, CSS and JavaScript together, then save your draft.</p>
        </div>
      </aside>
      <section className="te-main">
        <div className="te-file-heading">
          <div><span className="te-eyebrow">CURRENT FILE</span>
            <h2>{selected.kind === 'global' ? 'Global styles' : currentPage?.title ??
              (currentCode ? titleName(displayName(currentCode)) : 'Template')}</h2>
            <p>{selected.kind === 'global' ? 'Styles applied across your website' :
              currentPage?.path ?? 'Reusable website component'}</p>
          </div>
          <div className="te-file-actions">
            {selected.kind === 'component' && currentCode && canEdit && <>
              <button type="button" disabled={blocked || pending} onClick={() => {setForm('rename');setFilename(displayName(currentCode));}}>Rename</button>
              <button type="button" disabled={blocked || pending} onClick={() => setForm('remove')}>Delete</button>
            </>}
            {currentPage && <button type="button" onClick={preview} disabled={pending}>↗ Preview page</button>}
          </div>
        </div>
        {currentPage && !currentPage.codeId ? <div className="te-visual">
          <div className="te-visual-icon" aria-hidden="true">▣</div>
          <h3>{currentPage.title} uses a visual website template</h3>
          <p>Its text, images and layout are stored as editable sections, not an HTML file. Edit those sections without affecting the rest of your website.</p>
          <Link className="te-primary" href={`/dashboard/website/${id}/layout?page=${encodeURIComponent(currentPage.id)}`}>
            Edit page sections
          </Link>
          <p className="te-subnote">Code pages and reusable components can be edited here using their HTML, CSS and JavaScript tabs.</p>
        </div> : <div className="te-code-editor">
          <div className="te-code-tabs" role="tablist" aria-label="File language">
            {(selected.kind === 'global' ? ['css'] as FileField[] : ['html','css','javascript'] as FileField[]).map(tab =>
              <button key={tab} type="button" role="tab" aria-selected={selected.kind === 'global' || field === tab}
                className={selected.kind === 'global' || field === tab ? 'active' : ''}
                onClick={() => setField(tab)}>
                {tab === 'javascript' ? 'JavaScript' : tab.toUpperCase()}
              </button>)}
          </div>
          <div className="te-code-path"><span>{codePath}</span><span>{selected.kind === 'global' ? 'CSS' : field.toUpperCase()}</span></div>
          <textarea spellCheck={false} value={codeValue} disabled={!editable}
            aria-label={`Edit ${codePath}`} onChange={event => setValue(event.target.value)}
            onKeyDown={event => {
              if (event.key !== 'Tab' || event.shiftKey) return;
              event.preventDefault();
              const node = event.currentTarget;
              const start = node.selectionStart;
              const end = node.selectionEnd;
              setValue(codeValue.slice(0, start) + '  ' + codeValue.slice(end));
              requestAnimationFrame(() => node.setSelectionRange(start + 2, start + 2));
            }}
            className="te-code-textarea" placeholder="Start writing your website code…"/>
          <div className="te-code-bottom"><span>{codeValue.split('\n').length} lines</span><span>Ctrl+S to save · UTF-8</span></div>
        </div>}
        {isSource && <div className="te-editor-tip"><strong>One component, all its files.</strong>
          {selected.kind === 'global' ? ' Global CSS affects every page. Save before publishing.'
            : ' Switch between HTML, CSS and JavaScript above. Your files remain together with this component.'}
        </div>}
      </section>
    </div>
    {previewOpen && <div className="te-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setPreviewOpen(false);
    }}>
      <div className="te-dialog te-preview-dialog" role="dialog" aria-modal="true" aria-label="Template preview">
        <header><div><strong>Website draft preview</strong><small>{previewPath}</small></div>
          <button type="button" onClick={() => setPreviewOpen(false)}>Close ×</button></header>
        <iframe title="Sandboxed website preview" srcDoc={previewHtml} sandbox="allow-scripts" referrerPolicy="no-referrer"/>
      </div>
    </div>}
    {form && <div className="te-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setForm(null);
    }}>
      <div className="te-dialog" role="dialog" aria-modal="true" aria-label="Template file action">
        <h2>{form === 'page' ? 'Create a website page' : form === 'component' ?
          'New reusable component' : form === 'rename' ? 'Rename component' : 'Delete component?'}</h2>
        {form === 'remove' ? <p>Delete this unused component from the draft? Components used by a website page cannot be removed.</p> : <>
          <p>{form === 'page' ? 'Choose a name, such as services. A new page with editable HTML, CSS and JavaScript will be created.' :
            'Keep component names short and clear so they are easy to find.'}</p>
          <label>File name<input autoFocus value={filename} onChange={e => setFilename(e.target.value)}
            placeholder={form === 'page' ? 'services' : 'hero-banner'}
            onKeyDown={e => {if(e.key === 'Enter'){e.preventDefault(); if(form === 'rename') rename(); else addFile();}}}/></label>
        </>}
        <footer><button type="button" onClick={() => setForm(null)}>Cancel</button>
          <button type="button" className="te-primary" onClick={() => {
            if(form === 'remove') remove();
            else if(form === 'rename') rename();
            else addFile();
          }}>{form === 'remove' ? 'Delete component' : form === 'rename' ? 'Rename' : 'Create file'}</button>
        </footer>
      </div>
    </div>}
  </main>;
}
