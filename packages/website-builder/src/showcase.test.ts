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

  it('lets the editor edit project and service card content, including photos', () => {
    const html = websiteHtml(compileWebsite(doc), '/', { preview:true })!;
    expect(html).toContain('data-website-content-id="showcaseServiceConstruction"');
    expect(html).toContain('data-website-content-field="title"');
    expect(html).toContain('data-website-add-photo');
    expect(html).toContain('website.replace-content-image');
    expect(html).toContain('website.inline-content-text');
    const publicHtml = websiteHtml(compileWebsite(doc), '/')!;
    expect(publicHtml).not.toContain('data-website-add-photo');
  });

  it('supports per-text font selections in the schema', () => {
    const copy = structuredClone(doc);
    copy.pages[0]!.nodes[0]!.style.fontFamily = 'serif';
    copy.pages[0]!.nodes[0]!.style.fontSize = 44;
    expect(validateDocument(copy).pages[0]!.nodes[0]!.style.fontSize).toBe(44);
    const rendered = websiteHtml(compileWebsite(copy), '/')!;
    expect(rendered).toContain('font-family:serif');
    expect(rendered).toContain('#showcaseHero>h1');
    expect(rendered).toContain('font-size:44px');
  });
});
