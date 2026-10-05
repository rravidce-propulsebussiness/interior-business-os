import {
  createComponent,
  pageSchema,
  type BrochureDocument,
  type Component,
} from './model';
export interface History {
  past: BrochureDocument[];
  present: BrochureDocument;
  future: BrochureDocument[];
}
export function edit(h: History, d: BrochureDocument): History {
  return { past: [...h.past, h.present].slice(-50), present: d, future: [] };
}
export function undo(h: History): History {
  const last = h.past.at(-1);
  return last
    ? {
        past: h.past.slice(0, -1),
        present: last,
        future: [h.present, ...h.future],
      }
    : h;
}
export function redo(h: History): History {
  const next = h.future[0];
  return next
    ? { past: [...h.past, h.present], present: next, future: h.future.slice(1) }
    : h;
}
export function movePage(
  d: BrochureDocument,
  from: number,
  to: number,
): BrochureDocument {
  if (from < 0 || to < 0 || from >= d.pages.length || to >= d.pages.length)
    return d;
  const next = structuredClone(d);
  const [p] = next.pages.splice(from, 1);
  if (p) next.pages.splice(to, 0, p);
  return next;
}
export function duplicatePage(
  d: BrochureDocument,
  index: number,
  id: string,
): BrochureDocument {
  const p = d.pages[index];
  if (!p) return d;
  return {
    ...d,
    pages: d.pages.flatMap((page, i) =>
      i === index
        ? [page, { ...structuredClone(page), id, name: `${page.name} copy` }]
        : [page],
    ),
  };
}
export function newPage(id: string) {
  return pageSchema.parse({ id, name: 'New page', components: [] });
}
export function place(
  type: Component['type'],
  id: string,
  x: number,
  y: number,
  snap = 0,
) {
  const c = createComponent(type, id);
  c.x = Math.max(0, snap ? Math.round(x / snap) * snap : x);
  c.y = Math.max(0, snap ? Math.round(y / snap) * snap : y);
  return c;
}
export function layer(nodes: Component[], id: string, to: number) {
  const next = [...nodes];
  const i = next.findIndex((n) => n.id === id);
  if (i < 0 || next[i]?.locked) return nodes;
  const [n] = next.splice(i, 1);
  if (n) next.splice(Math.max(0, Math.min(to, next.length)), 0, n);
  return next;
}
