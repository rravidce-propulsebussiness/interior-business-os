import type { WebsiteDocument, WebsiteNode } from '@business-os/website-builder';
import { editableContentFields } from './website-content-fields';

export const fixedTemplateSections = ['assets', 'content', 'pages', 'header', 'footer'] as const;
export type FixedTemplateSection = (typeof fixedTemplateSections)[number];

function readonlyNodeShape(node: WebsiteNode): unknown {
  const props: Record<string, unknown> = { ...node.props };
  for (const field of editableContentFields(node)) delete props[field.key];
  if (node.type === 'image' || node.type === 'hero' || node.type === 'logo' ||
    node.props.asset !== undefined) delete props.asset;
  return {
    ...node,
    props,
    children: node.children.map(readonlyNodeShape),
  };
}
function readonlyContentShape(item: WebsiteDocument['content'][number]) {
  const readonly: Record<string, unknown> = { ...item };
  delete readonly.title;
  delete readonly.text;
  delete readonly.image;
  return readonly;
}

/** Owners can change copy and asset references, not page routes, node order,
 * theme, styles, component types, data bindings, forms or layout structure. */
export function preservesFixedTemplate(
  original: WebsiteDocument,
  proposed: WebsiteDocument,
  section: FixedTemplateSection,
): boolean {
  if (section === 'assets') {
    return proposed.assets.length >= original.assets.length &&
      original.assets.every((asset, index) =>
        JSON.stringify(asset) === JSON.stringify(proposed.assets[index]));
  }
  if (section === 'content') {
    return JSON.stringify(original.content.map(readonlyContentShape)) ===
      JSON.stringify(proposed.content.map(readonlyContentShape));
  }
  if (section === 'header' || section === 'footer') {
    return JSON.stringify(original[section].map(readonlyNodeShape)) ===
      JSON.stringify(proposed[section].map(readonlyNodeShape));
  }
  const readonlyPage = (page: WebsiteDocument['pages'][number]) => ({
    ...page,
    nodes: page.nodes.map(readonlyNodeShape),
  });
  return JSON.stringify(original.pages.map(readonlyPage)) ===
    JSON.stringify(proposed.pages.map(readonlyPage));
}
