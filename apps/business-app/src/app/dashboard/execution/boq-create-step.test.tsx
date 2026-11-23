import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoqCreateStep } from './boq-create-step';

type Props = ComponentProps<typeof BoqCreateStep>;

const defaults: Props = {
  projects: [
    { id: 'project-a', name: 'Ramya' },
    { id: 'project-b', name: 'Jashwanth Kumar' },
  ],
  projectId: 'project-a',
  title: 'Ramya · Construction BOQ',
  saving: false,
  preparing: false,
  error: '',
  onProjectChange: () => {},
  onTitleChange: () => {},
  onContinue: () => {},
};
const render = (overrides: Partial<Props> = {}) =>
  renderToStaticMarkup(
    createElement(BoqCreateStep, { ...defaults, ...overrides }),
  );

describe('BOQ two-step creation', () => {
  it('shows premium project and final quotation entry without a second BOQ', () => {
    const html = render({
      quoteLabel: 'QT-0025 · Final Quotation',
      floors: 4,
      builtUpSqft: 4356,
    });
    expect(html).toContain('Create New BOQ');
    expect(html).toContain('Project &amp; Quotation Details');
    expect(html).toContain('QT-0025 · Final Quotation');
    expect(html).toContain('4,356 sq ft');
    expect(html).toContain('Continue');
    expect(html).toContain('Ramya · Construction BOQ');
    expect(html.match(/<select\b/g)).toHaveLength(1);
    expect(html.match(/<input\b/g)).toHaveLength(1);
    expect(html).toContain('One Project, One BOQ');
    expect(html).toContain('Open an existing BOQ instead');
    expect(html).not.toContain('Save BOQ');
  });
  it('requires a selected project and a BOQ name', () => {
    const noProject = render({ projectId: '' });
    const noName = render({ title: '   ' });
    expect(noProject).toContain('disabled=""');
    expect(noName).toContain('disabled=""');
  });
  it('waits for quotation preparation and cannot create a duplicate during submission', () => {
    expect(render({ preparing: true })).toContain('Preparing BOQ…');
    expect(render({ saving: true })).toContain('Saving BOQ…');
    expect(render({ preparing: true })).toContain('disabled=""');
    expect(render({ saving: true })).toContain('disabled=""');
  });
  it('shows a server creation error without entering the editor', () => {
    const html = render({ error: 'This project already has a BOQ.' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('This project already has a BOQ.');
    expect(html).not.toContain('BOQ Builder');
  });
  it('shows only eligible projects supplied by BOQ eligibility', () => {
    const html = render({ projects: [{ id: 'project-a', name: 'Ramya' }] });
    expect(html).toContain('Ramya');
    expect(html).not.toContain('Jashwanth Kumar');
  });
});
