import { describe, expect, it } from 'vitest';
import { createNode, emptyWebsite } from '@business-os/website-builder';
import { preservesFixedTemplate } from './fixed-template-guard';

function example() {
  const website = emptyWebsite('Acme');
  website.pages[0]!.nodes = [createNode('hero', 'heroA'), createNode('text', 'textA')];
  return website;
}

describe('fixed template content guard', () => {
  it('allows only text and image replacement in existing nodes', () => {
    const original = example();
    const changed = structuredClone(original);
    changed.pages[0]!.nodes[0]!.props.title = 'Updated headline';
    changed.pages[0]!.nodes[0]!.props.asset = 'asset123';
    expect(preservesFixedTemplate(original, changed, 'pages')).toBe(true);
  });

  it('rejects section insertion, section order changes and layout styles', () => {
    const original = example();
    const inserted = structuredClone(original);
    inserted.pages[0]!.nodes.push(createNode('section', 'newA'));
    expect(preservesFixedTemplate(original, inserted, 'pages')).toBe(false);

    const reordered = structuredClone(original);
    reordered.pages[0]!.nodes.reverse();
    expect(preservesFixedTemplate(original, reordered, 'pages')).toBe(false);

    const styled = structuredClone(original);
    styled.pages[0]!.nodes[0]!.style.background = '#123456';
    expect(preservesFixedTemplate(original, styled, 'pages')).toBe(false);
  });

  it('prevents page deletion, renaming and route edits', () => {
    const original = example();
    const removed = structuredClone(original);
    removed.pages.pop();
    expect(preservesFixedTemplate(original, removed, 'pages')).toBe(false);

    const renamed = structuredClone(original);
    renamed.pages[0]!.path = '/changed';
    expect(preservesFixedTemplate(original, renamed, 'pages')).toBe(false);
  });

  it('allows new uploaded assets but does not allow replacing existing asset records', () => {
    const original = example();
    const appended = structuredClone(original);
    appended.assets.push({
      id: 'asset123',
      assetId: 'c74df5ac-e88f-4d5a-af2e-84b1d7b7f4ec',
      alt: 'Photo',
      width: 120,
      height: 90,
    });
    expect(preservesFixedTemplate(original, appended, 'assets')).toBe(true);

    const tampered = structuredClone(appended);
    tampered.assets[0]!.alt = 'Unexpected replacement';
    expect(preservesFixedTemplate(appended, tampered, 'assets')).toBe(false);
  });

  it('does not allow adding, deleting or reordering business content cards', () => {
    const original = example();
    const changed = structuredClone(original);
    changed.content.push({
      id: 'cardA', kind: 'services', title: 'Example', text: '', published: false,
    });
    expect(preservesFixedTemplate(original, changed, 'content')).toBe(false);
  });
});
