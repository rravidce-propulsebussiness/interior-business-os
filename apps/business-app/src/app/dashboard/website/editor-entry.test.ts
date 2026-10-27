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

  it('does not promote code editor as a standard design option', () => {
    expect(editor).toContain('No coding needed.');
    expect(design).not.toContain('⌘ &nbsp; Code editor');
    expect(advanced).toContain('Visual editor');
  });
});
