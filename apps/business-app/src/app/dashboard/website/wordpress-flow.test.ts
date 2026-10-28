import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { emptyWebsite, createNode } from '@business-os/website-builder';
import { compileWebsite } from '@business-os/website-builder/compiler';
import { websiteHtml } from '@business-os/website-builder/render';

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('website templates and click-to-edit workflow', () => {
  it('uses a gallery rather than compiling the full website for landing', () => {
    const route = source('./page.tsx');
    const gallery = source('./website-gallery.tsx');
    expect(route).toContain('<WebsiteGallery');
    expect(route).not.toContain('website_metrics_read');
    expect(route).not.toContain('previewWebsite(');
    expect(gallery).toContain('YOUR DEFAULT WEBSITE');
    expect(gallery).toContain('Default template');
    expect(gallery).toContain('Edit website');
    expect(gallery).toContain('starter:construction');
  });

  it('keeps a real layout editor and file conversion separate from published data', () => {
    const visual = source('./studio.tsx');
    const convert = source('./convert-code-action.ts');
    expect(visual).toContain('Convert to code copy');
    expect(visual).toContain('Files');
    expect(convert).toContain("visibility:'draft' as const");
    expect(convert).toContain('...site.document.pages');
    expect(convert).toContain("s.website.save(id, version, 'code'");
    expect(convert).toContain("s.website.save(id, nextVersion, 'pages'");
    expect(convert).toContain('original visual page');
  });

  it('offers click-to-edit only in the sandboxed editor preview', () => {
    const doc = emptyWebsite('Demo');
    doc.pages[0]!.nodes = [
      createNode('hero', 'hero'),
      createNode('heading','heading'),
      createNode('text','text'),
    ];
    const build = compileWebsite(doc);
    const preview = websiteHtml(build, '/', { preview:true })!;
    const publicHtml = websiteHtml(build, '/')!;
    expect(preview).toContain('website.inline-text');
    expect(preview).toContain('contenteditable');
    expect(preview).toContain('textTarget.textContent');
    expect(publicHtml).not.toContain('website.inline-text');
    expect(source('./studio.tsx')).toContain("data?.type === 'website.inline-text'");
    expect(source('./studio.tsx')).toContain('data.value.length >');
  });
});
