import { describe, expect, it } from 'vitest';
import { emptyWebsite, validateDocument } from '@business-os/website-builder';
import { compileWebsite } from '@business-os/website-builder/compiler';
import {
  workspaceFiles,
  changeSourceFile,
  newSourceComponent,
  renameSourceComponent,
  removeSourceComponent,
} from './file-workspace';

describe('website developer virtual files', () => {
  const id = 'n123456789abcdef0123456789abcdef0';
  it('represents existing website styles and custom components as separate files', () => {
    const site = newSourceComponent(
      emptyWebsite('Demo'),
      'components',
      'Hero',
      id,
    );
    expect(workspaceFiles(site).map((f) => f.path)).toEqual([
      'styles/global.css',
      'components/hero/index.html',
      'styles/components/hero.css',
      'scripts/components/hero.js',
    ]);
    const file = workspaceFiles(site).find(
      (f) => f.key === id + ':javascript',
    )!;
    const updated = changeSourceFile(
      site,
      file,
      'document.querySelector("h1");',
    );
    expect(updated.code[0]!.javascript).toContain('querySelector');
    expect(updated.code[0]!.html).toBe(site.code[0]!.html);
    expect(site.code[0]!.javascript).toBe('');
  });
  it('connects new code pages to the original website publishing model', () => {
    const site = newSourceComponent(emptyWebsite('Demo'), 'pages', 'index', id);
    expect(site.pages).toHaveLength(1);
    expect(site.pages[0]!.nodes[0]!.props.code).toBe(id);
    const html = workspaceFiles(site).find(
      (f) => f.path === 'pages/index.html',
    );
    expect(html).toBeDefined();
    expect(validateDocument(site).pages[0]!.path).toBe('/');
    expect(compileWebsite(site).artifacts.some((art) => art.id === id)).toBe(
      true,
    );
  });
  it('cannot replace populated visual template pages silently', () => {
    const site = emptyWebsite('Demo');
    site.pages[0]!.nodes.push({
      id: 'hero',
      type: 'hero',
      props: { title: 'Existing' },
      style: {},
      tablet: {},
      mobile: {},
      children: [],
    });
    expect(() => newSourceComponent(site, 'pages', 'index', id)).toThrow(
      /visual content/,
    );
  });
  it('prevents deleting components referenced by a page', () => {
    const site = newSourceComponent(emptyWebsite('Demo'), 'pages', 'index', id);
    expect(() => removeSourceComponent(site, id)).toThrow(/used by a page/);
    const component = newSourceComponent(
      emptyWebsite('Demo'),
      'components',
      'Hero',
      id,
    );
    expect(removeSourceComponent(component, id).code).toHaveLength(0);
    expect(
      renameSourceComponent(component, id, 'Alternate').code[0]!.name,
    ).toBe('components/alternate');
  });
  it('keeps code and page limits and source file boundaries', () => {
    const site = newSourceComponent(
      emptyWebsite('Demo'),
      'components',
      'Hero',
      id,
    );
    const html = workspaceFiles(site)[1]!;
    expect(() => changeSourceFile(site, html, 'x'.repeat(50001))).toThrow(
      /50,000/,
    );
    expect(() => renameSourceComponent(site, 'missing', 'New')).toThrow(
      /not found/,
    );
  });
});
