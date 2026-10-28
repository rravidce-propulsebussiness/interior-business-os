import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('template-first business website editing', () => {
  const entry = source('./[id]/page.tsx');
  const tabs = source('./[id]/[tab]/page.tsx');
  const editor = source('./studio.tsx');
  const design = source('./design-studio.tsx');
  const advanced = source('./template-editor.tsx');
  const creation = source('./website-create.tsx');
  const media = source('./website-media-picker.tsx');
  const settings = source('./settings-panel.tsx');
  const mediaRoute = source('./[id]/media/route.ts');

  it('opens the visual editor even for owners with source permissions', () => {
    expect(entry).toContain('<WebsiteEditor');
    expect(entry).not.toContain('<TemplateEditor');
    expect(entry).not.toContain('canViewSource ?');
    expect(entry).toContain("canEdit={s.allowed('website.page.edit')}");
    expect(entry).toContain("canViewSource={s.allowed('website.custom_code.view') && site.document.code.length > 0}");
  });

  it('keeps the developer editor permission-gated and separate', () => {
    expect(tabs).toContain("developer: 'website.custom_code.view'");
    expect(tabs).toContain("if (tab === 'developer') {");
    expect(tabs).toContain('<TemplateEditor');
    expect(tabs).toContain("canEdit={s.allowed('website.custom_code.edit')}");
    expect(tabs).not.toContain("if (tab === 'developer') redirect(");
    expect(editor).toContain('canViewSource && <Link');
    expect(advanced).toContain('Advanced source editor');
  });

  it('preserves old visual deep links while consolidating editing URLs', () => {
    expect(tabs).toContain("if (tab === 'layout')");
    expect(tabs).toContain('encodeURIComponent(query.page)');
    expect(entry).toContain('initialPageId: page');
    expect(advanced).toContain('href={`/dashboard/website/${id}?page=');
  });

  it('chooses website images from existing draft assets rather than raw identifiers', () => {
    expect(editor).toContain('<WebsiteMediaPicker');
    expect(editor).toContain('assets={document.assets}');
    expect(editor).not.toContain("'asset',\n                  'alt'");
    expect(media).toContain('assets.slice(-24).reverse()');
    expect(media).toContain('aria-pressed={asset.id === value}');
    expect(media).toContain('onClick={() => onChange(asset.id)}');
  });

  it('allows logo and favicon choices without editing underlying database IDs', () => {
    expect(settings).toContain("(['logo', 'favicon'] as const).map");
    expect(settings).toContain('<WebsiteMediaPicker');
    expect(settings).toContain('settings: { ...current.settings, [key]: assetId }');
    expect(entry).toContain("canPreviewMedia={s.allowed('website.media.manage')}");
    expect(tabs).toContain("canPreviewMedia={s.allowed('website.media.manage')}");
    expect(media).toContain("Upload / manage images");
  });

  it('uploads images within the editor using existing tenant-authorized media storage', () => {
    expect(media).toContain("method: 'POST', body, credentials: 'same-origin'");
    expect(media).toContain("['image/jpeg', 'image/png', 'image/webp', 'image/avif']");
    expect(media).toContain('10 * 1024 * 1024');
    expect(media).toContain('onUploaded({');
    expect(mediaRoute).toContain("websiteServices('website.media.manage')");
    expect(mediaRoute).toContain("request.headers.get('origin')");
    expect(mediaRoute).toContain('width, height, alt:');
  });

  it('persists uploaded asset references before updating page or logo settings', () => {
    expect(editor).toContain("(['assets', 'pages', 'header', 'footer'] as const)");
    expect(editor).toContain('onUploaded={asset => {');
    expect(editor).toContain('assets: [...document.assets, asset]');
    expect(settings).toContain("saveAction(id, nextVersion, 'assets', doc.assets)");
    expect(settings).toContain('onUploaded={asset => {');
    expect(settings).toContain('assets: [...current.assets, asset]');
  });

  it('prioritizes editable published templates over blank or code sites', () => {
    expect(creation).toContain("initialTemplate || templates[0]?.id || ''");
    expect(creation).toContain('<option value="">Start with a blank website</option>');
    expect(creation.indexOf('{templates.map(entry => (')).toBeLessThan(
      creation.indexOf('<option value="">Start with a blank website</option>'),
    );
    expect(creation).toContain('canCode && showAdvanced');
    expect(creation).toContain('Developer options');
    expect(creation).toContain("template === 'custom' ? '/developer' : ''");
  });

  it('does not promote code editor as a standard design option', () => {
    expect(editor).toContain('No coding needed.');
    expect(design).not.toContain('⌘ &nbsp; Code editor');
    expect(advanced).toContain('Visual editor');
  });
});
