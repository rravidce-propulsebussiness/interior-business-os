import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const file = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8');

const topLevelSelectors = (style: string) =>
  style.match(/^[^@\s/*}][^{]*\{/gm) ?? [];

describe('ProPulse premium glass layer', () => {
  it('is loaded last by OwnerShell and enabled by one scoped class', () => {
    const shell = file('./owner-shell.tsx');
    const globalImport = shell.indexOf("import './owner-shell-global.css';");
    const glassImport = shell.indexOf("import './glass-theme.css';");
    expect(globalImport).toBeGreaterThan(-1);
    expect(glassImport).toBeGreaterThan(globalImport);
    expect(shell).toContain(
      'className="owner-layout owner-layout-unified owner-theme-glass"',
    );
  });

  it('keeps the brand palette and stays scoped to the owner workspace', () => {
    const style = file('./glass-theme.css');
    expect(style).toContain('#88352b');
    expect(style).toContain('#bd5c3f');
    expect(style).toContain('prefers-reduced-motion: reduce');
    expect(style).not.toContain('public-website-root');
    expect(style).not.toContain('!important');
    for (const rule of topLevelSelectors(style)) {
      expect(rule).toContain('.owner-theme-glass');
    }
  });

  it('labels sidebar sections without changing navigation items', () => {
    const shell = file('./owner-shell.tsx');
    expect(shell).toContain('navSectionLabels(displayedNavigation)');
    expect(shell).toContain('className="owner-nav-section"');
    expect(shell).toContain(
      'const displayedNavigation = sharedNavigation ?? navigation',
    );
  });

  it('lays out the command centre with real data only', () => {
    const centre = file('./command-centre.tsx');
    expect(centre).toContain("import './command-layout.css';");
    expect(centre).toContain('className="command-tiles"');
    expect(centre).toContain('<PipelineDonut metrics={metrics} />');
    expect(centre).not.toContain('Math.random');
    const layout = file('./command-layout.css');
    expect(layout).toContain('#88352b');
    expect(layout).toContain('prefers-reduced-motion: reduce');
    expect(layout).not.toContain('!important');
    for (const rule of topLevelSelectors(layout)) {
      expect(rule).toContain('.command-reel');
    }
  });

  it('renders a static, accessible loading splash', () => {
    const loading = file('./loading.tsx');
    expect(loading).toContain('role="status"');
    expect(loading).not.toContain('new Date');
    expect(loading).not.toContain("'use client'");
    expect(file('./dashboard-loading.css')).toContain(
      'prefers-reduced-motion: no-preference',
    );
  });
});
