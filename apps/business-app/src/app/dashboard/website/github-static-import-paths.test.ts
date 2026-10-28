import { describe, expect, it } from 'vitest';
import { importableHtmlPath, importedPageSlug, importableStylesheetPath } from './github-static-import-paths';

describe('static GitHub import paths', () => {
  it('accepts static exports from common framework build output', () => {
    for (const file of ['index.html', 'pages/contact.html', 'out/index.html',
      'out/about/index.html', 'dist/services.html', 'build/projects/index.html']) {
      expect(importableHtmlPath(file)).toBe(true);
    }
    expect(importedPageSlug('index.html')).toBe('git-home');
    expect(importedPageSlug('out/about/index.html')).toBe('git-about');
    expect(importedPageSlug('dist/services.html')).toBe('git-services');
  });

  it('rejects unsafe paths, executable source and unreasonable nesting', () => {
    for (const file of ['../index.html', '/out/index.html', 'out/../index.html',
      'server.php', 'src/app/page.tsx', 'out/a/b/c/d/e/index.html']) {
      expect(importableHtmlPath(file)).toBe(false);
    }
  });

  it('only recognizes bounded, conventional static stylesheet names', () => {
    expect(importableStylesheetPath('styles.css')).toBe(true);
    expect(importableStylesheetPath('dist/css/main.css')).toBe(true);
    expect(importableStylesheetPath('out/js/app.js')).toBe(false);
  });
});
