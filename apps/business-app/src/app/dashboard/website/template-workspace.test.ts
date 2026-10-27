import { describe, expect, it } from 'vitest';
import { emptyWebsite } from '@business-os/website-builder';
import { applyTemplateDraft, templatePages, templateSources } from './template-workspace';

const codeId = 'n123456789abcdef0123456789abcdef0';
const component = { id: codeId, name: 'components/hero',
  html: '<section>Hello</section>', css: '', javascript: '' };

describe('unified template editor', () => {
  it('sends only CSS and code to the file editor and summarizes visual pages', () => {
    const site = emptyWebsite('Company');
    site.pages[0]!.nodes.push({
      id: 'hero', type: 'hero', props: { title: 'Test' },
      style: {}, tablet: {}, mobile: {}, children: [],
    });
    const sources = templateSources(site);
    expect(Object.keys(sources).sort()).toEqual(['code', 'css']);
    expect(templatePages(site)).toEqual([{
      id: 'home', path: '/', title: 'Home',
      visibility: 'public', codeId: null,
    }]);
    const result = applyTemplateDraft(site, { ...sources, newPageCodeIds: [] });
    expect(result.pages).toEqual(site.pages);
  });

  it('edits source files without overwriting the visual page tree', () => {
    const site = emptyWebsite('Demo');
    site.code = [component];
    const result = applyTemplateDraft(site, {
      ...templateSources(site), code: [{ ...component, html: '<h1>Changed</h1>' }],
      newPageCodeIds: [],
    });
    expect(result.pages).toEqual(site.pages);
    expect(result.code[0]?.html).toBe('<h1>Changed</h1>');
  });

  it('creates a new routed HTML page only when requested explicitly', () => {
    const site = emptyWebsite('Demo');
    const file = { ...component, name: 'pages/services.html' };
    const doc = applyTemplateDraft(site, {
      css: '', code: [file], newPageCodeIds: [codeId],
    });
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[1]!.path).toBe('/services');
    expect(doc.pages[1]!.nodes[0]!.props.code).toBe(codeId);
    expect(templatePages(doc)[1]!.codeId).toBe(codeId);
    expect(() => applyTemplateDraft(site, {
      css: '', code: [file], newPageCodeIds: [],
    })).toThrow(/declaration/);
  });

  it('never replaces existing template pages with uploaded source', () => {
    const site = emptyWebsite('Demo');
    const file = { ...component, name: 'pages/index.html' };
    expect(() => applyTemplateDraft(site, {
      css: '', code: [file], newPageCodeIds: [codeId],
    })).toThrow(/already uses/);
  });

  it('rejects deleting files still referenced by website pages', () => {
    const site = emptyWebsite('Demo');
    site.code = [component];
    site.pages[0]!.nodes.push({
      id: 'customnode', type: 'custom', props: { code: codeId },
      style: {}, tablet: {}, mobile: {}, children: [],
    });
    expect(() => applyTemplateDraft(site, {
      css: '', code: [], newPageCodeIds: [],
    })).toThrow(/in use/);
  });

  it('rejects duplicate code identifiers and page declarations', () => {
    const site = emptyWebsite('Demo');
    expect(() => applyTemplateDraft(site, {
      css: '', code: [component, component], newPageCodeIds: [],
    })).toThrow(/Duplicate component/);
    expect(() => applyTemplateDraft(site, {
      css: '', code: [component], newPageCodeIds: [codeId, codeId],
    })).toThrow(/Duplicate requested/);
  });
});
