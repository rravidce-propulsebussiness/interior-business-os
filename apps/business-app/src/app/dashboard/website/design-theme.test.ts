import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const globalCss = readFileSync(new URL('../../globals.css', import.meta.url), 'utf8');
const settingsRoute = readFileSync(new URL('./[id]/[tab]/page.tsx', import.meta.url), 'utf8');
const designStudio = readFileSync(new URL('./design-studio.tsx', import.meta.url), 'utf8');

describe('Website settings color and layout regression', () => {
  it('defaults the app to light colors rather than leaking the old dark stylesheet', () => {
    const root = globalCss.match(/:root\s*\{([^}]+)\}/)?.[1];
    expect(root).toContain('--background: #fffaf7');
    expect(root).toContain('--foreground: #342e30');
    expect(root).not.toContain('#07111f');
    expect(globalCss).toContain('color-scheme: light;');
    expect(globalCss).toContain('background: #ffffff;');
    expect(globalCss).toContain('body:has(:is(.premium-shell');
  });

  it('routes all website settings tabs through the owner dashboard layout', () => {
    expect(settingsRoute).toContain('<OwnerShell');
    expect(settingsRoute).toContain('<WebsiteDesignStudio');
    expect(settingsRoute).toContain('<FileDeveloperStudio');
    expect(settingsRoute).toContain('website-settings-workspace');
    expect(settingsRoute).toContain("tab === 'developer' || tab === 'design'");
  });

  it('provides editable theme settings and the current secured draft preview', () => {
    expect(designStudio).toContain("saveWebsiteSection(id, version, 'theme', theme)");
    expect(designStudio).toContain('renderWebsiteThemePreview(id, nextTheme, path)');
    expect(designStudio).toContain("useState<'site' | 'sample'>('sample')");
    expect(designStudio).not.toContain('renderDraftPreview(');
    expect(designStudio).not.toContain('useEffect(');
    expect(settingsRoute).toContain('initialTheme={site.document.theme}');
    expect(settingsRoute).not.toContain('initial={site.document}\n      initialVersion={site.version}');
    expect(designStudio).toContain("sandbox=\"allow-scripts\"");
    expect(designStudio).toContain('Discard unsaved changes');
  });
});
