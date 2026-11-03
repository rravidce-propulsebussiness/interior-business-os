'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { WebsiteDocument, WebsiteNode } from '@business-os/website-builder';
import { WebsiteMediaPicker } from './website-media-picker';
import { editableContentFields } from './website-content-fields';
import { useWebsitePreviewSrcDoc } from './website-preview-nonce';
import { renderDraftPreview, saveWebsiteSection, publishWebsite, publishWebsiteWithLinkedPages } from './actions';
import { linkedDraftPagesForPublication } from './website-publication-links';
import './fixed-template-editor.css';

type Area = 'header' | 'footer' | 'pages';
type Picked = { kind: 'node' | 'content'; id: string };
type Asset = WebsiteDocument['assets'][number];
const editable = ['assets', 'content', 'pages', 'header', 'footer'] as const;
type EditableSection = (typeof editable)[number];

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
        const result = await saveWebsiteSection(id, currentVersion, section, snapshot[section]);
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
      if (result.id) setVersion(result.version ?? version + 1);
    });
  };
  useEffect(() => {
    if (!dirty.length) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty.length]);
