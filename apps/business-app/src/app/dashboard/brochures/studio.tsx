'use client';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  componentTypes,
  createComponent,
  fonts,
  formats,
  pageSize,
  validateDocument,
  type BrochureDocument,
  type Component,
  type MarketingKit,
} from '@business-os/brochure-builder';
import {
  edit,
  undo,
  redo,
  movePage,
  duplicatePage,
  newPage,
  layer,
  type History,
} from '@business-os/brochure-builder/editor';
import {
  brochureCss,
  pageHtml,
  imageWarnings,
} from '@business-os/brochure-builder/render';
import {
  saveBrochure,
  publishBrochure,
  saveBrochureBlock,
  brochureAssetPage,
} from './actions';
import './studio.css';
const uid = () => `n${crypto.randomUUID().replaceAll('-', '')}`;
type Asset = {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
};
export function BrochureStudio({
  id,
  initial,
  initialVersion,
  status,
  assets: initialAssets,
  kit,
  canEdit,
  canPublish,
}: {
  id: string;
  initial: BrochureDocument;
  initialVersion: number;
  status: string;
  assets: Asset[];
  kit: MarketingKit;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [assetPage, setAssetPage] = useState(1);
  const [moreAssets, setMoreAssets] = useState(initialAssets.length === 25);
  const [history, setHistory] = useState<History>({
    past: [],
    present: initial,
    future: [],
  });
  const [version, setVersion] = useState(initialVersion);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [pageIndex, setPageIndex] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.65);
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [tab, setTab] = useState<'design' | 'document' | 'settings'>('design');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const d = history.present;
  const page = d.pages[pageIndex] ?? d.pages[0]!;
  const selected = page.components.find((c) => c.id === selection);
  const [width, height] = pageSize(d);
  const px = 96 / 25.4;
  const dirty = saved !== JSON.stringify(d);
  const assetUrl = (aid: string) => `/dashboard/brochures/media/${aid}`;
  const change = (next: BrochureDocument) => {
    if (canEdit) setHistory((h) => edit(h, next));
  };
  const components = (next: Component[]) =>
    change({
      ...d,
      pages: d.pages.map((p) =>
        p.id === page.id ? { ...p, components: next } : p,
      ),
    });
  const update = (patch: Partial<Component>) => {
    if (selected && !selected.locked)
      components(
        page.components.map((c) =>
          c.id === selected.id ? { ...c, ...patch } : c,
        ),
      );
  };
  const style = (patch: Partial<Component['style']>) =>
    selected && update({ style: { ...selected.style, ...patch } });
  const add = (type: Component['type'], x = 15, y = 20) => {
    const c = createComponent(type, uid());
    c.width = Math.min(c.width, width - 10);
    c.height = Math.min(c.height, height - 10);
    c.x = Math.min(width - c.width, Math.max(0, x));
    c.y = Math.min(height - c.height, Math.max(0, y));
    components([...page.components, c]);
    setSelection(c.id);
  };
  const pageChange = (patch: Partial<typeof page>) =>
    change({
      ...d,
      pages: d.pages.map((p) => (p.id === page.id ? { ...p, ...patch } : p)),
    });
  let validation = '';
  try {
    validateDocument(d);
  } catch (e) {
    validation = e instanceof Error ? e.message : 'Invalid layout';
  }
  const warnings = imageWarnings(d, assets);
  const field = (
    label: string,
    value: string | number,
    onChange: (v: string) => void,
    type = 'text',
  ) => (
    <label className="brochure-field">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!canEdit}
      />
    </label>
  );
  return (
    <div className="brochure-studio">
      <header className="brochure-toolbar">
        <Link href="/dashboard/brochures" className="brochure-back">
          ← Brochures
        </Link>
        <strong>{d.title}</strong>
        <span className="brochure-muted">
          {status} · revision {version}
          {dirty ? ' · unsaved' : ''}
        </span>
        <div className="brochure-toolbar-actions">
          <button
            disabled={!canEdit || !history.past.length}
            onClick={() => setHistory(undo)}
          >
            Undo
          </button>
          <button
            disabled={!canEdit || !history.future.length}
            onClick={() => setHistory(redo)}
          >
            Redo
          </button>
          <button
            disabled={pending || !canEdit || !!validation}
            onClick={() =>
              start(async () => {
                const r = await saveBrochure(id, version, d);
                setMessage(r.message);
                if (r.ok) {
                  setVersion(r.version);
                  setSaved(JSON.stringify(d));
                }
              })
            }
          >
            Save
          </button>
          <a href={`/dashboard/brochures/${id}/preview`} target="_blank">
            Print preview
          </a>
          <a href={`/dashboard/brochures/${id}/pdf`} target="_blank">
            Export PDF
          </a>
          <button
            className="brochure-primary"
            disabled={pending || !canPublish || dirty || !!validation}
            onClick={() =>
              start(async () => {
                const r = await publishBrochure(
                  id,
                  version,
                  'Published from brochure studio',
                );
                setMessage(r.message);
                if (r.ok) {
                  setVersion(r.version);
                  router.refresh();
                }
              })
            }
          >
            Publish saved draft
          </button>
        </div>
      </header>
      <div className="brochure-status" role="status">
        {message ||
          validation ||
          'Design in millimetres. Save before preview or export. Publication checks print overflow.'}
        {warnings.length > 0 && (
          <span> {warnings.length} image quality warning(s).</span>
        )}
      </div>
      <div className="brochure-workspace">
        <aside className="brochure-sidebar">
          <div className="brochure-panel-title">
            Pages <span>{d.pages.length}</span>
          </div>
          <div className="brochure-thumbnails">
            {d.pages.map((p, i) => (
              <div
                key={p.id}
                draggable={canEdit}
                onDragStart={(e) =>
                  e.dataTransfer.setData('brochure/page', String(i))
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = e.dataTransfer.getData('brochure/page');
                  if (from !== '') change(movePage(d, Number(from), i));
                }}
              >
                <button
                  className={`brochure-thumb ${i === pageIndex ? 'selected' : ''}`}
                  onClick={() => {
                    setPageIndex(i);
                    setSelection(null);
                  }}
                >
                  <span
                    className="brochure-mini"
                    style={{ height: (height / width) * 142 }}
                  >
                    <span
                      style={{
                        display: 'block',
                        transform: 'scale(' + 142 / (width * px) + ')',
                        transformOrigin: 'top left',
                        width: width * px,
                        pointerEvents: 'none',
                      }}
                      dangerouslySetInnerHTML={{
                        __html: pageHtml(d, i, { assetUrl }),
                      }}
                    />
                  </span>
                  <span>
                    {i + 1}. {p.name}
                  </span>
                </button>
                <div className="brochure-row">
                  <button
                    aria-label={`Move ${p.name} up`}
                    disabled={!canEdit || i === 0}
                    onClick={() => {
                      change(movePage(d, i, i - 1));
                      setPageIndex(Math.max(0, i - 1));
                    }}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${p.name} down`}
                    disabled={!canEdit || i === d.pages.length - 1}
                    onClick={() => {
                      change(movePage(d, i, i + 1));
                      setPageIndex(Math.min(d.pages.length - 1, i + 1));
                    }}
                  >
                    ↓
                  </button>
                  <button
                    disabled={!canEdit}
                    onClick={() => change(duplicatePage(d, i, uid()))}
                  >
                    Copy
                  </button>
                  <button
                    disabled={!canEdit || d.pages.length === 1}
                    onClick={() => {
                      change({
                        ...d,
                        pages: d.pages.filter((_, n) => n !== i),
                      });
                      setPageIndex(Math.max(0, i - 1));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            disabled={!canEdit}
            onClick={() => {
              change({ ...d, pages: [...d.pages, newPage(uid())] });
              setPageIndex(d.pages.length);
            }}
          >
            + Add page
          </button>
          <div className="brochure-panel-title">Components</div>
          <div className="brochure-palette">
            {componentTypes.map((type) => (
              <button
                key={type}
                disabled={!canEdit}
                draggable={canEdit}
                onDragStart={(e) =>
                  e.dataTransfer.setData('brochure/component', type)
                }
                onClick={() => add(type)}
              >
                {type.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
          {kit.blocks.length > 0 && (
            <>
              <div className="brochure-panel-title">Saved blocks</div>
              {kit.blocks.map((b) => (
                <button
                  key={b.id}
                  disabled={!canEdit}
                  onClick={() =>
                    components([
                      ...page.components,
                      ...b.components.map((c) => ({
                        ...structuredClone(c),
                        id: uid(),
                      })),
                    ])
                  }
                >
                  {b.name}
                </button>
              ))}
            </>
          )}
        </aside>
        <section className="brochure-desk" aria-label="Document canvas">
          <div className="brochure-canvas-tools">
            <label>
              Zoom{' '}
              <select
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {[0.25, 0.4, 0.5, 0.65, 0.8, 1, 1.25].map((z) => (
                  <option key={z} value={z}>
                    {Math.round(z * 100)}%
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={grid}
                onChange={(e) => setGrid(e.target.checked)}
              />{' '}
              Grid & guides
            </label>
            <label>
              <input
                type="checkbox"
                checked={snap}
                onChange={(e) => setSnap(e.target.checked)}
              />{' '}
              Snap 5 mm
            </label>
            <span>
              {width} × {height} mm
            </span>
          </div>
          <style>{brochureCss(d)}</style>
          <div className="brochure-canvas-scroll">
            <div
              style={{
                width: width * px * zoom,
                height: height * px * zoom,
                margin: '24px auto',
              }}
            >
              <div
                ref={canvas}
                className="brochure-canvas"
                style={{
                  width: width * px,
                  height: height * px,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const type = e.dataTransfer.getData('brochure/component');
                  if (componentTypes.includes(type as Component['type'])) {
                    const r = canvas.current!.getBoundingClientRect();
                    add(
                      type as Component['type'],
                      (e.clientX - r.left) / zoom / px,
                      (e.clientY - r.top) / zoom / px,
                    );
                  }
                }}
                onClickCapture={(e) => {
                  e.preventDefault();
                  const target = (e.target as HTMLElement).closest<HTMLElement>(
                    '[data-component]',
                  );
                  if (target) setSelection(target.dataset.component ?? null);
                }}
                onPointerDown={(e) => {
                  const target = (e.target as HTMLElement).closest<HTMLElement>(
                    '[data-component]',
                  );
                  const c = page.components.find(
                    (c) => c.id === target?.dataset.component,
                  );
                  if (c) {
                    setSelection(c.id);
                    if (canEdit && !c.locked) {
                      drag.current = {
                        id: c.id,
                        x: c.x,
                        y: c.y,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }
                  }
                }}
                onPointerUp={(e) => {
                  const move = drag.current;
                  drag.current = null;
                  if (!move || !canEdit) return;
                  const c = page.components.find((c) => c.id === move.id);
                  if (!c) return;
                  const dx = (e.clientX - move.clientX) / zoom / px,
                    dy = (e.clientY - move.clientY) / zoom / px;
                  if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
                  let x = move.x + dx,
                    y = move.y + dy;
                  if (snap) {
                    x = Math.round(x / 5) * 5;
                    y = Math.round(y / 5) * 5;
                  }
                  components(
                    page.components.map((n) =>
                      n.id === c.id
                        ? {
                            ...n,
                            x: Math.max(0, Math.min(width - n.width, x)),
                            y: Math.max(0, Math.min(height - n.height, y)),
                          }
                        : n,
                    ),
                  );
                }}
              >
                <div
                  dangerouslySetInnerHTML={{
                    __html: pageHtml(d, pageIndex, { assetUrl }),
                  }}
                />
                {grid && (
                  <>
                    <div className="brochure-grid" />
                    <div
                      className="brochure-guides"
                      style={{ inset: `${d.margin}mm` }}
                    />
                    <div
                      className="brochure-safe"
                      style={{ inset: `${d.safeArea}mm` }}
                    />
                  </>
                )}
                {selected && !selected.hidden && (
                  <div
                    className="brochure-selection"
                    style={{
                      left: `${selected.x}mm`,
                      top: `${selected.y}mm`,
                      width: `${selected.width}mm`,
                      height: `${selected.height}mm`,
                      transform: `rotate(${selected.rotation}deg)`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          <p className="brochure-canvas-caption">
            {page.name} · Drag to move, or use X/Y and size controls. Blue line:
            margin. Dashed line: safe area.
          </p>
        </section>
        <aside className="brochure-inspector">
          <div className="brochure-tabs">
            {(['design', 'document', 'settings'] as const).map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'design' && (
            <>
              {field('Page name', page.name, (v) => pageChange({ name: v }))}
              {field(
                'Page background',
                page.background,
                (v) => pageChange({ background: v }),
                'color',
              )}
              <div className="brochure-row">
                <label>
                  <input
                    type="checkbox"
                    checked={page.showHeader}
                    onChange={(e) =>
                      pageChange({ showHeader: e.target.checked })
                    }
                  />
                  Header
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={page.showFooter}
                    onChange={(e) =>
                      pageChange({ showFooter: e.target.checked })
                    }
                  />
                  Footer
                </label>
              </div>
              <div className="brochure-panel-title">Layers</div>
              <div className="brochure-layers">
                {page.components.map((c) => (
                  <button
                    key={c.id}
                    aria-pressed={c.id === selection}
                    onClick={() => setSelection(c.id)}
                  >
                    {c.hidden ? '◌ ' : c.locked ? '▣ ' : ''}
                    {c.label || c.type}
                  </button>
                ))}
              </div>
              {selected ? (
                <>
                  <div className="brochure-panel-title">
                    {selected.type.replaceAll('_', ' ')}
                  </div>
                  {field('Label', selected.label, (v) => update({ label: v }))}
                  <div className="brochure-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.locked}
                        onChange={(e) =>
                          components(
                            page.components.map((c) =>
                              c.id === selected.id
                                ? { ...c, locked: e.target.checked }
                                : c,
                            ),
                          )
                        }
                      />
                      Locked
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.hidden}
                        onChange={(e) => update({ hidden: e.target.checked })}
                      />
                      Hidden
                    </label>
                  </div>
                  <div className="brochure-property-grid">
                    {(['x', 'y', 'width', 'height', 'rotation'] as const).map(
                      (k) => (
                        <label className="brochure-field" key={k}>
                          {k}
                          {k === 'rotation' ? ' °' : ' mm'}
                          <input
                            type="number"
                            step="0.5"
                            value={selected[k]}
                            disabled={!canEdit || selected.locked}
                            onChange={(e) =>
                              update({ [k]: Number(e.target.value) })
                            }
                          />
                        </label>
                      ),
                    )}
                  </div>
                  <div className="brochure-row">
                    <button onClick={() => update({ x: d.margin })}>
                      Left
                    </button>
                    <button
                      onClick={() =>
                        update({ x: (width - selected.width) / 2 })
                      }
                    >
                      Center
                    </button>
                    <button
                      onClick={() =>
                        update({ x: width - d.margin - selected.width })
                      }
                    >
                      Right
                    </button>
                  </div>
                  <div className="brochure-row">
                    <button
                      onClick={() =>
                        components(layer(page.components, selected.id, 0))
                      }
                    >
                      Back
                    </button>
                    <button
                      onClick={() =>
                        components(
                          layer(
                            page.components,
                            selected.id,
                            page.components.findIndex(
                              (c) => c.id === selected.id,
                            ) - 1,
                          ),
                        )
                      }
                    >
                      ↓
                    </button>
                    <button
                      onClick={() =>
                        components(
                          layer(
                            page.components,
                            selected.id,
                            page.components.findIndex(
                              (c) => c.id === selected.id,
                            ) + 1,
                          ),
                        )
                      }
                    >
                      ↑
                    </button>
                    <button
                      onClick={() =>
                        components(
                          layer(
                            page.components,
                            selected.id,
                            page.components.length - 1,
                          ),
                        )
                      }
                    >
                      Front
                    </button>
                  </div>
                  <label className="brochure-field">
                    Text
                    <textarea
                      value={selected.text}
                      onChange={(e) => update({ text: e.target.value })}
                      rows={4}
                    />
                  </label>
                  <label className="brochure-field">
                    Supporting text
                    <textarea
                      value={selected.subtitle}
                      onChange={(e) => update({ subtitle: e.target.value })}
                      rows={3}
                    />
                  </label>
                  {field('Public link or #page-id', selected.link, (v) =>
                    update({ link: v }),
                  )}
                  <label className="brochure-field">
                    Approved data binding
                    <select
                      value={selected.binding ?? ''}
                      onChange={(e) => {
                        const next = { ...selected };
                        if (e.target.value) next.binding = e.target.value;
                        else delete next.binding;
                        components(
                          page.components.map((c) =>
                            c.id === next.id ? next : c,
                          ),
                        );
                      }}
                    >
                      <option value="">Custom content</option>
                      <option value="business">Business name</option>
                      <option value="tagline">Brand tagline</option>
                      <option value="contact">Brand contact details</option>
                      <option value="logo">Brand logo</option>
                      {kit.content
                        .filter((c) => c.public)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.kind}: {c.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="brochure-field">
                    Image
                    <select
                      value={selected.asset ?? ''}
                      onChange={(e) => {
                        const next = { ...selected };
                        if (e.target.value) next.asset = e.target.value;
                        else delete next.asset;
                        components(
                          page.components.map((c) =>
                            c.id === next.id ? next : c,
                          ),
                        );
                      }}
                    >
                      <option value="">No image</option>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {moreAssets && (
                    <button
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          try {
                            const next = await brochureAssetPage(assetPage + 1);
                            setAssets((current) => [
                              ...current,
                              ...next.filter(
                                (a) => !current.some((x) => x.id === a.id),
                              ),
                            ]);
                            setAssetPage((p) => p + 1);
                            setMoreAssets(next.length === 25);
                          } catch {
                            setMessage(
                              'Unable to load more images. Check media access.',
                            );
                          }
                        })
                      }
                    >
                      Load more images
                    </button>
                  )}
                  {field('Image alt text', selected.alt, (v) =>
                    update({ alt: v }),
                  )}
                  <label className="brochure-field">
                    Fit
                    <select
                      value={selected.fit}
                      onChange={(e) =>
                        update({ fit: e.target.value as Component['fit'] })
                      }
                    >
                      <option>cover</option>
                      <option>contain</option>
                    </select>
                  </label>
                  <div className="brochure-property-grid">
                    {(['focalX', 'focalY', 'columns'] as const).map((k) => (
                      <label key={k} className="brochure-field">
                        {k}
                        <input
                          type="number"
                          value={selected[k]}
                          onChange={(e) =>
                            update({ [k]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {[
                    'gallery',
                    'image_grid',
                    'room_gallery',
                    'before_after',
                  ].includes(selected.type) && (
                    <fieldset>
                      <legend>Gallery images</legend>
                      {assets.map((a) => (
                        <label className="brochure-check" key={a.id}>
                          <input
                            type="checkbox"
                            checked={selected.assets.includes(a.id)}
                            onChange={(e) =>
                              update({
                                assets: e.target.checked
                                  ? [...selected.assets, a.id]
                                  : selected.assets.filter((id) => id !== a.id),
                              })
                            }
                          />
                          {a.name}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {[
                    'table',
                    'faq',
                    'timeline',
                    'process',
                    'social',
                    'stats',
                  ].includes(selected.type) && (
                    <label className="brochure-field">
                      Rows (one per line; separate cells with |)
                      <textarea
                        rows={6}
                        value={selected.rows
                          .map((r) => r.join(' | '))
                          .join('\n')}
                        onChange={(e) =>
                          update({
                            rows: e.target.value
                              .split('\n')
                              .map((r) => r.split('|').map((s) => s.trim())),
                          })
                        }
                      />
                    </label>
                  )}
                  <div className="brochure-panel-title">
                    Typography & appearance
                  </div>
                  <label className="brochure-field">
                    Font
                    <select
                      value={selected.style.font}
                      onChange={(e) =>
                        style({
                          font: e.target.value as Component['style']['font'],
                        })
                      }
                    >
                      {fonts.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                  <div className="brochure-property-grid">
                    {(
                      [
                        'size',
                        'lineHeight',
                        'letterSpacing',
                        'paragraphSpacing',
                        'padding',
                        'radius',
                        'borderWidth',
                        'opacity',
                      ] as const
                    ).map((k) => (
                      <label className="brochure-field" key={k}>
                        {k}
                        <input
                          type="number"
                          step="0.1"
                          value={selected.style[k]}
                          onChange={(e) =>
                            style({ [k]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="brochure-field">
                    Weight
                    <select
                      value={selected.style.weight}
                      onChange={(e) =>
                        style({ weight: e.target.value as 'normal' | 'bold' })
                      }
                    >
                      <option>normal</option>
                      <option>bold</option>
                    </select>
                  </label>
                  <label className="brochure-field">
                    Alignment
                    <select
                      value={selected.style.align}
                      onChange={(e) =>
                        style({
                          align: e.target.value as Component['style']['align'],
                        })
                      }
                    >
                      {['left', 'center', 'right', 'justify'].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label className="brochure-field">
                    Text case
                    <select
                      value={selected.style.transform}
                      onChange={(e) =>
                        style({
                          transform: e.target
                            .value as Component['style']['transform'],
                        })
                      }
                    >
                      {['none', 'uppercase', 'lowercase', 'capitalize'].map(
                        (x) => (
                          <option key={x}>{x}</option>
                        ),
                      )}
                    </select>
                  </label>
                  {(['color', 'background', 'border'] as const).map((k) => (
                    <label className="brochure-field" key={k}>
                      {k}
                      <input
                        type="color"
                        value={
                          selected.style[k] ??
                          (k === 'color' ? d.theme.text : d.theme.surface)
                        }
                        onChange={(e) => style({ [k]: e.target.value })}
                      />
                    </label>
                  ))}
                  <div className="brochure-row">
                    <button
                      onClick={() => {
                        const c = {
                          ...structuredClone(selected),
                          id: uid(),
                          locked: false,
                        };
                        components([...page.components, c]);
                        setSelection(c.id);
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      disabled={selected.locked}
                      onClick={() => {
                        components(
                          page.components.filter((c) => c.id !== selected.id),
                        );
                        setSelection(null);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() =>
                        start(async () =>
                          setMessage(
                            (
                              await saveBrochureBlock(
                                selected.label || selected.type,
                                [selected],
                              )
                            ).message,
                          ),
                        )
                      }
                    >
                      Save block
                    </button>
                  </div>
                </>
              ) : (
                <p className="brochure-muted">
                  Select a component to edit its layout and appearance.
                </p>
              )}
            </>
          )}
          {tab === 'document' && (
            <>
              {field('Brochure title', d.title, (v) =>
                change({ ...d, title: v }),
              )}
              {field('Brochure type', d.type, (v) => change({ ...d, type: v }))}
              <label className="brochure-field">
                Page format
                <select
                  value={d.format}
                  onChange={(e) =>
                    change({
                      ...d,
                      format: e.target.value as BrochureDocument['format'],
                    })
                  }
                >
                  {[...Object.keys(formats), 'Custom'].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              {(
                ['width', 'height', 'margin', 'safeArea', 'bleed'] as const
              ).map((k) => (
                <label className="brochure-field" key={k}>
                  {k} (mm)
                  <input
                    type="number"
                    value={d[k]}
                    onChange={(e) =>
                      change({ ...d, [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
              {field('Header', d.header, (v) => change({ ...d, header: v }))}
              {field('Footer', d.footer, (v) => change({ ...d, footer: v }))}
              <label className="brochure-check">
                <input
                  type="checkbox"
                  checked={d.numbering.enabled}
                  onChange={(e) =>
                    change({
                      ...d,
                      numbering: { ...d.numbering, enabled: e.target.checked },
                    })
                  }
                />
                Page numbers
              </label>
              <label className="brochure-check">
                <input
                  type="checkbox"
                  checked={d.numbering.hideCover}
                  onChange={(e) =>
                    change({
                      ...d,
                      numbering: {
                        ...d.numbering,
                        hideCover: e.target.checked,
                      },
                    })
                  }
                />
                Hide cover number
              </label>
              {field(
                'Starting number',
                d.numbering.start,
                (v) =>
                  change({
                    ...d,
                    numbering: { ...d.numbering, start: Number(v) },
                  }),
                'number',
              )}
              <label className="brochure-field">
                Number position
                <select
                  value={d.numbering.position}
                  onChange={(e) =>
                    change({
                      ...d,
                      numbering: {
                        ...d.numbering,
                        position: e.target.value as 'left' | 'center' | 'right',
                      },
                    })
                  }
                >
                  {['left', 'center', 'right'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <div className="brochure-panel-title">Design tokens</div>
              {(
                [
                  'primary',
                  'secondary',
                  'accent',
                  'background',
                  'surface',
                  'text',
                  'muted',
                  'border',
                ] as const
              ).map((k) => (
                <label className="brochure-field" key={k}>
                  {k}
                  <input
                    type="color"
                    value={d.theme[k]}
                    onChange={(e) =>
                      change({
                        ...d,
                        theme: { ...d.theme, [k]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
              {(['headingFont', 'bodyFont'] as const).map((k) => (
                <label className="brochure-field" key={k}>
                  {k}
                  <select
                    value={d.theme[k]}
                    onChange={(e) =>
                      change({
                        ...d,
                        theme: { ...d.theme, [k]: e.target.value },
                      })
                    }
                  >
                    {fonts.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
              ))}
              <button onClick={() => change({ ...d, theme: kit.brand.theme })}>
                Apply brand theme
              </button>
              <button
                onClick={() =>
                  start(async () =>
                    setMessage(
                      (await saveBrochureBlock(page.name, page.components))
                        .message,
                    ),
                  )
                }
              >
                Save page as reusable block
              </button>
            </>
          )}
          {tab === 'settings' && (
            <>
              {(['sharing', 'download', 'index'] as const).map((k) => (
                <label className="brochure-check" key={k}>
                  <input
                    type="checkbox"
                    checked={d.settings[k]}
                    onChange={(e) =>
                      change({
                        ...d,
                        settings: { ...d.settings, [k]: e.target.checked },
                      })
                    }
                  />
                  {k === 'sharing'
                    ? 'Public sharing'
                    : k === 'download'
                      ? 'Allow PDF download'
                      : 'Allow search indexing'}
                </label>
              ))}
              {(
                [
                  'seoTitle',
                  'seoDescription',
                  'canonical',
                  'watermark',
                  'contactLabel',
                  'contactLink',
                ] as const
              ).map((k) => (
                <label className="brochure-field" key={k}>
                  {k}
                  <input
                    value={d.settings[k]}
                    onChange={(e) =>
                      change({
                        ...d,
                        settings: { ...d.settings, [k]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
              <label className="brochure-check">
                <input
                  type="checkbox"
                  checked={d.form.enabled}
                  onChange={(e) =>
                    change({
                      ...d,
                      form: { ...d.form, enabled: e.target.checked },
                    })
                  }
                />
                Enable CRM consultation form
              </label>
              {field('Form title', d.form.label, (v) =>
                change({ ...d, form: { ...d.form, label: v } }),
              )}
              {field('Confirmation message', d.form.confirmation, (v) =>
                change({ ...d, form: { ...d.form, confirmation: v } }),
              )}
              <p className="brochure-muted">
                Name, phone and consent are required.
              </p>
              {(
                [
                  'email',
                  'requirement',
                  'location',
                  'budget',
                  'message',
                ] as const
              ).map((k) => (
                <label className="brochure-check" key={k}>
                  <input
                    type="checkbox"
                    checked={d.form.fields.includes(k)}
                    onChange={(e) =>
                      change({
                        ...d,
                        form: {
                          ...d.form,
                          fields: e.target.checked
                            ? [...d.form.fields, k]
                            : d.form.fields.filter((f) => f !== k),
                        },
                      })
                    }
                  />
                  {k}
                </label>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
