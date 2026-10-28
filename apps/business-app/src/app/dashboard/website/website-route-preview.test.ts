import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { applyWebsitePreviewNonce } from './website-preview-nonce';
import { createNode, emptyWebsite } from '@business-os/website-builder';
import { compileWebsite } from '@business-os/website-builder/compiler';
import { websiteHtml } from '@business-os/website-builder/render';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Website media page and preview CSP regression', () => {
  it('reserves /media for the website settings page, not POST uploads', () => {
    expect(existsSync(new URL('./[id]/media/route.ts', import.meta.url))).toBe(false);
    expect(existsSync(new URL('./[id]/uploads/media/route.ts', import.meta.url))).toBe(true);
    expect(read('./media-panel.tsx')).toContain('/uploads/media');
    expect(read('./website-media-picker.tsx')).toContain('/uploads/media');
    expect(read('./[id]/[tab]/page.tsx')).toContain("} else if (tab === 'media') {");
    expect(read('./[id]/media/[asset]/route.ts')).toContain('export async function GET(');
  });

  it('nonces only the fixed trusted editor script, not user-provided code', () => {
    const html = '<script data-website-preview-script>preview()</script>' +
      '<script>untrusted()</script>';
    const result = applyWebsitePreviewNonce(html, 'dGVzdC1ub25jZS0xMjM0NTY=');
    expect(result).toContain('<script data-website-preview-script nonce="dGVzdC1ub25jZS0xMjM0NTY=">preview()');
    expect(result).toContain('<script>untrusted()</script>');
    expect(result).not.toContain('<script nonce="dGVzdC1ub25jZS0xMjM0NTY=">untrusted()');
  });

  it('does not attempt to run the preview script without an existing page nonce', () => {
    const html = '<h1>Safe preview</h1><script data-website-preview-script>preview()</script>';
    expect(applyWebsitePreviewNonce(html, '')).toBe('<h1>Safe preview</h1>');
    expect(applyWebsitePreviewNonce(html, '"><script>')).toBe('<h1>Safe preview</h1>');
  });

  it('marks only editor previews for nonce addition', () => {
    const doc = emptyWebsite('Construction');
    doc.pages[0]!.nodes.push(createNode('text','note'));
    const build = compileWebsite(doc);
    const preview = websiteHtml(build, '/', { preview: true })!;
    const publicPage = websiteHtml(build, '/')!;
    expect(preview).toContain('<script data-website-preview-script>');
    expect(publicPage).not.toContain('data-website-preview-script');
  });
});
