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
  it('displays only a project dropdown, a BOQ name, and Continue before editing', () => {
    const html = render();
    expect(html).toContain('Project');
    expect(html).toContain('BOQ name');
    expect(html).toContain('Continue');
    expect(html).toContain('Ramya · Construction BOQ');
    expect(html.match(/<select\b/g)).toHaveLength(1);
    expect(html.match(/<input\b/g)).toHaveLength(1);
    expect(html).not.toContain('BOQ Builder');
    expect(html).not.toContain('Labour Costing');
    expect(html).not.toContain('Foundation');
    expect(html).not.toContain('Save BOQ');
    expect(html).not.toContain('BOQ & Estimating');
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
