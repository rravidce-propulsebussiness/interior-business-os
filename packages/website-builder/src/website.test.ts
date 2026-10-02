import { describe, it, expect } from 'vitest';
import { emptyWebsite, createNode, validateDocument, safeUrl } from './model';
import {
  compileWebsite,
  sanitizeHtml,
  validateCss,
  validateJavaScript,
  sandboxDocument,
} from './compiler';
import { websiteHtml } from './render';
import {
  moveNode,
  duplicateNode,
  editHistory,
  undoHistory,
  redoHistory,
} from './editor';
describe('structured website publishing', () => {
  it('keeps pages independent and excludes drafts, unused assets, forms and code', () => {
    const d = emptyWebsite();
    d.pages.push({
      ...structuredClone(d.pages[0]!),
      id: 'private',
      path: '/private',
      visibility: 'draft',
      nodes: [
        {
          ...createNode('image', 'draftImage'),
          props: { asset: 'draftAsset' },
        },
      ],
    });
    d.assets.push({
      id: 'draftAsset',
      assetId: '11111111-1111-4111-8111-111111111111',
      alt: 'Private upload',
      width: 100,
      height: 100,
    });
    d.code.push({
      id: 'unused',
      name: 'Private code',
      html: '<p>Secret draft</p>',
      css: '',
      javascript: '',
    });
    const build = compileWebsite(d);
    expect(build.document.pages).toHaveLength(1);
    expect(build.document.assets).toHaveLength(0);
    expect(build.artifacts).toHaveLength(0);
    expect(JSON.stringify(build)).not.toContain('Secret draft');
    expect(d.pages).toHaveLength(2);
  });
  it('rejects duplicate routes and invalid trees before publishing', () => {
    const d = emptyWebsite();
    d.pages.push({ ...structuredClone(d.pages[0]!), id: 'other' });
    expect(() => compileWebsite(d)).toThrow('Duplicate page route');
    d.pages.pop();
    const n = createNode('text', 'one');
    n.children.push(createNode('text', 'two'));
    d.pages[0]!.nodes.push(n);
    expect(() => validateDocument(d)).toThrow('cannot contain');
  });
  it('preserves responsive styles and limits node depth', () => {
    const d = emptyWebsite();
    const n = createNode('section', 'root');
    n.mobile = { padding: 12, columns: 1 };
    d.pages[0]!.nodes = [n];
    expect(websiteHtml(compileWebsite(d), '/')).toContain(
      '#root{padding:12px;grid-template-columns:repeat(1',
    );
    let current = n;
    for (let i = 0; i < 15; i++) {
      const child = createNode('section', `child${i}`);
      current.children = [child];
      current = child;
    }
    expect(() => validateDocument(d)).toThrow();
  });
  it('supports reusable node duplication and accessible moves without cycles', () => {
    const a = createNode('section', 'a'),
      b = createNode('text', 'b');
    a.children = [b];
    expect(() => moveNode([a], 'a', 'b', 0)).toThrow();
    expect(moveNode([a], 'b', null, 0).map((n) => n.id)).toEqual(['b', 'a']);
    let i = 0;
    expect(duplicateNode(a, () => `copy${++i}`).children[0]!.id).toBe('copy2');
  });
  it('keeps bounded undo/redo snapshots', () => {
    const h = editHistory({ past: [], present: 'first', future: [] }, 'second');
    expect(undoHistory(h).present).toBe('first');
    expect(redoHistory(undoHistory(h)).present).toBe('second');
  });
  it('rejects broken links and missing forms', () => {
    const d = emptyWebsite();
    d.navigation.push({ label: 'Missing', href: '/missing', children: [] });
    expect(() => compileWebsite(d)).toThrow('Broken internal link');
    d.navigation.pop();
    d.pages[0]!.nodes = [createNode('lead_form', 'form')];
    expect(() => compileWebsite(d)).toThrow('Missing enabled form');
  });
  it('escapes content and JSON-like markup in rendered HTML', () => {
    const d = emptyWebsite('<script>bad</script>');
    const n = createNode('text', 'copy');
    n.props.text = '<img src=x onerror=alert(1)>';
    d.pages[0]!.nodes = [n];
    const html = websiteHtml(compileWebsite(d), '/')!;
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>bad');
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    '//evil.example',
    '/../secret',
    '/a%2fb',
    'https://user:pass@example.com',
    'https://example.com\\@evil.example',
  ])('rejects unsafe URL %s', (url) => expect(safeUrl(url)).toBe(false));
  it('accepts HTTPS, local, email and telephone links', () => {
    for (const url of [
      'https://example.com/a',
      '/services',
      'mailto:studio@example.com',
      'tel:+919999999999',
    ])
      expect(safeUrl(url)).toBe(true);
  });
  it.each([
    '<img src=x onerror="alert(1)">',
    '<script>alert(1)</script>',
    '<iframe src="https://evil.example"></iframe>',
    '<a href="javascript:alert(1)">Go</a>',
  ])('rejects executable or unapproved custom HTML', (html) =>
    expect(() => sanitizeHtml(html)).toThrow(),
  );
  it.each([
    '@import "https://evil.example";',
    'p{background:url(https://evil.example)}',
    'p{color:red}</style><script>bad</script>',
    'p{behavior:expression(x)}',
  ])('rejects resource-loading CSS', (css) =>
    expect(() => validateCss(css)).toThrow(),
  );
  it.each([
    'eval("1")',
    'new Function("return 1")',
    'fetch("/api/invoices")',
    'document.cookie',
    'document["defaultView"]',
    'import("x")',
    'const x = ;',
    'document.querySelector("p").innerHTML = "x"',
  ])('rejects unsafe or invalid developer source', (source) =>
    expect(() => validateJavaScript(source)).toThrow(),
  );
  it('allows bounded DOM customization in a network-denied opaque sandbox', () => {
    const javascript =
      'document.querySelector("h2").textContent = website.getBusinessProfile().name;';
    expect(validateJavaScript(javascript)).toBe(javascript);
    const html = sandboxDocument(
      {
        id: 'demo',
        html: '<h2>Title</h2>',
        css: 'h2 { color: green; }',
        javascript,
      },
      { business: { name: 'Studio' } },
    );
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain('allow-same-origin');
    expect(html).not.toContain('service_role');
  });
  it('handles a bounded large page tree', () => {
    const d = emptyWebsite();
    d.pages[0]!.nodes = Array.from({ length: 20 }, (_, i) => ({
      ...createNode('section', `section${i}`),
      children: Array.from({ length: 50 }, (_, j) =>
        createNode('text', `text${i}_${j}`),
      ),
    }));
    const start = performance.now();
    expect(compileWebsite(d).document.pages[0]!.nodes).toHaveLength(20);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
