import { describe, expect, it } from 'vitest';
import { createNode, type ComponentType } from '@business-os/website-builder';
import { editableContentFields } from './website-content-fields';

const keys = (type: ComponentType) =>
  editableContentFields(createNode(type, 'example')).map(field => field.key);

describe('visual website editor contextual content fields', () => {
  it('shows only the heading text for a heading', () => {
    expect(keys('heading')).toEqual(['text']);
    const node = createNode('heading', 'heading');
    node.props.text = '';
    node.props.title = 'Legacy headline';
    expect(editableContentFields(node).map(field => field.key)).toEqual(['title']);
  });

  it('offers body text only for paragraphs and destination for buttons', () => {
    expect(keys('text')).toEqual(['text']);
    expect(keys('button')).toEqual(['text', 'href']);
    const button = createNode('button', 'button');
    button.props.label = 'Contact us';
    expect(editableContentFields(button).map(field => field.key)).toEqual(['label', 'href']);
  });

  it('gives hero and content sections meaningful heading and description fields', () => {
    expect(keys('hero')).toEqual(['title', 'subtitle', 'text']);
    expect(keys('card')).toEqual(['title', 'subtitle', 'text']);
    expect(keys('section')).toEqual(['title', 'subtitle', 'text']);
    expect(keys('faq')).toEqual(['title']);
  });

  it('only exposes image descriptions for picture and image logos', () => {
    expect(keys('image')).toEqual(['alt']);
    expect(keys('logo')).toEqual(['text']);
    const logo = createNode('logo', 'logo');
    logo.props.asset = 'exampleAsset';
    expect(editableContentFields(logo).map(field => field.key)).toEqual(['alt']);
  });

  it('never shows irrelevant text controls for spacers and advanced components', () => {
    for (const type of ['divider', 'spacer', 'lead_form', 'navigation', 'custom', 'embed'] as const)
      expect(keys(type)).toEqual([]);
  });

  it('honors field length constraints of the published document schema', () => {
    const fields = editableContentFields(createNode('hero', 'hero'));
    expect(fields.find(field => field.key === 'title')?.maxLength).toBe(300);
    expect(fields.find(field => field.key === 'subtitle')?.maxLength).toBe(1000);
    expect(fields.find(field => field.key === 'text')?.maxLength).toBe(12000);
    expect(editableContentFields(createNode('button', 'button'))
      .find(field => field.key === 'href')?.maxLength).toBe(2048);
  });
});
