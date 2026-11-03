import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('two-mode company website workflow', () => {
  const gallery = source('./website-gallery.tsx');
  const creation = source('./website-create.tsx');
  const tabs = source('./[id]/[tab]/page.tsx');
  const fixed = source('./fixed-template-editor.tsx');
  const server = source('./fixed-template-actions.ts');
  const github = source('./website-git-tools.tsx');
  const media = source('./website-media-picker.tsx');

  it('offers only fixed content editing and GitHub / VS Code to company users', () => {
    expect(gallery).toContain('Edit text &amp; images');
    expect(gallery).toContain('GitHub / VS Code');
    expect(gallery).not.toContain('>Design</Link>');
    expect(gallery).not.toContain('>Files</Link>');
    expect(gallery).not.toContain('Ready-made pages');
    expect(gallery).not.toContain('/developer`');
  });

  it('requires a template for new websites and opens the content editor', () => {
    expect(creation).toContain('Choose one of the available fixed templates.');
    expect(creation).not.toContain('Start with a blank website');
    expect(creation).not.toContain('Developer options');
    expect(creation).not.toContain('Advanced: custom HTML');
    expect(creation).toContain('/layout`');
  });

  it('routes layout to the fixed content-only editor and hides old editor modes', () => {
    expect(tabs).toContain('<FixedTemplateEditor');
    expect(tabs).not.toContain('<WebsiteEditor');
    expect(tabs).not.toContain('<TemplateEditor');
    expect(tabs).toContain("if (tab === 'developer') redirect(");
    expect(tabs).toContain("if (tab === 'design' || tab === 'navigation' || tab === 'content')");
    expect(tabs).toContain("canEdit={s.allowed('website.page.edit')}");
    expect(tabs).toContain("canUpload={s.allowed('website.media.manage')}");
  });

  it('offers click-to-edit text, headings, cards, photos and logos without structural commands', () => {
    expect(fixed).toContain("data.type === 'website.select'");
    expect(fixed).toContain("data.type === 'website.inline-text'");
    expect(fixed).toContain("data.type === 'website.select-content'");
    expect(fixed).toContain('<WebsiteMediaPicker');
    expect(fixed).toContain('onUploaded={asset => setNodeImage');
    expect(fixed).not.toContain('moveNode(');
    expect(fixed).not.toContain('insertNode(');
    expect(fixed).not.toContain('duplicateNode(');
  });

  it('protects saves using the existing role permissions and a template shape guard', () => {
    expect(server).toContain("websiteServices(section === 'assets' ? 'website.media.manage' : 'website.page.edit')");
    expect(server).toContain('preservesFixedTemplate(');
    expect(fixed).toContain('saveFixedTemplateSection(');
    expect(fixed).toContain('publishWebsite(');
  });

  it('keeps the established media upload checks in the content panel', () => {
    expect(media).toContain("['image/jpeg', 'image/png', 'image/webp', 'image/avif']");
    expect(media).toContain('10 * 1024 * 1024');
    expect(media).toContain("method: 'POST', body, credentials: 'same-origin'");
  });

  it('uses external GitHub / VS Code rather than an internal source editor', () => {
    expect(github).toContain('vscode.dev/github/');
    expect(github).not.toContain('Edit supported HTML/CSS/JS in Business OS');
    expect(github).toContain('Automatic syncing is not enabled');
    expect(github).toContain('separate hosting');
  });
});
