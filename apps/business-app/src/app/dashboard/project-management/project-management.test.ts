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
  it('opens one portfolio and canonical projects under an authorized group', () => {
    const items = ownerWorkspaceNavigation(
      company(['project.view', 'task.view', 'execution.view']),
    );
    expect(items.find((item) => item.label === 'Project Management')).toEqual({
      label: 'Project Management',
      href: '/dashboard/project-management',
      icon: 'projects',
      children: [
        { label: 'Portfolio Overview', href: '/dashboard/project-management' },
        { label: 'Projects', href: '/dashboard/projects' },
        { label: 'Task Board', href: '/dashboard/project-management/tasks' },
      ],
    });
  });

  it('falls back to the existing task register without execution permission', () => {
    const projects = ownerWorkspaceNavigation(
      company(['project.view', 'task.view']),
    );
    expect(
      projects.find((item) => item.label === 'Project Management')?.children,
    ).toContainEqual({
      label: 'Task Register',
      href: '/dashboard/operations/project_tasks',
    });
  });

  it('never offers the owner portfolio to a role without project.view', () => {
    expect(
      ownerWorkspaceNavigation(company(['task.view'])).find(
        (item) => item.label === 'Project Management',
      ),
    ).toBeUndefined();
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
    expect(projectNav?.children).toHaveLength(2);
    expect(navigation.some((item) => item.label === 'Brochures')).toBe(true);
    expect(navigation.some((item) => item.label === 'Automations')).toBe(true);
    expect(navigation.some((item) => item.label === 'My Work')).toBe(true);
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
