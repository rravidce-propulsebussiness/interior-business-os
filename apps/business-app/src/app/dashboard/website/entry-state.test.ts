import { describe, expect, it } from 'vitest';
import { emptyWebsite, createNode } from '@business-os/website-builder';
import { compileWebsite } from '@business-os/website-builder/compiler';
import { renderWebsite } from '@business-os/website-builder/render';
import { isUnconfiguredWebsite } from './entry-state';

describe('website landing workflow', () => {
  it('shows template selection only for a truly empty unpublished website', () => {
    const doc = emptyWebsite('Neelima');
    expect(isUnconfiguredWebsite(doc, false)).toBe(true);
    expect(isUnconfiguredWebsite(doc, true)).toBe(false);
    doc.pages.push({ id: 'another', title: 'New page', path: '/page-2',
      visibility: 'draft', seo: { title: 'New page', description: '', noindex: true }, nodes: [] });
    expect(isUnconfiguredWebsite(doc, false)).toBe(true);
    doc.pages[0]!.nodes = [createNode('hero', 'hero')];
    expect(isUnconfiguredWebsite(doc, false)).toBe(false);
  });

  it('does not replace a website that already has any authored content', () => {
    const doc = emptyWebsite('Neelima');
    doc.code.push({ id:'component', name:'My component', html:'<h1>Hi</h1>', css:'', javascript:'' });
    expect(isUnconfiguredWebsite(doc,false)).toBe(false);
    doc.code = [];
    doc.header = [createNode('navigation','nav')];
    expect(isUnconfiguredWebsite(doc,false)).toBe(false);
  });

  it('does not repeat the business name as a giant default footer on blank pages', () => {
    const doc = emptyWebsite('Neelima');
    const render = renderWebsite(compileWebsite(doc), '/');
    expect(render).not.toBeNull();
    expect(render!.body.match(/Neelima/g)?.length).toBe(1);
    expect(render!.body).not.toContain('<footer class="website-section"');
  });

  it('still renders contact details when a business configures them', () => {
    const doc = emptyWebsite('Neelima');
    doc.settings.address = 'Hyderabad';
    const render = renderWebsite(compileWebsite(doc), '/');
    expect(render!.body).toContain('Hyderabad');
    expect(render!.body).not.toContain('<h2>Neelima</h2>');
  });
});
