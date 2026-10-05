import { describe, it, expect } from 'vitest';
import {
  brochureSchema,
  createComponent,
  emptyBrochure,
  validateDocument,
  resolveSnapshot,
  kitSchema,
  assetReferences,
  pageSize,
  safeLink,
} from './model';
import { brochureHtml, imageWarnings } from './render';
import { edit, undo, redo, movePage, duplicatePage, layer } from './editor';
import { starterBrochure, templateCatalog } from './templates';
const aid = '00000000-0000-4000-8000-000000000009';
describe('Brochure print and public boundary', () => {
  it.each([
    'A4 Portrait',
    'A4 Landscape',
    'A5 Portrait',
    'A5 Landscape',
    'Square',
    'Custom',
  ] as const)('supports bounded %s print dimensions', (format) => {
    const d = validateDocument({ ...emptyBrochure(), format });
    const [w, h] = pageSize(d);
    expect(w).toBeGreaterThanOrEqual(100);
    expect(h).toBeLessThanOrEqual(420);
    expect(brochureHtml(d)).toContain(`size:${w}mm ${h}mm`);
  });
  it('rejects oversized, negative and rotated overflow', () => {
    const d = emptyBrochure();
    d.pages[0]!.components = [createComponent('text', 'text')];
    for (const patch of [
      { x: -1 },
      { x: 205 },
      { rotation: 90, y: 0 },
      { width: 501 },
    ])
      expect(() =>
        validateDocument({
          ...d,
          pages: [
            {
              ...d.pages[0]!,
              components: [{ ...d.pages[0]!.components[0]!, ...patch }],
            },
          ],
        }),
      ).toThrow();
    expect(() => validateDocument({ ...d, width: 999 })).toThrow();
  });
  it('rejects unknown data and arbitrary executable source', () => {
    expect(() =>
      brochureSchema.parse({
        ...emptyBrochure(),
        customer: { name: 'Private' },
      }),
    ).toThrow();
    const c = {
      ...createComponent('custom', 'custom'),
      javascript: 'alert(1)',
    };
    expect(() =>
      validateDocument({
        ...emptyBrochure(),
        pages: [{ id: 'p', name: 'Page', components: [c] }],
      }),
    ).toThrow();
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:pass@example.org',
    'https://example.org/dashboard/quotes',
    '//example.org',
    'https://example.org/\nsecret',
  ])('rejects unsafe link %s', (url) => expect(safeLink(url)).toBe(false));
  it.each([
    'https://example.org/services',
    'mailto:studio@example.org',
    'tel:+919876543210',
    '#page-cover',
  ])('allows intended public link %s', (url) =>
    expect(safeLink(url)).toBe(true),
  );
  it('escapes text, attributes, table cells and metadata', () => {
    const d = emptyBrochure('<script>alert(1)</script>');
    const c = createComponent('table', 'table');
    c.rows = [['<img onerror=alert(1)>', '"quoted"']];
    d.pages[0]!.components = [c];
    const html = brochureHtml(d);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img onerror=alert(1)&gt;');
    expect(html).toContain('&quot;quoted&quot;');
  });
  it('requires existing internal pages', () => {
    const d = emptyBrochure();
    const c = createComponent('cta', 'cta');
    c.link = '#page-missing';
    d.pages[0]!.components = [c];
    expect(() => validateDocument(d)).toThrow('missing page');
  });
  it('rejects duplicate page and component identifiers', () => {
    const d = emptyBrochure();
    expect(() =>
      validateDocument({ ...d, pages: [d.pages[0], d.pages[0]] }),
    ).toThrow('Duplicate page');
    const c = createComponent('text', 'duplicate');
    expect(() =>
      validateDocument({
        ...d,
        pages: [{ ...d.pages[0]!, components: [c, c] }],
      }),
    ).toThrow('Duplicate component');
  });
  it('resolves only approved content and strips source references and bindings', () => {
    const kit = kitSchema.parse({
      content: [
        {
          id: 'service',
          kind: 'service',
          title: 'Public service',
          description: 'Approved',
          public: false,
          source: { kind: 'catalog_items', id: aid },
        },
      ],
    });
    const d = emptyBrochure();
    d.pages[0]!.components = [
      { ...createComponent('service', 'serviceCard'), binding: 'service' },
    ];
    expect(() => resolveSnapshot(d, kit, 'Studio')).toThrow('Approve');
    kit.content[0]!.public = true;
    const published = resolveSnapshot(d, kit, 'Studio');
    expect(published.pages[0]!.components[0]!.text).toBe('Public service');
    expect(JSON.stringify(published)).not.toContain('catalog_items');
    expect(JSON.stringify(published)).not.toContain('binding');
    kit.content[0]!.title = 'Later change';
    expect(published.pages[0]!.components[0]!.text).toBe('Public service');
  });
  it('freezes brand logos and contact details across later kit edits', () => {
    const kit = kitSchema.parse({ brand: { logo: aid, phone: '123456789' } });
    const d = emptyBrochure();
    d.pages[0]!.components = [
      { ...createComponent('logo', 'logo'), binding: 'logo' },
      { ...createComponent('contact', 'contact'), binding: 'contact' },
    ];
    const snapshot = resolveSnapshot(d, kit, 'Studio');
    kit.brand.logo = '00000000-0000-4000-8000-000000000010';
    kit.brand.phone = 'Changed';
    expect(assetReferences(snapshot)).toContain(aid);
    expect(snapshot.pages[0]!.components[1]!.text).toContain('123456789');
  });
  it('excludes hidden components and their image references', () => {
    const d = emptyBrochure();
    d.pages[0]!.components = [
      { ...createComponent('image', 'image'), asset: aid, hidden: true },
    ];
    expect(
      assetReferences(resolveSnapshot(d, kitSchema.parse({}), 'Studio')),
    ).toEqual([]);
  });
  it('warns about low resolution without changing image bytes or blocking layout', () => {
    const d = emptyBrochure();
    d.pages[0]!.components = [
      {
        ...createComponent('image', 'image'),
        asset: aid,
        width: 100,
        height: 100,
      },
    ];
    expect(
      imageWarnings(d, [{ id: aid, width: 300, height: 300 }]),
    ).toHaveLength(1);
    expect(() => validateDocument(d)).not.toThrow();
  });
  it('keeps starter templates fully editable and without invented endorsements', () => {
    for (const t of templateCatalog) {
      const d = validateDocument(starterBrochure(t.id));
      expect(d.pages.length).toBeGreaterThan(3);
      d.pages[0]!.components[0]!.text = 'My design';
      expect(validateDocument(d).pages[0]!.components[0]!.text).toBe(
        'My design',
      );
      expect(d.settings.sharing).toBe(false);
    }
    expect(starterBrochure('luxury').pages).toHaveLength(10);
  });
  it('keeps custom blocks non-executable and supports table and gallery markup', () => {
    const d = emptyBrochure();
    d.pages[0]!.components = [
      { ...createComponent('custom', 'c'), text: '<iframe src=x>' },
      { ...createComponent('gallery', 'gallery'), assets: [aid] },
    ];
    const html = brochureHtml(d, { assetUrl: () => '/safe-image' });
    expect(html).not.toContain('<iframe');
    expect(html).toContain('loading="lazy"');
  });
  it('uses computed numbering and explicit bleed', () => {
    const d = emptyBrochure();
    d.pages.push({ ...d.pages[0]!, id: 'second' });
    d.numbering.start = 7;
    d.bleed = 3;
    const html = brochureHtml(d, { print: true });
    expect(html).toContain('size:216mm 303mm');
    expect(html).toContain('>8</span>');
    expect(html).not.toContain('>7</span>');
  });
  it('bounds document page and component complexity', () => {
    const d = emptyBrochure();
    expect(() =>
      validateDocument({
        ...d,
        pages: Array.from({ length: 101 }, (_, i) => ({
          ...d.pages[0]!,
          id: `p${i}`,
        })),
      }),
    ).toThrow();
  });
});
describe('Brochure editing history', () => {
  it('duplicates and reorders independent pages without changing referenced records', () => {
    const d = emptyBrochure();
    d.pages[0]!.components = [
      { ...createComponent('image', 'image'), asset: aid },
    ];
    const copy = duplicatePage(d, 0, 'copy');
    copy.pages[1]!.components[0]!.text = 'Changed';
    expect(d.pages[0]!.components[0]!.text).toBe('');
    expect(copy.pages[1]!.components[0]!.asset).toBe(aid);
    expect(movePage(copy, 1, 0).pages[0]!.id).toBe('copy');
  });
  it('supports bounded undo/redo and clears abandoned redo', () => {
    const d = emptyBrochure();
    let h = {
      past: [] as (typeof d)[],
      present: d,
      future: [] as (typeof d)[],
    };
    for (let i = 0; i < 60; i++) h = edit(h, { ...d, title: String(i) });
    expect(h.past).toHaveLength(50);
    expect(undo(h).present.title).toBe('58');
    expect(redo(undo(h)).present.title).toBe('59');
    expect(edit(undo(h), d).future).toHaveLength(0);
  });
  it('preserves locked layers while allowing keyboard ordering', () => {
    const a = createComponent('text', 'a'),
      b = createComponent('text', 'b');
    expect(layer([a, b], 'b', 0).map((x) => x.id)).toEqual(['b', 'a']);
    b.locked = true;
    expect(layer([a, b], 'b', 0).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
