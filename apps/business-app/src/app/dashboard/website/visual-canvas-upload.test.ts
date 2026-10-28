import { describe, expect, it } from 'vitest';
import { isAllowedWebsiteUploadOrigin } from './upload-origin';
import { emptyWebsite, createNode } from '@business-os/website-builder';
import { compileWebsite } from '@business-os/website-builder/compiler';
import { websiteHtml } from '@business-os/website-builder/render';
import { readFileSync } from 'node:fs';

function request(origin: string | null, host: string, forwarded?: string): Request {
  const headers = new Headers({ host });
  if (origin) headers.set('origin', origin);
  if (forwarded) headers.set('x-forwarded-host', forwarded);
  return new Request('http://localhost:3000/dashboard/website/site/uploads/media', {
    method: 'POST', headers,
  });
}

describe('Website upload behind reverse proxies', () => {
  it('permits same-public-host Origin when internal Request.url differs', () => {
    expect(isAllowedWebsiteUploadOrigin(
      request('https://sghomesinterior.in', 'localhost:3000', 'sghomesinterior.in'),
    )).toBe(true);
    expect(isAllowedWebsiteUploadOrigin(
      request('https://sghomesinterior.in', 'sghomesinterior.in'),
    )).toBe(true);
  });
  it('rejects cross-site and missing Origin values', () => {
    expect(isAllowedWebsiteUploadOrigin(
      request('https://attacker.example', 'localhost:3000', 'sghomesinterior.in'),
    )).toBe(false);
    expect(isAllowedWebsiteUploadOrigin(
      request(null, 'localhost:3000', 'sghomesinterior.in'),
    )).toBe(false);
    expect(isAllowedWebsiteUploadOrigin(
      request('https://sghomesinterior.in.evil.example', 'localhost:3000', 'sghomesinterior.in'),
    )).toBe(false);
  });
});

describe('Website visual-first UI', () => {
  const src = readFileSync(new URL('./studio.tsx', import.meta.url), 'utf8');
  it('starts with a full-width canvas, panels are opt-in', () => {
    expect(src).toContain('useState(false);');
    expect(src).toContain('ss-simple-layout');
    expect(src).toContain('showSections && <aside');
    expect(src).toContain('showInspector && <aside');
    expect(src).toContain('Code / Files');
    expect(src).toContain('GitHub / VS Code');
    expect(src).toContain('Full screen');
  });
  it('lets preview image clicks open image controls', () => {
    expect(src).toContain("data?.type === 'website.replace-image'");
    expect(src).toContain('setShowInspector(true)');
    expect(src).toContain('<WebsiteMediaPicker');
    const doc = emptyWebsite('Demo');
    doc.pages[0]!.nodes.push(createNode('image', 'image'));
    const html = websiteHtml(compileWebsite(doc), '/', {preview:true})!;
    expect(html).toContain('website.replace-image');
    expect(websiteHtml(compileWebsite(doc), '/')!).not.toContain('website.replace-image');
  });
});
