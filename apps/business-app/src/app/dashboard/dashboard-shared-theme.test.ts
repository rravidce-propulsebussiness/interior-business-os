import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const file = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8');

describe('ProPulse premium theme for legacy company pages', () => {
  it('shares the existing permission-filtered company provider', () => {
    const layout = file('./layout.tsx');
    expect(layout).toContain('ownerWorkspaceNavigation(context)');
    expect(layout).toContain('<CompanyNavigationProvider');
    expect(layout).toContain('<div className="dashboard-visual-root">');
    expect(layout).not.toContain('service_role');
  });
  it('uses CSS-only styles scoped to direct legacy content', () => {
    const style = file('./dashboard-shared-theme.css');
    expect(style).toContain('.dashboard-visual-root > main');
    expect(style).toContain('#88352b');
    expect(style).toContain('#bd5c3f');
    expect(style).toContain('prefers-reduced-motion: reduce');
    expect(style).not.toContain('public-website-root');
    expect(style).not.toContain('.owner-layout');
    expect(style).not.toContain('!important');
  });
});
