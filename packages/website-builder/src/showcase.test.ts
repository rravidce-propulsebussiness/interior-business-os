import { describe, expect, it } from 'vitest';
import { starterTemplate } from './templates';
import { validateDocument } from './model';
import { compileWebsite } from './compiler';
import { websiteHtml } from './render';

describe('Business Showcase multi-page template', () => {
  const doc = starterTemplate('Example Construction', 'showcase');

  it('creates complete editable pages with linked navigation and footer', () => {
    expect(doc.pages.map(page => page.path)).toEqual([
      '/', '/about', '/services', '/projects', '/packages', '/contact',
    ]);
    for (const link of [...doc.navigation,...doc.footerNavigation])
      expect(doc.pages.some(page => page.path === link.href)).toBe(true);
    expect(doc.pages.every(page => page.nodes.length > 0)).toBe(true);
    expect(doc.footerNavigation.length).toBeGreaterThan(0);
    expect(validateDocument(doc, true)).toBeTruthy();
  });

  it('renders each page independently with a shared business header and footer', () => {
    const build = compileWebsite(doc);
    for (const path of ['/', '/about', '/services', '/projects', '/packages', '/contact']) {
      const html = websiteHtml(build, path);
      expect(html).toContain('Example Construction');
      expect(html).toContain('href="/contact"');
      expect(html).toContain('website-section');
    }
  });

  it('supports per-text font selections in the schema', () => {
    const copy = structuredClone(doc);
    copy.pages[0]!.nodes[0]!.style.fontFamily = 'serif';
    copy.pages[0]!.nodes[0]!.style.fontSize = 44;
    expect(validateDocument(copy).pages[0]!.nodes[0]!.style.fontSize).toBe(44);
  });
});
