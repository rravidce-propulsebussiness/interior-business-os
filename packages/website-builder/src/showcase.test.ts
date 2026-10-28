import { describe, expect, it } from 'vitest';
import { starterTemplate } from './templates';
import { validateDocument } from './model';
import { compileWebsite } from './compiler';
import { websiteHtml } from './render';

describe('Business Showcase multi-page template', () => {
  const doc = starterTemplate('Example Construction', 'showcase');

  it.each(['construction','services','showcase'] as const)(
    '%s starter includes all six business pages rather than a blank one-page site',
    kind => {
      const site=starterTemplate('Test Company',kind);
      expect(site.pages.map(page=>page.path)).toEqual([
        '/','/about','/services','/projects','/packages','/contact',
      ]);
      expect(site.pages.every(page=>page.nodes.length>0)).toBe(true);
    },
  );

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

  it('includes finished package tiers and multiple service and portfolio cards', () => {
    const home=doc.pages.find(page=>page.path==='/')!;
    const packages=doc.pages.find(page=>page.path==='/packages')!;
    const grid=packages.nodes.find(node=>node.type==='grid')!;
    expect(grid.children.map(card=>card.props.title)).toEqual([
      'Standard','Premium','Elite',
    ]);
    expect(home.nodes.some(node=>node.type==='grid')).toBe(true);
    expect(doc.content.filter(item=>item.kind==='services')).toHaveLength(6);
    expect(doc.content.filter(item=>item.kind==='projects')).toHaveLength(3);
    expect(doc.navigation.map(link=>link.href)).toContain('/packages');
    const html=websiteHtml(compileWebsite(doc),'/packages')!;
    expect(html).toContain('Elite');
    expect(html).toContain('Premium');
    expect(html).toContain('Request package details');
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
