import type { WebsiteDocument, WebsiteNode } from '@business-os/website-builder';

/**
 * Return draft pages that are reachable from the site's published header,
 * footer, navigation, and public page content. Do not expose unrelated drafts.
 * Run again on the server before modifying a draft because clients may be stale.
 */
export function linkedDraftPagesForPublication(document: WebsiteDocument): string[] {
  const publicPaths = new Set(document.pages.filter(p => p.visibility === 'public').map(p => p.path));
  const pages = new Map(document.pages.map(p => [p.path, p]));
  const linked = new Set<string>();
  const addHref = (href?: string) => {
    if (!href?.startsWith('/')) return;
    const path = href.split('#')[0]!.split('?')[0]!;
    if (pages.has(path)) linked.add(path);
  };
  const walk = (nodes: WebsiteNode[]) => {
    for (const node of nodes) {
      addHref(node.props.href);
      walk(node.children);
    }
  };
  for (const item of [...document.navigation, ...document.footerNavigation]) {
    addHref(item.href);
    for (const child of item.children) addHref(child.href);
  }
  walk(document.header);
  walk(document.footer);

  // The newly linked pages can themselves link to other draft pages.
  // Traverse them until no additional route is required.
  const visited = new Set<string>();
  while (true) {
    const next = [...new Set([...publicPaths, ...linked])].find(path => !visited.has(path));
    if (!next) break;
    visited.add(next);
    const page = pages.get(next);
    if (page) walk(page.nodes);
  }
  return document.pages.filter(p => p.visibility !== 'public' && linked.has(p.path)).map(p => p.path);
}
