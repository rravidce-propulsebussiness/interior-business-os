'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
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
}: {
  id: string;
  initial: WebsiteDocument;
  version: number;
  name: string;
  status: string;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [selection, setSelection] = useState<string | null>(null);
  useEffect(() => {
    const select = (event: MessageEvent) => {
      if (
        event.source === frame.current?.contentWindow &&
        event.data?.type === 'website.select' &&
        typeof event.data.id === 'string'
      )
        setSelection(event.data.id);
    };
    window.addEventListener('message', select);
    return () => window.removeEventListener('message', select);
  }, []);
  const [history, setHistory] = useState<History<WebsiteDocument>>({
      past: [],
      present: initial,
      future: [],
    }),
    [version, setVersion] = useState(initialVersion),
    [pageId, setPageId] = useState(initial.pages[0]!.id),
    [area, setArea] = useState<'pages' | 'header' | 'footer'>('pages'),
    [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop'),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState(''),
    [pending, start] = useTransition(),
    [palette, setPalette] = useState('');
  const document = history.present,
    page = document.pages.find((p) => p.id === pageId) ?? document.pages[0]!,
    activeNodes = area === 'pages' ? page.nodes : document[area],
    selected = selection ? locateNode(activeNodes, selection) : undefined;
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
      change(node);
      nodes(next);
    }
  };
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      renderDraftPreview(id, history.present, page.path)
        .then((html) => {
          if (active) {
            setPreview(html ?? '');
            setMessage('');
          }
        })
        .catch((e) => {
          if (active)
            setMessage(e instanceof Error ? e.message : 'Preview unavailable');
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [history.present, id, page.path]);
  const move = (node: WebsiteNode, parent: string | null, index: number) => {
    try {
      nodes(moveNode(activeNodes, node.id, parent, index));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to move');
    }
  };
  function layers(list: WebsiteNode[], parent: string | null = null) {
    return (
      <ol className="space-y-1">
        {list.map((node, i) => (
          <li key={node.id} className="rounded border-l pl-2">
            <div
              className={`group flex items-center gap-1 rounded p-1 ${selection === node.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
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
                className="min-w-0 flex-1 truncate py-1 text-left text-xs capitalize"
                onClick={() => setSelection(node.id)}
              >
                {node.type} {node.props.title || node.props.text?.slice(0, 20)}
              </button>
              {canEdit && (
                <>
                  <button
                    aria-label={`Move ${node.type} up`}
                    className="px-1 text-xs"
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
  return (
    <>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-3">
        <div>
          <h1 className="font-semibold">{name}</h1>
          <p className="text-xs capitalize text-muted-foreground">
            {status} · Draft {version}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded border px-3 py-2 text-sm"
            disabled={!history.past.length}
            onClick={() => setHistory(undoHistory)}
          >
            Undo
          </button>
          <button
            className="rounded border px-3 py-2 text-sm"
            disabled={!history.future.length}
            onClick={() => setHistory(redoHistory)}
          >
            Redo
          </button>
          <select
            aria-label="Preview device"
            className="rounded border bg-background px-3 py-2 text-sm"
            value={device}
            onChange={(e) => setDevice(e.target.value as typeof device)}
          >
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablet</option>
            <option value="mobile">Mobile</option>
          </select>
          <select
            aria-label="Editing area"
            value={area}
            onChange={(e) => {
              setArea(e.target.value as typeof area);
              setSelection(null);
            }}
            className="rounded border bg-background px-3 py-2 text-sm"
          >
            <option value="pages">Page content</option>
            <option value="header">Global header</option>
            <option value="footer">Global footer</option>
          </select>
          {canEdit && (
            <button
              disabled={pending}
              className="rounded border px-4 py-2 text-sm"
              onClick={() =>
                start(async () => {
                  const r = await saveWebsiteSection(
                    id,
                    version,
                    area,
                    document[area],
                  );
                  setMessage(r.message);
                  if (r.version) setVersion(r.version);
                })
              }
            >
              Save draft
            </button>
          )}
          {canPublish && (
            <button
              disabled={pending}
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
              onClick={() =>
                start(async () => {
                  const r = await publishWebsite(
                    id,
                    version,
                    'Published from website studio',
                  );
                  setMessage(r.message);
                  if (r.id) setVersion((v) => v + 1);
                })
              }
            >
              Publish saved draft
            </button>
          )}
        </div>
      </header>
      <p role="status" className="min-h-7 px-5 py-1 text-xs">
        {message}
      </p>
      <div className="grid min-h-[80vh] lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="space-y-5 border-r bg-background p-4">
          <label className="block text-xs font-semibold uppercase tracking-wider">
            Pages
            <select
              aria-label="Page"
              className={`${controls} mt-2`}
              value={page.id}
              onChange={(e) => {
                setPageId(e.target.value);
                setSelection(null);
              }}
            >
              {document.pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          {canEdit && (
            <div className="flex gap-2 text-xs">
              <button
                className="rounded border p-2"
                onClick={() => {
                  const n = uid();
                  edit({
                    ...document,
                    pages: [
                      ...document.pages,
                      {
                        id: n,
                        path: `/page-${document.pages.length + 1}`,
                        title: 'New page',
                        visibility: 'draft',
                        seo: {
                          title: 'New page',
                          description: '',
                          noindex: false,
                        },
                        nodes: [],
                      },
                    ],
                  });
                  setPageId(n);
                }}
              >
                + Page
              </button>
              <button
                className="rounded border p-2"
                onClick={() => {
                  const n = uid();
                  edit({
                    ...document,
                    pages: [
                      ...document.pages,
                      {
                        ...structuredClone(page),
                        id: n,
                        path: `/copy-${n.slice(0, 8)}`,
                        title: `${page.title} copy`,
                        visibility: 'draft',
                        nodes: activeNodes.map((node) =>
                          duplicateNode(node, uid),
                        ),
                      },
                    ],
                  });
                  setPageId(n);
                }}
              >
                Duplicate
              </button>
            </div>
          )}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider">
              Components
            </h2>
            <input
              aria-label="Find component"
              placeholder="Find a component…"
              className={controls}
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
            />
            <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-auto">
              {componentTypes
                .filter((t) => t.includes(palette.toLowerCase()))
                .map((type) => (
                  <button
                    key={type}
                    draggable={canEdit}
                    disabled={!canEdit}
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        'application/website-component',
                        type,
                      )
                    }
                    onClick={() => {
                      const n = uid();
                      nodes(insertNode(activeNodes, type, n));
                      setSelection(n);
                    }}
                    className="rounded-lg border px-2 py-3 text-xs capitalize hover:border-primary"
                  >
                    {type.replaceAll('_', ' ')}
                  </button>
                ))}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider">
              Layers
            </h2>
            {layers(activeNodes)}
          </div>
        </aside>
        <section
          className="min-w-0 overflow-auto bg-[#e8e7e3] p-5"
          aria-label="Website canvas"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData(
              'application/website-component',
            );
            if (
              canEdit &&
              componentTypes.includes(type as (typeof componentTypes)[number])
            )
              nodes([
                ...activeNodes,
                createNode(type as (typeof componentTypes)[number], uid()),
              ]);
          }}
        >
          <div className="mx-auto mb-3 flex max-w-full items-center justify-between text-xs text-muted-foreground">
            <span>
              {page.path} · {page.visibility}
            </span>
            <span>
              {device === 'mobile'
                ? '390'
                : device === 'tablet'
                  ? '768'
                  : '1200'}{' '}
              px
            </span>
          </div>
          <iframe
            ref={frame}
            title="Website preview"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={
              preview ||
              '<!doctype html><p style="font:16px sans-serif;padding:24px">Building preview…</p>'
            }
            className="mx-auto block h-[80vh] max-w-full border-0 bg-white shadow-xl"
            style={{
              width:
                device === 'mobile' ? 390 : device === 'tablet' ? 768 : 1200,
            }}
          />
        </section>
        <aside className="space-y-4 border-l bg-background p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider">
            {selected ? 'Component properties' : 'Page properties'}
          </h2>
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
              <p className="text-sm capitalize">{selected.type}</p>
              {(
                [
                  'title',
                  'text',
                  'subtitle',
                  'href',
                  'asset',
                  'alt',
                  'form',
                  'code',
                  'embed',
                ] as const
              ).map((key) => (
                <label key={key} className="block text-xs capitalize">
                  {key}
                  <input
                    className={`${controls} mt-1`}
                    value={selected.props[key] ?? ''}
                    onChange={(e) =>
                      update((n) => {
                        if (e.target.value) n.props[key] = e.target.value;
                        else delete n.props[key];
                      })
                    }
                  />
                </label>
              ))}
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
              <h3 className="border-t pt-4 text-xs font-semibold uppercase">
                {device} styles
              </h3>
              {(
                [
                  'fontSize',
                  'padding',
                  'gap',
                  'margin',
                  'radius',
                  'columns',
                  'maxWidth',
                  'minHeight',
                ] as const
              ).map((key) => (
                <label key={key} className="block text-xs">
                  {key}
                  <input
                    type="number"
                    min="0"
                    max="2000"
                    className={`${controls} mt-1`}
                    value={
                      (device === 'desktop'
                        ? selected.style
                        : selected[device])[key] ?? ''
                    }
                    onChange={(e) =>
                      update((n) => {
                        const s = device === 'desktop' ? n.style : n[device];
                        if (e.target.value === '') delete s[key];
                        else s[key] = Number(e.target.value);
                      })
                    }
                  />
                </label>
              ))}
              {(['color', 'background', 'border'] as const).map((key) => (
                <label
                  key={key}
                  className="flex items-center justify-between text-xs"
                >
                  {key}
                  <input
                    type="color"
                    value={
                      (device === 'desktop'
                        ? selected.style
                        : selected[device])[key] ?? '#ffffff'
                    }
                    onChange={(e) =>
                      update((n) => {
                        (device === 'desktop' ? n.style : n[device])[key] =
                          e.target.value;
                      })
                    }
                  />
                </label>
              ))}
              <label className="block text-xs">
                Visibility / display
                <select
                  className={controls}
                  value={
                    (device === 'desktop' ? selected.style : selected[device])
                      .display ?? 'block'
                  }
                  onChange={(e) =>
                    update((n) => {
                      (device === 'desktop' ? n.style : n[device]).display = e
                        .target.value as NodeStyle['display'];
                    })
                  }
                >
                  {['block', 'flex', 'grid', 'none'].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
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
                      const r = await saveWebsiteSection(
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
                  Save section
                </button>
              </div>
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
        </aside>
      </div>
    </>
  );
}
