import { createNode, type WebsiteNode, type ComponentType } from './model';
export function locateNode(
  nodes: WebsiteNode[],
  id: string,
): WebsiteNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const child = locateNode(n.children, id);
    if (child) return child;
  }
  return undefined;
}
export function removeNode(nodes: WebsiteNode[], id: string): WebsiteNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }));
}
export function duplicateNode(
  node: WebsiteNode,
  id: () => string,
): WebsiteNode {
  return {
    ...structuredClone(node),
    id: id(),
    children: node.children.map((n) => duplicateNode(n, id)),
  };
}
export function moveNode(
  nodes: WebsiteNode[],
  id: string,
  parent: string | null,
  index: number,
): WebsiteNode[] {
  const node = locateNode(nodes, id);
  if (!node) throw new Error('Component unavailable');
  if (parent && (parent === id || locateNode(node.children, parent)))
    throw new Error('Cannot move a component inside itself');
  const next = removeNode(nodes, id);
  const target = parent ? locateNode(next, parent)?.children : next;
  if (!target) throw new Error('Container unavailable');
  target.splice(
    Math.max(0, Math.min(target.length, index)),
    0,
    structuredClone(node),
  );
  return next;
}
export function insertNode(
  nodes: WebsiteNode[],
  type: ComponentType,
  id: string,
  parent: string | null = null,
): WebsiteNode[] {
  const next = structuredClone(nodes);
  const target = parent ? locateNode(next, parent)?.children : next;
  if (!target) throw new Error('Container unavailable');
  target.push(createNode(type, id));
  return next;
}
export type History<T> = { past: T[]; present: T; future: T[] };
export function editHistory<T>(history: History<T>, value: T): History<T> {
  return {
    past: [...history.past, history.present].slice(-50),
    present: value,
    future: [],
  };
}
export function undoHistory<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past.at(-1)!,
    future: [history.present, ...history.future],
  };
}
export function redoHistory<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0]!,
    future: history.future.slice(1),
  };
}
