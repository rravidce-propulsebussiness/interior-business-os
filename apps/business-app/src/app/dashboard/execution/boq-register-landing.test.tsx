import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoqRegisterLanding } from './boq-register-landing';

type Props = ComponentProps<typeof BoqRegisterLanding>;

const base: Props = {
  documents: [
    {
      id: 'jaswanth-boq',
      title: 'Jashwanth Kumar · Construction BOQ',
      project_id: 'jaswanth',
      version: 3,
      updated_at: '2026-11-21T10:00:00Z',
    },
  ],
  projects: [{ id: 'jaswanth', name: 'Jashwanth Kumar · G+3 + Penthouse' }],
  canCreate: true,
  canEdit: true,
  canStartNew: true,
  onView: () => {},
  onEdit: () => {},
};

const markup = (overrides: Partial<Props> = {}) =>
  renderToStaticMarkup(createElement(BoqRegisterLanding, { ...base, ...overrides }));

describe('BOQ register landing', () => {
  it('shows exactly the create action and actual completed BOQ cards', () => {
    const html = markup();
    expect(html).toContain('Create New BOQ');
    expect(html).toContain('Completed BOQs');
    expect(html).toContain('Jashwanth Kumar · G+3 + Penthouse');
    expect(html).toContain('Revision 3');
    expect(html).toContain('View BOQ for Jashwanth Kumar');
    expect(html).toContain('Edit BOQ for Jashwanth Kumar');
    expect(html.match(/class="boq-register-card"/g)).toHaveLength(1);
    expect(html).not.toContain('Construction takeoff');
    expect(html).not.toContain('Review saved measurements');
    expect(html).not.toContain('Arjun Residency');
    expect(html).not.toContain('Maple Villas');
  });

  it('shows saved title when the original project is no longer listed', () => {
    const html = markup({ projects: [] });
    expect(html).toContain('Jashwanth Kumar · Construction BOQ');
  });

  it('keeps Edit hidden for users without estimate-edit permission', () => {
    const html = markup({ canEdit: false });
    expect(html).toContain('View BOQ for Jashwanth Kumar');
    expect(html).not.toContain('Edit BOQ for');
  });

  it('does not offer an active New BOQ without an eligible quoted project', () => {
    const html = markup({ canStartNew: false });
    expect(html).toContain('Create New BOQ');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('href="/dashboard/execution/boq/new"');
  });

  it('never invents entries when no BOQ is saved', () => {
    const html = markup({ documents: [] });
    expect(html).toContain('No BOQs saved yet.');
    expect(html).not.toContain('boq-register-card"');
  });

  it('does not expose creation to users without estimate-create permission', () => {
    const html = markup({ canCreate: false });
    expect(html).not.toContain('Create New BOQ');
    expect(html).toContain('Completed BOQs');
  });
});
