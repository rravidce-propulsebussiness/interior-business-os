import { describe, expect, it } from 'vitest';
import { emptyWebsite, createNode } from '@business-os/website-builder';
import { linkedDraftPagesForPublication } from './website-publication-links';

describe('publish linked template pages', () => {
  it('offers to publish draft menu pages without exposing unrelated private drafts', () => {
    const doc = emptyWebsite('Company');
    const about = { ...structuredClone(doc.pages[0]!), id: 'aboutpage',
      path: '/about', title: 'About', visibility: 'draft' as const,
      seo: { title: 'About', description: '', noindex: true }, nodes: [] };
    const privatePage = { ...structuredClone(about), id: 'privatepage',
      path: '/private', title: 'Private' };
    doc.pages.push(about, privatePage);
    doc.navigation.push({ label: 'About', href: '/about', children: [] });
    expect(linkedDraftPagesForPublication(doc)).toEqual(['/about']);
  });

  it('follows links inside promoted pages until all reachable routes are included', () => {
    const doc = emptyWebsite('Company');
    const about = { ...structuredClone(doc.pages[0]!), id: 'aboutpage',
      path: '/about', title: 'About', visibility: 'draft' as const,
      seo: { title: 'About', description: '', noindex: true },
      nodes: [createNode('button', 'nextnode')] };
    about.nodes[0]!.props.href = '/contact#contact-form';
    const contact = { ...structuredClone(about), id: 'contactpage',
      path: '/contact', title: 'Contact', nodes: [] };
    doc.pages.push(about, contact);
    doc.navigation.push({ label: 'About', href: '/about', children: [] });
    expect(linkedDraftPagesForPublication(doc)).toEqual(['/about', '/contact']);
  });

  it('does not promote unlinked drafts or externally linked pages', () => {
    const doc = emptyWebsite('Company');
    doc.navigation.push({ label: 'External', href: 'https://example.com', children: [] });
    expect(linkedDraftPagesForPublication(doc)).toEqual([]);
  });
});
