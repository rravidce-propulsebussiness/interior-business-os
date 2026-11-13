import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('server-only', () => ({}));

import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
type Context = NonNullable<Parameters<typeof ownerWorkspaceNavigation>[0]>;
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

function company(
  permissions: string[],
  entitlements: string[] = ['projects'],
): Context {
  return {
    userId: 'test-member',
    organizationId: 'test-company',
    membershipStatus: 'active',
    entitlements,
    grants: permissions.map((permission) => ({
      permission,
      scope: { kind: 'organization' },
    })),
  } as unknown as Context;
}

describe('project management navigation and trusted portfolio boundaries', () => {
  it('keeps one project path: All Projects, then the project timeline', () => {
    const items = ownerWorkspaceNavigation(
      company([
        'project.view',
        'task.view',
        'execution.view',
        'milestone.view',
        'inspection.view',
      ]),
    );
    expect(items.find((item) => item.label === 'Project Management')).toEqual({
      label: 'Project Management',
      href: '/dashboard/projects',
      icon: 'projects',
      children: [{ label: 'All Projects', href: '/dashboard/projects' }],
    });
    const labels = JSON.stringify(items);
    for (const removed of [
      'Task Board',
      'Milestones',
      'ERP: ',
      'Portfolio Overview',
    ])
      expect(labels).not.toContain(removed);
  });

  it('keeps the task register for staff who cannot open projects', () => {
    const taskOnly = ownerWorkspaceNavigation(company(['task.view']));
    expect(
      taskOnly.find((item) => item.label === 'Project Management')?.children,
    ).toContainEqual({
      label: 'Task Register',
      href: '/dashboard/operations/project_tasks',
    });
  });

  it('never offers the owner portfolio to a role without project.view', () => {
    const taskOnly = ownerWorkspaceNavigation(company(['task.view'])).find(
      (item) => item.label === 'Project Management',
    );
    expect(taskOnly?.children).not.toContainEqual({
      label: 'Portfolio Overview',
      href: '/dashboard/project-management',
    });
    expect(
      ownerWorkspaceNavigation(company(['project.view'], [])).find(
        (item) => item.label === 'Project Management',
      ),
    ).toBeUndefined();
  });

  it('shows only destinations for actual source permissions', () => {
    const navigation = ownerWorkspaceNavigation(
      company(
        [
          'project.view',
          'quotation.view',
          'catalog.view',
          'pricing.view',
          'brochure.view',
          'automation.view',
          'notification.view',
        ],
        ['projects', 'quotation', 'catalog', 'pricing', 'brochure'],
      ),
    );
    const projectNav = navigation.find(
      (item) => item.label === 'Project Management',
    );
    expect(projectNav?.children).toHaveLength(1);
    expect(navigation.some((item) => item.label === 'Brochures')).toBe(false);
    expect(navigation.some((item) => item.label === 'Automations')).toBe(true);
    expect(navigation.some((item) => item.label === 'My Work')).toBe(false);
    expect(
      navigation.find((item) => item.label === 'Quotations')?.children,
    ).toContainEqual({
      label: 'Construction Pricing',
      href: '/dashboard/pricing/construction',
    });
  });

  it('uses projectIndex, project-scoped query and permission gates', () => {
    const page = read('./page.tsx');
    expect(page).toContain('await projectIndex()');
    expect(page).toContain("if (!has('project.view', 'projects')) notFound()");
    expect(page).toContain("const canTasks = has('task.view', 'projects')");
    expect(page).toContain(".eq('organization_id', s.org)");
    expect(page).toContain(".in('project_id', ids)");
    expect(page).toContain('coverage');
    expect(page).not.toContain('createClient({ serviceRole');
    expect(page).not.toContain('service_role');
    expect(page).not.toContain('window.location');
  });
});
