import type { WebsiteDocument, WebsiteNode } from '@business-os/website-builder';
import { validateDocument } from '@business-os/website-builder';

export type TemplateSources = Pick<WebsiteDocument, 'css' | 'code'>;
export type TemplatePage = {
  id: string; path: string; title: string; visibility: 'public' | 'draft';
  codeId: string | null;
};
export type TemplateDraft = TemplateSources & { newPageCodeIds: string[] };

const pageName = /^pages\/([a-z0-9]+(?:-[a-z0-9]+)*)\.html$/;
const componentName = /^components\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
export const fileSlug = (value: string) => value.toLowerCase().trim()
  .replace(/\.(html|css|js)$/i, '').replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 48);

export function templatePages(doc: WebsiteDocument): TemplatePage[] {
  return doc.pages.map(page => {
    // Only a page entirely backed by a custom component is editable as HTML;
    // mixed visual layouts are never overwritten by this editor.
    const node = page.nodes.length === 1 ? page.nodes[0] : undefined;
    const component = node?.type === 'custom'
      ? doc.code.find(item => item.id === node.props.code) : undefined;
    return {
      id: page.id, path: page.path, title: page.title, visibility: page.visibility,
      codeId: component?.name.startsWith('pages/') ? component.id : null,
    };
  });
}
export function templateSources(doc: WebsiteDocument): TemplateSources {
  return { css: doc.css, code: doc.code };
}

function references(doc: WebsiteDocument, codeId: string): boolean {
  const walk = (nodes: WebsiteNode[]): boolean =>
    nodes.some(n => (n.type === 'custom' && n.props.code === codeId) || walk(n.children));
  return doc.pages.some(page => walk(page.nodes))
    || walk(doc.header) || walk(doc.footer)
    || doc.sections.some(section => walk([section.node]));
}

/** Merge only source code and new page declarations into the original
 * authoritative document. Never accept arbitrary client page trees or
 * replace visual-template nodes. */
export function applyTemplateDraft(site: WebsiteDocument, input: TemplateDraft): WebsiteDocument {
  if (typeof input.css !== 'string' || !Array.isArray(input.code) ||
      !Array.isArray(input.newPageCodeIds))
    throw new Error('Invalid template files');
  if (new Set(input.newPageCodeIds).size !== input.newPageCodeIds.length)
    throw new Error('Duplicate requested pages');
  if (input.code.length > 30 || input.newPageCodeIds.length > 30)
    throw new Error('Template component limit reached');
  const previous = new Map(site.code.map(c => [c.id, c]));
  const upcoming = new Map(input.code.map(c => [c.id, c]));
  if (upcoming.size !== input.code.length) throw new Error('Duplicate component identifier');
  const newIds = new Set(input.newPageCodeIds);
  const pages = [...site.pages];
  const names = new Set<string>();
  for (const item of input.code) {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string')
      throw new Error('Invalid component');
    if (names.has(item.name)) throw new Error('Duplicate component name');
    names.add(item.name);
    const existed = previous.get(item.id);
    if (existed) {
      if (newIds.has(item.id)) throw new Error('Page is already saved');
      if (existed.name.startsWith('pages/') && existed.name !== item.name)
        throw new Error('Change page URLs in page settings');
      if (!existed.name.startsWith('pages/') && !componentName.test(item.name) &&
          existed.name !== item.name)
        throw new Error('Choose a valid component name');
    } else if (pageName.test(item.name)) {
      if (!newIds.has(item.id)) throw new Error('Page declaration missing');
      const name = pageName.exec(item.name)![1]!;
      const path = name === 'index' ? '/' : '/' + name;
      if (pages.some(p => p.path === path))
        throw new Error('A website page already uses ' + path + '. Open it from Pages instead.');
      if (pages.length >= 200) throw new Error('Website page limit reached');
      pages.push({
        id: 'p' + item.id.slice(1, 17), path, title: name.replaceAll('-', ' '),
        visibility: 'public', seo: { title: name.replaceAll('-', ' '), description: '', noindex: true },
        nodes: [{
          id: 'n' + item.id.slice(1, 17), type: 'custom',
          props: { code: item.id }, children: [], style: {}, tablet: {}, mobile: {},
        }],
      });
    } else if (!componentName.test(item.name)) {
      throw new Error('Files must belong to pages/ or components/');
    }
  }
  for (const id of newIds) if (!upcoming.has(id))
    throw new Error('Missing new page component');
  for (const original of site.code) {
    if (!upcoming.has(original.id)) {
      if (original.name.startsWith('pages/') || references(site, original.id))
        throw new Error('This component is in use. Remove it from the page first.');
    }
  }
  return validateDocument({ ...site, css: input.css, code: input.code, pages });
}
