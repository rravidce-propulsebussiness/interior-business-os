import { describe, expect, it } from 'vitest';
import { starterTemplate, validateTemplate } from './templates';
import { compileWebsite } from './compiler';
import { websiteHtml } from './render';

describe('reusable website templates', () => {
  it.each(['blank', 'construction', 'services', 'custom'] as const)(
    'compiles the %s starting point',
    (kind) => {
      const document = starterTemplate('RV Construction', kind);
      const html = websiteHtml(compileWebsite(document), '/', {
        preview: true,
      });
      expect(html).toContain('RV Construction');
      if (kind === 'custom') {
        expect(html).toContain('sandbox=');
        expect(document.code).toHaveLength(1);
      }
    },
  );
  it('does not share mutable template state between companies', () => {
    const first = starterTemplate('One', 'construction');
    first.theme.primary = '#000000';
    first.pages[0]!.nodes.length = 0;
    const second = starterTemplate('Two', 'construction');
    expect(second.theme.primary).toBe('#88352B');
    expect(second.pages[0]!.nodes.length).toBeGreaterThan(0);
  });
  it('rejects tenant media and business record references', () => {
    const doc = starterTemplate('Test');
    doc.content.push({
      id: 'project',
      kind: 'projects',
      title: 'Private project',
      text: '',
      published: true,
      sourceId: '11111111-1111-4111-8111-111111111111',
      sourceType: 'projects',
    });
    expect(() => validateTemplate(doc)).toThrow(
      'company media or business records',
    );
  });
});
