'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { WebsiteDocument, WebsiteNode } from '@business-os/website-builder';
import { WebsiteMediaPicker } from './website-media-picker';
import { editableContentFields } from './website-content-fields';
import { useWebsitePreviewSrcDoc } from './website-preview-nonce';
import { renderDraftPreview, publishWebsite, publishWebsiteWithLinkedPages } from './actions';
import { saveFixedTemplateSection } from './fixed-template-actions';
import { fixedTemplateSections } from './fixed-template-guard';
import { linkedDraftPagesForPublication } from './website-publication-links';
import './fixed-template-editor.css';

type Area = 'header' | 'footer' | 'pages';
type Picked = { kind: 'node' | 'content'; id: string };
type Asset = WebsiteDocument['assets'][number];
const editable = fixedTemplateSections;

function findNode(nodes: WebsiteNode[], id: string): WebsiteNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child) return child;
  }
  return undefined;
}
function findLocation(document: WebsiteDocument, id: string): { area: Area; pageId?: string } | null {
  if (findNode(document.header, id)) return { area: 'header' };
  if (findNode(document.footer, id)) return { area: 'footer' };
  for (const page of document.pages) {
    if (findNode(page.nodes, id)) return { area: 'pages', pageId: page.id };
  }
  return null;
}
function editableTargets(document: WebsiteDocument, pageId: string) {
  const targets: { id: string; label: string; kind: Picked['kind'] }[] = [];
  const walk = (nodes: WebsiteNode[], group: string) => {
    nodes.forEach(node => {
      if (editableContentFields(node).length || node.type === 'image' ||
          node.type === 'logo' || node.props.asset !== undefined)
        targets.push({ id: node.id, kind: 'node',
          label: group + ' · ' + (node.props.title || node.props.text || node.type).slice(0, 50) });
      walk(node.children, group);
    });
  };
  walk(document.header, 'Header');
  const page = document.pages.find(p => p.id === pageId);
  if (page) walk(page.nodes, page.title);
  walk(document.footer, 'Footer');
  for (const item of document.content)
    targets.push({ id: item.id, kind: 'content', label: 'Card · ' + item.title.slice(0, 50) });
  return targets.slice(0, 100);
}

function fromLocation(document: WebsiteDocument, target: Picked | null) {
  if (!target || target.kind !== 'node') return undefined;
  const location = findLocation(document, target.id);
  if (!location) return undefined;
  const nodes = location.area === 'pages'
    ? document.pages.find(page => page.id === location.pageId)?.nodes ?? []
    : document[location.area];
  return findNode(nodes, target.id);
}

export function FixedTemplateEditor({
  id, name, initial, version: initialVersion, canEdit, canPublish, canUpload,
  canUseGithub, initialPageId,
}: {
  id: string;
  name: string;
  initial: WebsiteDocument;
  version: number;
  canEdit: boolean;
  canPublish: boolean;
  canUpload: boolean;
  canUseGithub: boolean;
  initialPageId?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const currentDocument = useRef(initial);
  const [document, setDocument] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [version, setVersion] = useState(initialVersion);
  const [pageId, setPageId] = useState(initial.pages.find(page => page.id === initialPageId)?.id ??
    initial.pages.find(page => page.path === '/')?.id ?? initial.pages[0]?.id ?? '');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [status, setStatus] = useState('');
  const [pending, start] = useTransition();
  const page = document.pages.find(p => p.id === pageId) ?? document.pages[0];
  const node = fromLocation(document, picked);
  const item = picked?.kind === 'content' ? document.content.find(c => c.id === picked.id) : undefined;
  const fields = node ? editableContentFields(node) : [];
  const dirty = editable.filter(section => JSON.stringify(document[section]) !== JSON.stringify(saved[section]));
  const srcDoc = useWebsitePreviewSrcDoc(preview);
  const linkedDrafts = linkedDraftPagesForPublication(document);
  const targets = editableTargets(document, pageId);

  useEffect(() => { currentDocument.current = document; }, [document]);
  useEffect(() => {
    if (!page) return;
    let active = true;
    const controller = setTimeout(() => {
      void renderDraftPreview(id, document, page.path)
        .then(html => { if (active) { setPreview(html ?? ''); setPreviewError(''); } })
        .catch(() => { if (active) setPreviewError('Preview unavailable. You can still edit fields below.'); });
    }, 350);
    return () => { active = false; clearTimeout(controller); };
  }, [id, document, page?.path]);

  const updateNode = (id: string, field: string, value: string) => {
    if (!canEdit) return;
    setDocument(old => {
      const next = structuredClone(old);
      const location = findLocation(next, id);
      if (!location) return old;
      const target = fromLocation(next, { kind: 'node', id });
      if (!target) return old;
      const allowed = editableContentFields(target).some(f => f.key === field && value.length <= f.maxLength);
      if (!allowed) return old;
      if (field === 'title' || field === 'text' || field === 'subtitle' ||
          field === 'href' || field === 'label' || field === 'alt') target.props[field] = value;
      return next;
    });
    setPicked({ kind: 'node', id });
  };
  const updateContent = (id: string, field: 'title' | 'text', value: string) => {
    if (!canEdit || value.length > (field === 'title' ? 300 : 12000)) return;
    setDocument(old => ({ ...old, content: old.content.map(item =>
      item.id === id ? { ...item, [field]: value } : item) }));
    setPicked({ kind: 'content', id });
  };
  const chooseNode = (id: string) => {
    const location = findLocation(currentDocument.current, id);
    if (!location) return;
    if (location.pageId) setPageId(location.pageId);
    setPicked({ kind: 'node', id });
  };
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const valid = (value: unknown): value is string =>
        typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value);
      if ((data.type === 'website.select' || data.type === 'website.replace-image') && valid(data.id)) {
        chooseNode(data.id);
      }
      if ((data.type === 'website.select-content' || data.type === 'website.replace-content-image') &&
        valid(data.contentId) && currentDocument.current.content.some(item => item.id === data.contentId)) {
        setPicked({ kind: 'content', id: data.contentId });
      }
      if (data.type === 'website.inline-text' && valid(data.id) && typeof data.value === 'string' &&
          ['title','subtitle','text'].includes(data.field)) updateNode(data.id, data.field, data.value);
      if (data.type === 'website.inline-content-text' && valid(data.contentId) &&
          ['title','text'].includes(data.field) && typeof data.value === 'string')
        updateContent(data.contentId, data.field, data.value);
      if (data.type === 'website.navigate' && typeof data.path === 'string') {
        const path = data.path.split(/[?#]/)[0];
        const next = currentDocument.current.pages.find(page => page.path === path);
        if (next) { setPageId(next.id); setPicked(null); }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [canEdit]);

  const setNodeImage = (nodeId: string, assetId?: string, asset?: Asset) => {
    if (!canEdit) return;
    setDocument(old => {
      const next = structuredClone(old);
      const target = fromLocation(next, { kind: 'node', id: nodeId });
      if (!target || !(target.type === 'image' || target.type === 'hero' ||
        target.type === 'logo' || target.props.asset !== undefined)) return old;
      if (asset && !next.assets.some(existing => existing.id === asset.id)) next.assets.push(asset);
      if (assetId) target.props.asset = assetId;
      else delete target.props.asset;
      return next;
    });
  };
  const setContentImage = (contentId: string, assetId?: string, asset?: Asset) => {
    if (!canEdit) return;
    setDocument(old => {
      const next = structuredClone(old);
      const target = next.content.find(item => item.id === contentId);
      if (!target) return old;
      if (asset && !next.assets.some(existing => existing.id === asset.id)) next.assets.push(asset);
      if (assetId) target.image = assetId;
      else delete target.image;
      return next;
    });
  };

  const save = () => {
    if (!canEdit || pending || !dirty.length) return;
    const snapshot = document;
    start(async () => {
      let currentVersion = version;
      for (const section of editable) {
        if (JSON.stringify(snapshot[section]) === JSON.stringify(saved[section])) continue;
        const result = await saveFixedTemplateSection(id, currentVersion, section, snapshot[section]);
        if (result.version === undefined) {
          setVersion(currentVersion);
          setStatus('Save incomplete: ' + result.message + ' Reload the latest draft before editing again.');
          return;
        }
        currentVersion = result.version;
      }
      setVersion(currentVersion);
      setSaved(snapshot);
      setStatus('Content saved as draft. Template layout is unchanged.');
    });
  };
  const publish = () => {
    if (!canPublish || pending || dirty.length) return;
    start(async () => {
      if (linkedDrafts.length && !window.confirm('Publish linked draft pages along with this website?')) return;
      const result = linkedDrafts.length
        ? await publishWebsiteWithLinkedPages(id, version, 'Published fixed-template content')
        : await publishWebsite(id, version, 'Published fixed-template content');
      setStatus(result.message);
      if (result.id) setVersion('version' in result && typeof result.version === 'number' ? result.version : version + 1);
    });
  };
  useEffect(() => {
    if (!dirty.length) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty.length]);

  return (
    <main id="main-content" className="ft-editor">
      <header className="ft-heading">
        <div>
          <p className="ft-eyebrow">WEBSITE / TEMPLATE CONTENT</p>
          <h1>Edit your website content</h1>
          <p>Click any editable heading, paragraph, photo or logo. Your template layout, spacing and design stay fixed.</p>
        </div>
        <div className="ft-actions">
          <Link href="/dashboard/website" className="ft-outline">← Templates</Link>
          {canUseGithub && <Link href={`/dashboard/website/${id}/git`} className="ft-outline">GitHub / VS Code</Link>}
          <button type="button" disabled={!canEdit || pending || !dirty.length} onClick={save}>
            {pending ? 'Saving…' : 'Save draft'}
          </button>
          {canPublish && <button type="button" className="ft-publish" disabled={pending || !!dirty.length}
            onClick={publish}>Publish website</button>}
        </div>
      </header>
      {status && <p className="ft-notice" role="status">{status}</p>}
      <div className="ft-layout">
        <section className="ft-stage" aria-label="Fixed website template preview">
          <div className="ft-toolbar">
            <label htmlFor="ft-page-choice">Page</label>
            <select id="ft-page-choice" value={pageId} onChange={event => { setPageId(event.target.value); setPicked(null); }}>
              {document.pages.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <span className="ft-locked">Locked template layout</span>
          </div>
          <div className="ft-browser">
            <div className="ft-browser-bar"><span>● ● ●</span><strong>{name} / {page?.path ?? '/'}</strong></div>
            <iframe ref={frame} title="Click-to-edit website preview" sandbox="allow-scripts"
              referrerPolicy="no-referrer" srcDoc={srcDoc ||
                '<!doctype html><html><body style="font:16px sans-serif;padding:30px">Loading your website preview…</body></html>'} />
          </div>
          {previewError && <p className="ft-notice" role="status">{previewError}</p>}
          <p className="ft-help">Click an item in the preview to edit it. You cannot move, resize, add or delete sections.</p>
        </section>
        <aside className="ft-inspector" aria-label="Selected website content">
          <div className="ft-inspector-heading">
            <strong>{node ? 'Edit selected item' : item ? 'Edit selected card' : 'Choose content to edit'}</strong>
            <small>Changes affect text and images only.</small>
          </div>
          {node ? <div className="ft-fields">
            <span className="ft-item-type">{node.type.replaceAll('_', ' ')} · Fixed position</span>
            {fields.map(field => <label key={field.key} className="ft-field">
              <span>{field.label}</span>
              {field.multiline
                ? <textarea rows={4} maxLength={field.maxLength} disabled={!canEdit || pending}
                    value={String(node.props[field.key] ?? '')}
                    onChange={event => updateNode(node.id, field.key, event.target.value)} />
                : <input type="text" maxLength={field.maxLength} disabled={!canEdit || pending}
                    value={String(node.props[field.key] ?? '')}
                    onChange={event => updateNode(node.id, field.key, event.target.value)} />}
            </label>)}
            {(node.type === 'image' || node.type === 'hero' || node.type === 'logo' ||
              node.props.asset !== undefined) && <WebsiteMediaPicker
                id={id} assets={document.assets} value={node.props.asset}
                label={node.type === 'logo' ? 'Logo' : 'Image'} canPreview={canUpload}
                disabled={!canEdit || pending} unsaved={!!dirty.length}
                onChange={assetId => setNodeImage(node.id, assetId)}
                onUploaded={asset => setNodeImage(node.id, asset.id, asset)} />}
            {!fields.length && !(node.type === 'image' || node.type === 'hero' || node.type === 'logo' ||
              node.props.asset !== undefined) &&
              <p className="ft-help">This is part of the locked design. Select a text or image instead.</p>}
          </div> : item ? <div className="ft-fields">
            <label className="ft-field"><span>Title</span><input maxLength={300} value={item.title}
              disabled={!canEdit || pending} onChange={event => updateContent(item.id, 'title', event.target.value)}/></label>
            <label className="ft-field"><span>Description</span><textarea rows={5} maxLength={12000}
              value={item.text} disabled={!canEdit || pending}
              onChange={event => updateContent(item.id, 'text', event.target.value)}/></label>
            <WebsiteMediaPicker id={id} assets={document.assets} value={item.image}
              label="Card image" canPreview={canUpload} disabled={!canEdit || pending}
              unsaved={!!dirty.length} onChange={assetId => setContentImage(item.id, assetId)}
              onUploaded={asset => setContentImage(item.id, asset.id, asset)}/>
          </div> : <div className="ft-instructions">
            <span aria-hidden="true">✎</span>
            <h2>Click text or an image</h2>
            <p>Choose a heading to rewrite it, a picture to replace it, or a card to update its title and photo.</p>
            <p>Header, footer, sections, colors and layouts stay exactly as designed.</p>
            <div className="ft-quick-list">
              <h3>Or select an item here</h3>
              {targets.map(target => (
                <button type="button" key={target.kind + target.id}
                  onClick={() => target.kind === 'node' ? chooseNode(target.id)
                    : setPicked({ kind: 'content', id: target.id })}>
                  {target.label}
                </button>
              ))}
            </div>
          </div>}
          <div className="ft-inspector-footer">
            <strong>{dirty.length ? '● Unsaved content changes' : '✓ Draft up to date'}</strong>
            <p>Save your draft first, then publish when you are ready.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
