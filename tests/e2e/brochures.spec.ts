import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFName, PDFArray } from 'pdf-lib';
import {
  emptyBrochure,
  createComponent,
  pageSize,
  kitSchema,
  resolveSnapshot,
  type BrochureDocument,
} from '../../packages/brochure-builder/src/model';
import { starterBrochure } from '../../packages/brochure-builder/src/templates';
import { brochureHtml } from '../../packages/brochure-builder/src/render';
import { renderPdf } from '../../packages/shared/src/pdf';
const aid = '00000000-0000-4000-8000-000000000009';
test('brochure routes reject anonymous management and unknown public content', async ({
  page,
  request,
}, info) => {
  if (info.project.name === 'business-app') {
    await page.goto('/dashboard/brochures');
    await expect(page).toHaveURL(/\/login/);
    for (const path of [
      '/dashboard/brochures/00000000-0000-4000-8000-000000000001/pdf',
      '/dashboard/brochures/media/00000000-0000-4000-8000-000000000001',
    ]) {
      const r = await request.get(path);
      expect([403, 404]).toContain(r.status());
    }
  } else if (info.project.name === 'websites') {
    const r = await page.goto('/brochure/unknown-business/private-draft');
    expect(r?.status()).toBe(404);
    expect(
      (
        await request.get('/brochure/unknown-business/private-draft/pdf')
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.get(
          '/brochure/unknown-business/private-draft/assets/' + aid,
        )
      ).status(),
    ).toBe(404);
  } else test.skip(true, 'Tenant and public applications');
});
test('brochure PDF preflight verifies dimensions, links, metadata and 50-page output', async ({}, info) => {
  test.skip(info.project.name !== 'business-app', 'Shared document renderer');
  test.setTimeout(180000);
  await mkdir('test-results/phase9-pdf', { recursive: true });
  const image = await readFile(
    'packages/industry-interior/assets/living-room-concept.webp',
  );
  const imageUrl = `data:image/webp;base64,${image.toString('base64')}`;
  const kit = kitSchema.parse({
    brand: {
      tagline: 'Spaces with purpose.',
      phone: '+91 98765 43210',
      email: 'studio@example.test',
      address: 'Replace with your public studio address',
    },
  });
  const demo = resolveSnapshot(
    starterBrochure('luxury', 'Interior Studio / Company Profile', aid),
    kit,
    'Your Interior Studio',
  );
  const scenarios: [string, BrochureDocument][] = [['interior-profile', demo]];
  for (const format of [
    'A4 Landscape',
    'A5 Portrait',
    'A5 Landscape',
    'Square',
    'Custom',
  ] as const) {
    const d = emptyBrochure(`${format} print proof`);
    d.format = format;
    d.width = 260;
    d.height = 190;
    const [w, h] = pageSize(d);
    d.header = 'PRINT PROOF';
    d.footer = 'Studio contact: studio@example.test';
    d.numbering.hideCover = false;
    const heading = {
      ...createComponent('heading', 'heading'),
      x: 12,
      y: 15,
      width: w - 24,
      height: 30,
      text: format,
      style: { ...createComponent('heading', 'x').style, size: 24 },
    };
    const text = {
      ...createComponent('text', 'text'),
      x: 12,
      y: 47,
      width: w - 24,
      height: 20,
      text: 'A print-first layout with safe margins, approved images and editable content.',
      style: { ...createComponent('text', 'x').style, size: 10 },
    };
    const photo = {
      ...createComponent('image', 'photo'),
      x: 12,
      y: 72,
      width: w - 24,
      height: h - 94,
      asset: aid,
      alt: 'Interior concept',
    };
    d.pages[0]!.components = [heading, text, photo];
    d.pages[0]!.showHeader = true;
    d.pages.push({
      ...d.pages[0]!,
      id: 'details',
      name: 'Details',
      components: [
        { ...heading, text: 'Materials & service details' },
        {
          ...createComponent('table', 'table'),
          x: 12,
          y: 52,
          width: w - 24,
          height: 52,
          rows: [
            ['Material', 'Application'],
            ['Plywood', 'Cabinet construction'],
            ['Laminate', 'Durable surface'],
            ['Glass', 'Display details'],
          ],
          style: { ...createComponent('table', 'x').style, size: 10 },
        },
        {
          ...createComponent('cta', 'cta'),
          x: 12,
          y: h - 28,
          width: w - 24,
          height: 10,
          text: 'Contact the studio',
          link: 'https://example.org/contact',
          style: { ...createComponent('cta', 'x').style, size: 10 },
        },
      ],
    });
    scenarios.push([format.toLowerCase().replaceAll(' ', '-'), d]);
  }
  const stress = emptyBrochure('50-page print proof');
  stress.pages = Array.from({ length: 50 }, (_, i) => ({
    id: `page${i + 1}`,
    name: `Page ${i + 1}`,
    background: '#ffffff',
    showHeader: true,
    showFooter: true,
    components: [
      {
        ...createComponent('heading', 'heading'),
        x: 15,
        y: 20,
        width: 175,
        height: 25,
        text: `Page ${i + 1}`,
        style: { ...createComponent('heading', 'x').style, size: 26 },
      },
      {
        ...createComponent('text', 'text'),
        x: 15,
        y: 60,
        width: 175,
        height: 200,
        text: 'A considered approach to materials, proportion and detail. '.repeat(
          45,
        ),
        style: { ...createComponent('text', 'x').style, size: 12 },
      },
    ],
  }));
  scenarios.push(['fifty-pages', stress]);
  const metrics: Record<string, unknown>[] = [];
  for (const [name, d] of scenarios) {
    const start = performance.now();
    const bytes = await renderPdf(
      brochureHtml(d, {
        assetUrl: () => imageUrl,
        print: true,
        businessName: 'Your Interior Studio',
      }),
      { brochure: true, title: d.title, author: 'Your Interior Studio' },
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(d.pages.length);
    const [w, h] = pageSize(d);
    for (const p of pdf.getPages()) {
      expect(Math.abs(p.getWidth() - (w / 25.4) * 72)).toBeLessThan(1);
      expect(Math.abs(p.getHeight() - (h / 25.4) * 72)).toBeLessThan(1);
    }
    expect(pdf.getTitle()).toBe(d.title);
    expect(pdf.getAuthor()).toBe('Your Interior Studio');
    if (name === 'a4-landscape') {
      const annotations = pdf
        .getPages()[1]!
        .node.lookup(PDFName.of('Annots'), PDFArray);
      expect(annotations.size()).toBeGreaterThan(0);
    }
    await writeFile(`test-results/phase9-pdf/${name}.pdf`, bytes);
    metrics.push({
      name,
      pages: pdf.getPageCount(),
      bytes: bytes.length,
      milliseconds: performance.now() - start,
    });
  }
  await writeFile(
    'test-results/phase9-pdf/performance.json',
    JSON.stringify(metrics, null, 2),
  );
  const overflow = emptyBrochure();
  overflow.pages[0]!.components = [
    {
      ...createComponent('text', 'overflow'),
      height: 10,
      text: 'Long text must never silently clip. '.repeat(100),
    },
  ];
  await expect(
    renderPdf(brochureHtml(overflow, { print: true }), { brochure: true }),
  ).rejects.toThrow('Print preflight');
});
