'use client';
import { useWebsitePreviewSrcDoc } from './website-preview-nonce';
import { useEffect, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { WebsiteMediaPicker } from './website-media-picker';
import { convertPageToCodeDraft } from './convert-code-action';
import { editableContentFields } from './website-content-fields';
import {
  componentTypes,
  createNode,
  type WebsiteDocument,
  type WebsiteNode,
  type NodeStyle,
} from '@business-os/website-builder';
import {
  locateNode,
  removeNode,
  duplicateNode,
  moveNode,
  insertNode,
  editHistory,
  undoHistory,
  redoHistory,
  type History,
} from '@business-os/website-builder/editor';
import {
  saveWebsiteSection,
  publishWebsite,
  renderDraftPreview,
} from './actions';
const uid = () => `n${crypto.randomUUID().replaceAll('-', '')}`;
const controls = 'w-full rounded-md border bg-background px-2 py-2 text-sm';
export function WebsiteEditor({
  id,
  initial,
  version: initialVersion,
  name,
  status,
  canEdit,
  canPublish,
  canViewSource = false,
  canPreviewMedia = false,
  saveAction = saveWebsiteSection,
  previewAction = renderDraftPreview,
  publishAction = publishWebsite,
  templateMode = false,
  initialPageId,
}: {
  id: string;
  initial: WebsiteDocument;
  version: number;
  name: string;
  status: string;
  canEdit: boolean;
  canPublish: boolean;
  canViewSource?: boolean;
  canPreviewMedia?: boolean;
  saveAction?: typeof saveWebsiteSection;
  previewAction?: typeof renderDraftPreview;
  publishAction?: typeof publishWebsite;
  templateMode?: boolean;
  initialPageId?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const latestDocRef = useRef(initial);
  const previewScroll = useRef({ x: 0, y: 0 });
  const restoringPreviewScroll = useRef(false);
  const lastPreviewHtml = useRef('');
  // Cache recent draft previews so undo / redo and revisiting a page do not
  // immediately repeat expensive authenticated server rendering.
  const previewCache = useRef(new Map<string, string>());
  const firstPreview = useRef(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const openingPage = initial.pages.find(p => p.id === initialPageId) ??
    initial.pages.find(p => p.path === '/' && p.nodes.length) ??
    initial.pages.find(p => p.nodes.length) ??
    initial.pages.find(p => p.path === '/') ??
    initial.pages[0]!;
  // A full-width canvas is the default. Side panels open only on request.
  const [selection, setSelection] = useState<string | null>(null);
  const [showSections, setShowSections] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      const selectTarget = (nodeId: string) => {
        const doc = latestDocRef.current;
        if (locateNode(doc.header, nodeId)) setArea('header');
        else if (locateNode(doc.footer, nodeId)) setArea('footer');
        else {
          const found = doc.pages.find(page => locateNode(page.nodes, nodeId));
          if (!found) return false;
          setPageId(found.id);
          setArea('pages');
        }
        setSelection(nodeId);
        return true;
      };
      if (data?.type === 'website.replace-image' &&
        typeof data.id === 'string' &&
        /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(data.id)) {
        if (!canEdit) return;
        if (selectTarget(data.id)) {
          setShowSections(false);
          setShowInspector(true);
        }
        return;
      }
      if (data?.type === 'website.inline-text') {
        if (!canEdit || typeof data.id !== 'string' ||
            !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(data.id) ||
            !['title','subtitle','text'].includes(data.field) ||
            typeof data.value !== 'string' ||
            data.value.length > (data.field === 'title' ? 300 :
              data.field === 'subtitle' ? 1000 : 12000)) return;
        setHistory(current => {
          const next = structuredClone(current.present);
          const walk = (items: WebsiteNode[]): WebsiteNode | undefined => {
            for (const node of items) {
              if (node.id === data.id) return node;
              const child = walk(node.children);
              if (child) return child;
            }
            return undefined;
          };
          let node = walk(next.header) ?? walk(next.footer);
          if (!node) for (const page of next.pages) {
            node = walk(page.nodes);
            if (node) break;
          }
          if (!node) return current;
          const allowed = editableContentFields(node).some(field => field.key === data.field) ||
            ((node.type === 'heading' || node.type === 'button') && data.field === 'text');
          if (!allowed || node.props[data.field as 'title'|'subtitle'|'text'] === data.value)
            return current;
          node.props[data.field as 'title'|'subtitle'|'text'] = data.value;
          return editHistory(current, next);
        });
        selectTarget(data.id);
        return;
      }
      if (data?.type === 'website.select' && typeof data.id === 'string' &&
          /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(data.id)) {
        if (!selectTarget(data.id)) return;
        if (data.inline === true) return; // Text remains editable in place.
        setShowSections(false);
        setShowInspector(true);
      }
      if (data?.type === 'website.preview-restored')
        restoringPreviewScroll.current = false;
      if (data?.type === 'website.preview-scroll' && !restoringPreviewScroll.current) {
        const x = Number(data.x), y = Number(data.y);
        if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0)
          previewScroll.current = { x, y };
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [canEdit]);
  const [history, setHistory] = useState<History<WebsiteDocument>>({
      past: [],
      present: initial,
      future: [],
    }),
    [version, setVersion] = useState(initialVersion),
    [pageId, setPageId] = useState(openingPage.id),
    [area, setArea] = useState<'pages' | 'header' | 'footer'>('pages'),
    [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop'),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState(''),
    [pending, start] = useTransition(),
    [palette, setPalette] = useState(''),
    [sideTab, setSideTab] = useState<'layers' | 'components' | 'files'>('layers'),
    [fullPreview, setFullPreview] = useState(false),
    [savedDocument, setSavedDocument] = useState(initial);
  useEffect(() => { latestDocRef.current = history.present; }, [history.present]);
  useEffect(() => {
    if (!focused) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocused(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [focused]);
  const previewSrcDoc = useWebsitePreviewSrcDoc(preview);
  const document = history.present,
    page = document.pages.find((p) => p.id === pageId) ?? document.pages[0]!,
    activeNodes = area === 'pages' ? page.nodes : document[area],
    selected = selection ? locateNode(activeNodes, selection) : undefined;
  const contentFields = selected ? editableContentFields(selected) : [];
  const unsavedSections = (['assets', 'pages', 'header', 'footer'] as const).filter(
    (key) => JSON.stringify(document[key]) !== JSON.stringify(savedDocument[key]),
  );
  const hasUnsavedChanges = unsavedSections.length > 0;
  const edit = (next: WebsiteDocument) =>
    setHistory((h) => editHistory(h, next));
  const nodes = (next: WebsiteNode[]) =>
    edit(
      area !== 'pages'
        ? { ...document, [area]: next }
        : {
            ...document,
            pages: document.pages.map((p) =>
              p.id === page.id ? { ...p, nodes: next } : p,
            ),
          },
    );
  const update = (change: (node: WebsiteNode) => void) => {
    if (!selection) return;
    const next = structuredClone(activeNodes);
    const node = locateNode(next, selection);
    if (node) {
      const previous = { ...node.props };
      change(node);
      nodes(next);
      // The iframe applies text-only edits immediately, safely through
      // textContent. The debounced server preview remains authoritative.
      if (['title', 'text', 'subtitle'].some(key =>
        previous[key as 'title' | 'text' | 'subtitle'] !==
          node.props[key as 'title' | 'text' | 'subtitle'])) {
        frame.current?.contentWindow?.postMessage({
          type: 'website.preview-text',
          id: node.id,
          nodeType: node.type,
          title: node.props.title ?? '',
          text: node.props.text ?? '',
          subtitle: node.props.subtitle ?? '',
        }, '*');
      }
    }
  };
  useEffect(() => {
    previewScroll.current = { x: 0, y: 0 };
    restoringPreviewScroll.current = true;
  }, [page.path]);
  useEffect(() => {
    let active = true;
    const key = JSON.stringify([history.present, page.path]);
    const cached = previewCache.current.get(key);
    if (cached !== undefined) {
      if (lastPreviewHtml.current !== cached) {
        restoringPreviewScroll.current = true;
        lastPreviewHtml.current = cached;
        setPreview(cached);
      }
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    // First paint starts immediately; subsequent keystrokes are coalesced.
    const delay = firstPreview.current ? 0 : 500;
    firstPreview.current = false;
    const timer = setTimeout(() => {
      previewAction(id, history.present, page.path)
        .then((html) => {
          if (!active) return; // A newer draft may already be visible.
          const next = html ?? '';
          previewCache.current.set(key, next);
          // Keep cache small for large customer websites.
          if (previewCache.current.size > 5) {
            const oldest = previewCache.current.keys().next().value;
            if (oldest !== undefined) previewCache.current.delete(oldest);
          }
          if (lastPreviewHtml.current !== next) {
            restoringPreviewScroll.current = true;
            lastPreviewHtml.current = next;
            setPreview(next);
          }
          setPreviewLoading(false);
        })
        .catch((error) => {
          if (!active) return;
          setPreviewLoading(false);
          setMessage(error instanceof Error ? error.message : 'Preview unavailable');
        });
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [history.present, id, page.path, previewAction]);
  const move = (node: WebsiteNode, parent: string | null, index: number) => {
    try {
      nodes(moveNode(activeNodes, node.id, parent, index));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to move');
    }
  };
  function layers(list: WebsiteNode[], parent: string | null = null) {
    return (
      <ol className="ss-layers-list">
        {list.map((node, i) => (
          <li key={node.id} className="ss-layer-item">
            <div
              className={`ss-layer-row ${selection === node.id ? 'selected' : ''}`}
              draggable={canEdit}
              onDragStart={(e) => e.dataTransfer.setData('text/plain', node.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const moving = e.dataTransfer.getData('text/plain');
                if (moving && canEdit)
                  try {
                    nodes(moveNode(activeNodes, moving, parent, i));
                  } catch (err) {
                    setMessage(String(err));
                  }
              }}
            >
              <button
                className="ss-layer-name"
                onClick={() => setSelection(node.id)}
              >
                {node.type} {node.props.title || node.props.text?.slice(0, 20)}
              </button>
              {canEdit && (
                <>
                  <button
                    aria-label={`Move ${node.type} up`}
                    className="ss-layer-move"
                    disabled={i === 0}
                    onClick={() => move(node, parent, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${node.type} down`}
                    className="px-1 text-xs"
                    disabled={i === list.length - 1}
                    onClick={() => move(node, parent, i + 1)}
                  >
                    ↓
                  </button>
                </>
              )}
            </div>
            {node.children.length > 0 && layers(node.children, node.id)}
          </li>
        ))}
      </ol>
    );
  }
  const containers: WebsiteNode[] = [];
  function collect(list: WebsiteNode[]) {
    for (const n of list) {
      if (
        [
          'section',
          'container',
          'columns',
          'grid',
          'hero',
          'card',
          'footer',
          'cta',
          'contact',
        ].includes(n.type)
      )
        containers.push(n);
      collect(n.children);
    }
  }
  collect(activeNodes);
  const convertToCode = () => {
    if (!canViewSource || !canEdit || pending) return;
    if (hasUnsavedChanges) {setMessage('Save your visual edits before converting a code copy.');return;}
    if (!window.confirm('Create an editable HTML/CSS draft copy of this page? The original visual page stays unchanged. Dynamic forms and images cannot be converted automatically.')) return;
    start(async () => {
      const result = await convertPageToCodeDraft(id, version, page.id);
      setMessage(result.message);
      if (result.created && result.pageId)
        window.location.assign(`/dashboard/website/${id}/developer?page=${encodeURIComponent(result.pageId)}`);
    });
  };
  const saveDraft = () =>
    start(async () => {
      let nextVersion = version;
      for (const section of unsavedSections) {
        const result = await saveAction(id, nextVersion, section, document[section]);
        if (!result.version) {
          setMessage(result.message || 'Draft save failed. Reload before retrying.');
          if (nextVersion !== version) {
            setVersion(nextVersion);
            setMessage('Part of the draft saved. Reload to avoid conflicting changes.');
          }
          return;
        }
        nextVersion = result.version;
      }
      setVersion(nextVersion);
      setSavedDocument(document);
      setMessage(unsavedSections.length
        ? 'Draft saved. Published website remains unchanged.'
        : 'All changes are already saved.');
    });
  // Avoid losing locally edited website drafts on tab close, reload or navigation.
  useEffect(() => {
    if (!hasUnsavedChanges && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges, pending]);
  // The company sidebar sits outside Website Studio; protect its same-origin
  // Next.js links too. Links inside the studio have their own explicit prompt.
  useEffect(() => {
    if (!hasUnsavedChanges && !pending) return;
    const protectSidebar = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 ||
          event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!anchor || anchor.closest('.ss-studio-editor') ||
          anchor.hasAttribute('download') ||
          (anchor.getAttribute('target') && anchor.getAttribute('target') !== '_self'))
        return;
      try {
        const next = new URL(anchor.getAttribute('href') || '', window.location.href);
        const current = new URL(window.location.href);
        if (next.origin !== current.origin ||
            (next.pathname === current.pathname && next.search === current.search))
          return;
        if (!window.confirm('You have unsaved website changes. Leave without saving?')) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      } catch { /* Invalid links are handled by the browser. */ }
    };
    window.document.addEventListener('click', protectSidebar, true);
    return () => window.document.removeEventListener('click', protectSidebar, true);
  }, [hasUnsavedChanges, pending]);
  // Save without scrolling back to the top of a long page.
  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) &&
          !event.altKey && !event.shiftKey &&
          event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canEdit && hasUnsavedChanges && !pending && !event.repeat) saveDraft();
      }
    };
    window.addEventListener('keydown', saveShortcut);
    return () => window.removeEventListener('keydown', saveShortcut);
  });
  const confirmLeavingEditor = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if ((hasUnsavedChanges || pending) &&
        !window.confirm('You have unsaved website changes. Leave without saving?'))
      event.preventDefault();
  };
  return (
    <div className={`ss-studio-editor ss-simple-layout${focused ? ' ss-focused' : ''}`}>
      <header className="ss-heading">
        <div className="ss-heading-title">
          <span className="ss-heading-icon" aria-hidden="true">▣</span>
          <div>
            <span className="ss-eyebrow">WEBSITE BUILDER</span>
            <h1>Edit website</h1>
            <p>Click a section to update text, photos, buttons and layout. No coding needed.</p>
          </div>
        </div>
        <div className="ss-heading-actions">
          <span className={hasUnsavedChanges ? 'ss-save-state dirty' : 'ss-save-state'}>
            {hasUnsavedChanges ? '● Unsaved changes' : '✓ All changes saved'}
          </span>
          <button type="button" className="ss-btn ss-preview-action" onClick={() => setFullPreview(true)}
            disabled={!preview}>◉ &nbsp; Preview</button>
          {canEdit && <button type="button" className="ss-btn ss-save-action"
            disabled={pending || !hasUnsavedChanges} onClick={saveDraft}>
            ↓ &nbsp; {pending ? 'Saving…' : 'Save draft'}
          </button>}
          {canPublish && <button type="button" className="ss-btn ss-publish-action"
            disabled={pending || hasUnsavedChanges}
            onClick={() => start(async () => {
              const result = await publishAction(id, version, 'Published from website studio');
              setMessage(result.message);
              if (result.id) setVersion((current) => current + 1);
            })}>
            ↗ &nbsp; {templateMode ? 'Publish template' : 'Publish website'}
          </button>}
        </div>
      </header>
      {!templateMode && <nav className="ss-modebar ss-simple-nav" aria-label="Website editing modes">
        <div className="ss-modebar-left">
          <Link href="/dashboard/website" onClick={confirmLeavingEditor}>← Templates</Link>
          <span className="ss-mode-active">◉ &nbsp; Visual Editor</span>
          {canViewSource && <Link href={`/dashboard/website/${id}/developer`}
            onClick={confirmLeavingEditor}>⌘ &nbsp; Code / Files</Link>}
          {canViewSource && <Link href={`/dashboard/website/${id}/git`}
            onClick={confirmLeavingEditor}>GitHub / VS Code</Link>}
        </div>
        <div className="ss-modebar-right">
          <Link href={`/dashboard/website/${id}/design`} onClick={confirmLeavingEditor}>Design</Link>
          <Link href={`/dashboard/website/${id}/media`} onClick={confirmLeavingEditor}>Images</Link>
          <Link href={`/dashboard/website/${id}/seo`} onClick={confirmLeavingEditor}>SEO</Link>
        </div>
      </nav>}
      {message && <p className="ss-message" role="status">{message}</p>}
      <div className="ss-board">
        <div className="ss-toolbar">
          <div className="ss-toolbar-group">
            <button type="button" className="ss-simple-tool" aria-expanded={showSections}
              onClick={() => {setShowSections(open => !open);setShowInspector(false);}}>
              ☰ &nbsp; Pages / Sections
            </button>
            <button type="button" className="ss-simple-tool" aria-expanded={showInspector}
              onClick={() => {setShowInspector(open => !open);setShowSections(false);}}>
              ✎ &nbsp; {selection ? 'Edit selection' : 'Page settings'}
            </button>
            <span className="ss-toolbar-label">EDITING</span>
            <select aria-label="Page" className="ss-page-select" value={page.id}
              onChange={(event) => { setPageId(event.target.value); setSelection(null); }}>
              {document.pages.map((item) => <option key={item.id} value={item.id}>
                {item.path === '/' ? '⌂ ' : ''}{item.title}
              </option>)}
            </select>
            {canEdit && <button type="button" className="ss-btn ss-small-action" onClick={() => {
              const n = uid();
              edit({ ...document, pages: [...document.pages, {
                id: n, path: `/page-${document.pages.length + 1}`,
                title: 'New page', visibility: 'draft',
                seo: { title: 'New page', description: '', noindex: false },
                nodes: [],
              }] });
              setPageId(n);
              setArea('pages');
              setSelection(null);
            }}>+ Page</button>}
            <span className="ss-toolbar-separator" />
            <div className="ss-history-controls">
              <button type="button" aria-label="Undo" title="Undo" disabled={!history.past.length}
                onClick={() => setHistory(undoHistory)}>↶</button>
              <button type="button" aria-label="Redo" title="Redo" disabled={!history.future.length}
                onClick={() => setHistory(redoHistory)}>↷</button>
            </div>
            <select aria-label="Editing area" className="ss-area-select" value={area}
              onChange={(event) => { setArea(event.target.value as typeof area); setSelection(null); }}>
              <option value="pages">Page content</option>
              <option value="header">Global header</option>
              <option value="footer">Global footer</option>
            </select>
          </div>
          <div className="ss-toolbar-group">
            <button type="button" className="ss-simple-tool" onClick={() => setFocused(open => !open)}>
              {focused ? '✕ Exit full screen' : '⛶ Full screen'}
            </button>
            <span className="ss-toolbar-label">VIEW</span>
            <div className="ss-device-controls" role="group" aria-label="Preview device">
              {(['desktop', 'tablet', 'mobile'] as const).map((size) =>
                <button type="button" key={size} aria-label={size + ' preview'}
                  title={size} aria-pressed={device === size}
                  className={device === size ? 'active' : ''}
                  onClick={() => setDevice(size)}>
                  {size === 'desktop' ? '▣' : size === 'tablet' ? '▥' : '▯'}
                </button>)}
            </div>
            <span className="ss-draft-badge">● {status === 'published' ? 'Published / draft' : 'Draft'}</span>
          </div>
        </div>
        <div className="ss-workspace">

        {showSections && <aside className="ss-left-panel">
          <div className="ss-panel-close-bar"><strong>Website sections</strong>
            <button type="button" aria-label="Close sections" onClick={() => setShowSections(false)}>✕</button>
          </div>
          <div className="ss-left-tabs" role="tablist" aria-label="Editor sidebar">
            <button type="button" role="tab" aria-selected={sideTab === 'layers'}
              className={sideTab === 'layers' ? 'active' : ''}
              onClick={() => setSideTab('layers')}>Page layers</button>
            <button type="button" role="tab" aria-selected={sideTab === 'components'}
              className={sideTab === 'components' ? 'active' : ''}
              onClick={() => setSideTab('components')}>Components</button>
            {canViewSource && <button type="button" role="tab" aria-selected={sideTab === 'files'}
              className={sideTab === 'files' ? 'active' : ''}
              onClick={() => setSideTab('files')}>Files</button>}
          </div>
          {sideTab === 'layers' ? <div className="ss-left-content" role="tabpanel">
            <h2 className="ss-panel-label">{area === 'pages' ? 'CURRENT PAGE' : area === 'header' ? 'GLOBAL HEADER' : 'GLOBAL FOOTER'}</h2>
            {activeNodes.length ? layers(activeNodes) : <p className="ss-empty-layers">
              Nothing on this page yet. Choose Components to add your first section.
            </p>}
            {canEdit && <div className="ss-layer-actions">
              <button type="button" onClick={() => setSideTab('components')}>+ Add section</button>
              <button type="button" disabled={!selected} onClick={() => {
                if (!selected) return;
                nodes([...activeNodes, duplicateNode(selected, uid)]);
              }}>▣ Duplicate</button>
            </div>}
            <h2 className="ss-panel-label ss-shared-label">SHARED ELEMENTS</h2>
            <button type="button" className="ss-shared-row" onClick={() => {
              setArea('header'); setSelection(null); }}>
              <span>☰</span> Global header <b>›</b>
            </button>
            <button type="button" className="ss-shared-row" onClick={() => {
              setArea('footer'); setSelection(null); }}>
              <span>▣</span> Global footer <b>›</b>
            </button>
          </div> : sideTab === 'components' ? <div className="ss-left-content" role="tabpanel">
            <h2 className="ss-panel-label">ADD COMPONENT</h2>
            <input aria-label="Find component" placeholder="Find a component…"
              className="ss-palette-search" value={palette}
              onChange={(event) => setPalette(event.target.value)} />
            <div className="ss-palette-grid">
              {componentTypes.filter((type) => type.includes(palette.toLowerCase())).map(type =>
                <button type="button" key={type} disabled={!canEdit}
                  draggable={canEdit}
                  onDragStart={(event) => event.dataTransfer.setData('application/website-component', type)}
                  onClick={() => {
                    const n = uid();
                    nodes(insertNode(activeNodes, type, n));
                    setSelection(n); setSideTab('layers');
                  }}>
                  <span aria-hidden="true">▣</span>{type.replaceAll('_', ' ')}
                </button>)}
            </div>
            {document.sections.length > 0 && <div className="ss-saved-sections">
              <h2 className="ss-panel-label">SAVED SECTIONS</h2>
              {document.sections.map(section =>
                <button type="button" disabled={!canEdit} key={section.id} onClick={() => {
                  const node = duplicateNode(section.node, uid);
                  nodes([...activeNodes, node]);setSelection(node.id);setSideTab('layers');
                }}>{section.name}</button>)}
            </div>}
          </div> : <div className="ss-left-content" role="tabpanel">
            <h2 className="ss-panel-label">TEMPLATE FILES</h2>
            <p className="ss-empty-layers">Your website files are organized below. Choose a page or source file to edit.</p>
            <div className="ss-files-tree">
              <h3>▤ &nbsp; pages/</h3>
              {document.pages.map(item => {
                const codeNode = item.nodes.length === 1 && item.nodes[0]?.type === 'custom'
                  ? document.code.find(code => code.id === item.nodes[0]?.props.code)
                  : undefined;
                return codeNode ? <Link key={item.id}
                  href={`/dashboard/website/${id}/developer?page=${item.id}`}
                  onClick={confirmLeavingEditor}>⌘ {item.title}.html</Link> :
                  <button type="button" key={item.id} onClick={() => {
                    setArea('pages');setPageId(item.id);setSelection(null);setSideTab('layers');
                  }}>▣ {item.title} (visual)</button>;
              })}
              <h3>◈ &nbsp; components/</h3>
              {document.code.filter(code => !code.name.startsWith('pages/')).map(code =>
                <Link key={code.id}
                  href={`/dashboard/website/${id}/developer?file=${code.id}`}
                  onClick={confirmLeavingEditor}>◇ {code.name.split('/').at(-1)}</Link>)}
              <h3>▤ &nbsp; styles/</h3>
              <Link href={`/dashboard/website/${id}/developer?file=global`}
                onClick={confirmLeavingEditor}>CSS global.css</Link>
            </div>
            <h2 className="ss-panel-label ss-shared-label">THIS PAGE</h2>
            <button className="ss-file-convert" type="button" disabled={!canEdit || pending || hasUnsavedChanges}
              onClick={convertToCode}>⌘ Convert to code copy</button>
            <p className="ss-empty-layers">Creates a separate editable HTML/CSS draft page. The original template and published website stay safe. Media and forms need manual editing.</p>
            <Link className="ss-file-link" href={`/dashboard/website/${id}/git`}
              onClick={confirmLeavingEditor}>↗ GitHub & VS Code</Link>
          </div>}
          <div className="ss-left-tip"><strong>✦ &nbsp; Quick tip</strong>
            <p>Click text on the website to type directly. Use Components to add sections or Files to edit HTML and CSS.</p>
          </div>
        </aside>}
        <section className="ss-canvas" aria-label="Website canvas"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const type = event.dataTransfer.getData('application/website-component');
            if (canEdit && componentTypes.includes(type as (typeof componentTypes)[number])) {
              const n = uid();
              nodes([...activeNodes, createNode(type as (typeof componentTypes)[number], n)]);
              setSelection(n);
            }
          }}>
          <div className="ss-canvas-head">
            <span className="ss-canvas-path">⌂ &nbsp; {page.path} &nbsp; · &nbsp; {page.visibility === 'public' ? 'Public on publish' : 'Private draft'}</span>
            <span role="status">{previewLoading ? 'Updating preview…' : 'Click text to type · Click a section for options'}</span>
          </div>
          <div className={`ss-browser ss-browser-${device}`}>
            <div className="ss-browser-bar" aria-hidden="true">
              <span className="ss-traffic"><i/><i/><i/></span>
              <span className="ss-browser-address">{name.toLowerCase().replace(/[^a-z0-9-]/g,'-')}.example / {page.path === '/' ? '' : page.path.slice(1)}</span>
              <span className="ss-browser-empty" />
            </div>
            <iframe
              ref={frame}
              onLoad={() => frame.current?.contentWindow?.postMessage({
                type: 'website.preview-restore-scroll', ...previewScroll.current,
              }, '*')}
              title="Website preview"
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={previewSrcDoc ||
                '<!doctype html><html><body style="font:16px sans-serif;padding:24px">Building preview…</body></html>'}
              className="ss-preview-frame"
            />
          </div>
          <div className="ss-canvas-foot">▣ &nbsp; Responsive canvas &nbsp; · &nbsp;
            {device === 'mobile' ? '390' : device === 'tablet' ? '768' : '1200'} px &nbsp; · &nbsp;
            Select an element to edit its properties
          </div>
        </section>
        {showInspector && <aside ref={inspectorRef} className="ss-inspector">
          <div className="ss-inspector-top">
            <h2>{selected ? selected.type === 'image' || selected.props.asset
              ? 'Replace image' : 'Edit section' : 'Page settings'}</h2>
            <button type="button" className="ss-panel-close" aria-label="Close properties"
              onClick={() => setShowInspector(false)}>✕</button>
          </div>
          {selected && <div className="ss-selected-card">
            <span className="ss-selected-icon" aria-hidden="true">▣</span>
            <div><strong>{selected.type.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) + ' Section'}</strong>
              <small>Change text, images and styling</small>
            </div>
          </div>}
          <div className="ss-inspector-content">

          {!selected ? (
            <>
              <label className="block text-xs">
                Page title
                <input
                  disabled={!canEdit}
                  className={`${controls} mt-1`}
                  value={page.title}
                  onChange={(e) =>
                    edit({
                      ...document,
                      pages: document.pages.map((p) =>
                        p.id === page.id ? { ...p, title: e.target.value } : p,
                      ),
                    })
                  }
                />
              </label>
              <label className="block text-xs">
                Route
                <input
                  disabled={!canEdit}
                  className={`${controls} mt-1`}
                  value={page.path}
                  onChange={(e) =>
                    edit({
                      ...document,
                      pages: document.pages.map((p) =>
                        p.id === page.id ? { ...p, path: e.target.value } : p,
                      ),
                    })
                  }
                />
              </label>
              <label className="block text-xs">
                Visibility
                <select
                  disabled={!canEdit}
                  className={`${controls} mt-1`}
                  value={page.visibility}
                  onChange={(e) =>
                    edit({
                      ...document,
                      pages: document.pages.map((p) =>
                        p.id === page.id
                          ? {
                              ...p,
                              visibility: e.target.value as 'public' | 'draft',
                            }
                          : p,
                      ),
                    })
                  }
                >
                  <option value="draft">Draft / private</option>
                  <option value="public">Public on publish</option>
                </select>
              </label>
              {canEdit && page.path !== '/' && (
                <button
                  className="text-sm text-red-700"
                  onClick={() => {
                    edit({
                      ...document,
                      pages: document.pages.filter((p) => p.id !== page.id),
                    });
                    setPageId(document.pages[0]!.id);
                  }}
                >
                  Remove page
                </button>
              )}
            </>
          ) : (
            <fieldset disabled={!canEdit} className="space-y-4">
              <h3 className="ss-inspector-section-title">Edit content</h3>
              <p className="ss-content-help">Update this section here. Changes appear in the preview and stay in your draft until saved.</p>
              {contentFields.length === 0 && selected.type !== 'image' &&
                selected.type !== 'logo' && <p className="ss-content-help">
                  This section has no text to edit. Select a different section or use the
                  settings below to change its appearance.
                </p>}
              {(selected.type === 'image' || selected.type === 'hero' ||
                selected.type === 'logo' || selected.props.asset !== undefined) && (
                <WebsiteMediaPicker
                  id={id}
                  assets={document.assets}
                  value={selected.props.asset}
                  label={selected.type === 'logo' ? 'Logo image' : 'Section image'}
                  disabled={!canEdit || pending}
                  canPreview={canPreviewMedia}
                  unsaved={hasUnsavedChanges}
                  onUploaded={asset => {
                    // Merge into the latest draft: uploads can finish after edits.
                    const targetId = selection;
                    const targetArea = area;
                    const targetPageId = page.id;
                    setHistory(history => {
                      const current = history.present;
                      const currentNodes = targetArea === 'pages'
                        ? current.pages.find(item => item.id === targetPageId)?.nodes
                        : current[targetArea];
                      if (!currentNodes || !targetId) return history;
                      const nextNodes = structuredClone(currentNodes);
                      const target = locateNode(nextNodes, targetId);
                      if (!target) return history;
                      target.props.asset = asset.id;
                      if (!target.props.alt && asset.alt) target.props.alt = asset.alt;
                      const draft: WebsiteDocument = {
                        ...current,
                        assets: current.assets.some(item => item.id === asset.id)
                          ? current.assets : [...current.assets, asset],
                      };
                      if (targetArea === 'pages') draft.pages = current.pages.map(item =>
                        item.id === targetPageId ? { ...item, nodes: nextNodes } : item);
                      else if (targetArea === 'header') draft.header = nextNodes;
                      else draft.footer = nextNodes;
                      return editHistory(history, draft);
                    });
                    setMessage('Image uploaded. Save draft to keep this change.');
                  }}
                  onChange={assetId => update(node => {
                    if (assetId) {
                      node.props.asset = assetId;
                      const asset = document.assets.find(item => item.id === assetId);
                      if (asset?.alt && !node.props.alt) node.props.alt = asset.alt;
                    } else delete node.props.asset;
                  })}
                />
              )}
              {contentFields.map(field => (
                <label key={field.key} className="ss-field-label">
                  {field.label}
                  {field.multiline ? (
                    <textarea
                      className={`${controls} mt-1`}
                      rows={field.key === 'text' ? 5 : 3}
                      maxLength={field.maxLength}
                      placeholder={field.placeholder}
                      value={selected.props[field.key] ?? ''}
                      onChange={event => update(node => {
                        if (event.target.value) node.props[field.key] = event.target.value;
                        else delete node.props[field.key];
                      })}
                    />
                  ) : (
                    <input className={`${controls} mt-1`}
                      maxLength={field.maxLength}
                      placeholder={field.placeholder}
                      value={selected.props[field.key] ?? ''}
                      onChange={event => update(node => {
                        if (event.target.value) node.props[field.key] = event.target.value;
                        else delete node.props[field.key];
                      })}
                    />
                  )}
                </label>
              ))}
              <h3 className="ss-inspector-section-title ss-appearance-label">Appearance</h3>
              {(['background', 'color'] as const).map(key => (
                <label key={key} className="ss-color-field">
                  {key === 'background' ? 'Background' : 'Text color'}
                  <input type="color" value={(device === 'desktop' ? selected.style : selected[device])[key] ?? '#ffffff'}
                    onChange={event => update(node => {
                      (device === 'desktop' ? node.style : node[device])[key] = event.target.value;
                    })} />
                </label>
              ))}
              <div className="ss-two-col-fields">
                {(['padding', 'radius'] as const).map(key => (
                  <label key={key} className="ss-field-label">
                    {key === 'radius' ? 'Border radius' : 'Padding'}
                    <input type="number" min="0" max="2000" className={controls}
                      value={(device === 'desktop' ? selected.style : selected[device])[key] ?? ''}
                      onChange={event => update(node => {
                        const style = device === 'desktop' ? node.style : node[device];
                        if (event.target.value === '') delete style[key];
                        else style[key] = Number(event.target.value);
                      })} />
                  </label>
                ))}
              </div>
              <details className="ss-inspector-advanced">
                <summary>Advanced settings and layout</summary>
                <label className="block text-xs">
                Public data
                <select
                  className={controls}
                  value={selected.props.binding ?? ''}
                  onChange={(e) =>
                    update((n) => {
                      if (e.target.value)
                        n.props.binding = e.target.value as NonNullable<
                          WebsiteNode['props']['binding']
                        >;
                      else delete n.props.binding;
                    })
                  }
                >
                  <option value="">No binding</option>
                  {[
                    'business',
                    'services',
                    'projects',
                    'testimonials',
                    'team',
                    'faqs',
                    'locations',
                    'social',
                  ].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>

                {(['form', 'embed', 'code'] as const)
                  .filter(key => selected.props[key] !== undefined)
                  .map(key => <label key={key} className="ss-field-label">
                    {key === 'code' ? 'Custom component reference' :
                      key === 'form' ? 'Form reference' : 'Embedded content URL'}
                    <input className={controls} value={selected.props[key] ?? ''}
                      onChange={event => update(node => {
                        if (event.target.value) node.props[key] = event.target.value;
                        else delete node.props[key];
                      })} />
                  </label>)}
                {selected.props.code && canViewSource &&
                  <Link href={`/dashboard/website/${id}/developer`} onClick={confirmLeavingEditor}>Open advanced source editor</Link>}

                {(['fontSize','gap','margin','columns','maxWidth','minHeight'] as const).map(key => (
                  <label key={key} className="ss-field-label">
                    {key}
                    <input type="number" min="0" max="2000" className={controls}
                      value={(device === 'desktop' ? selected.style : selected[device])[key] ?? ''}
                      onChange={event => update(node => {
                        const style = device === 'desktop' ? node.style : node[device];
                        if(event.target.value === '') delete style[key];
                        else style[key] = Number(event.target.value);
                      })} />
                  </label>
                ))}
                <label className="ss-color-field">Border color
                  <input type="color" value={(device === 'desktop' ? selected.style : selected[device]).border ?? '#ffffff'}
                    onChange={event => update(node => {
                      (device === 'desktop' ? node.style : node[device]).border = event.target.value;
                    })}/>
                </label>
                <label className="ss-field-label">Display
                  <select className={controls}
                    value={(device === 'desktop' ? selected.style : selected[device]).display ?? 'block'}
                    onChange={event => update(node => {
                      (device === 'desktop' ? node.style : node[device]).display =
                        event.target.value as NodeStyle['display'];
                    })}>
                    {['block','flex','grid','none'].map(value => <option key={value}>{value}</option>)}
                  </select>
                </label>
              </details>
              <details className="ss-inspector-advanced ss-section-layout">
                <summary>Responsive and section placement</summary>
                <h3 className="ss-inspector-section-title ss-appearance-label">Responsive</h3>
                <div className="ss-inspector-responsive">
                {(['desktop','tablet','mobile'] as const).map(size => (
                  <button type="button" key={size} className={device === size ? 'active' : ''}
                    onClick={() => setDevice(size)}>{size}</button>
                ))}
              </div>
              <p className="ss-responsive-tip">Adjust styles for the selected device without changing other layouts.</p>
              <label className="block text-xs">
                Move into container
                <select
                  className={controls}
                  defaultValue=""
                  onChange={(e) => {
                    move(selected, e.target.value || null, 999);
                    e.target.value = '';
                  }}
                >
                  <option value="">Page root</option>
                  {containers
                    .filter((n) => n.id !== selected.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.props.title || n.type} · {n.id.slice(-5)}
                      </option>
                    ))}
                </select>
              </label>
              <div className="flex gap-3 text-xs">
                <button
                  onClick={() =>
                    nodes([...activeNodes, duplicateNode(selected, uid)])
                  }
                >
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    nodes(removeNode(activeNodes, selected.id));
                    setSelection(null);
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={() => {
                    const next = {
                      ...document,
                      sections: [
                        ...document.sections,
                        {
                          id: uid(),
                          name: selected.props.title || selected.type,
                          node: duplicateNode(selected, uid),
                        },
                      ],
                    };
                    edit(next);
                    start(async () => {
                      const r = await saveAction(
                        id,
                        version,
                        'sections',
                        next.sections,
                      );
                      setMessage(r.message);
                      if (r.version) setVersion(r.version);
                    });
                  }}
                >
                  Save reusable section
                </button>
              </div>
              </details>
            </fieldset>
          )}
          {document.sections.length > 0 && (
            <label className="block text-xs">
              Insert saved section
              <select
                className={controls}
                defaultValue=""
                onChange={(e) => {
                  const section = document.sections.find(
                    (s) => s.id === e.target.value,
                  );
                  if (section && canEdit)
                    nodes([...activeNodes, duplicateNode(section.node, uid)]);
                  e.target.value = '';
                }}
              >
                <option value="">Select section</option>
                {document.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          </div>
        </aside>}
        </div>
      </div>
      <div className="ss-studio-foot">🔒 &nbsp; Draft preview only. Website changes are published only when you choose Publish.</div>
      {canEdit && (hasUnsavedChanges || pending) && <>
        <div className="ss-mobile-draft-spacer" aria-hidden="true" />
        <div className="ss-mobile-draftbar" role="region" aria-label="Unsaved website changes">
          <span className="ss-mobile-draftbar-state">
            {pending ? 'Saving website…' : 'Unsaved website changes'}
          </span>
          <button type="button" disabled={pending || !hasUnsavedChanges}
            onClick={saveDraft}>
            {pending ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </>}
      {fullPreview && <div className="ss-preview-overlay" role="presentation" onMouseDown={(event) => {
        if (event.currentTarget === event.target) setFullPreview(false);
      }}>
        <div className="ss-preview-dialog" role="dialog" aria-modal="true" aria-label="Full website preview">
          <div className="ss-preview-dialog-bar">
            <div><strong>{name} · Website preview</strong><span>Sandboxed draft · {page.path}</span></div>
            <button type="button" onClick={() => setFullPreview(false)}>Close ×</button>
          </div>
          <iframe title="Full website preview" sandbox="allow-scripts"
            referrerPolicy="no-referrer" srcDoc={previewSrcDoc} />
        </div>
      </div>}
    </div>
  );
}
