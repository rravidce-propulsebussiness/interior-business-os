import type { WebsiteDocument } from '@business-os/website-builder';

/** Only a genuinely unused, unpublished draft can be assigned a starter.
 * The editor must never silently replace user-authored content or a live site.
 */
export function isUnconfiguredWebsite(doc: WebsiteDocument, published: boolean): boolean {
  return !published && !doc.pages.some(page => page.nodes.length > 0)
    && doc.code.length === 0 && doc.header.length === 0 && doc.footer.length === 0
    && doc.content.length === 0 && doc.sections.length === 0
    && doc.assets.length === 0 && doc.css.trim().length === 0;
}
