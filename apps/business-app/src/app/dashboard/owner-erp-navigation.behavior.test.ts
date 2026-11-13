import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { ownerWorkspaceNavigation } from './owner-workspace-navigation';

type Context = NonNullable<Parameters<typeof ownerWorkspaceNavigation>[0]>;

function company(
  permissions: string[],
  entitlements: string[] = ['projects', 'purchasing'],
  membershipStatus = 'active',
): Context {
  return {
    userId: 'owner-1',
    organizationId: 'company-1',
    membershipStatus,
    entitlements,
    grants: permissions.map((permission) => ({
      permission,
      scope: { kind: 'organization' },
    })),
  } as unknown as Context;
}

function module(context: Context | null, label: string) {
  return ownerWorkspaceNavigation(context).find((item) => item.label === label);
}

function projectManagement(context: Context | null) {
  return module(context, 'Project Management');
}

function boq(context: Context | null) {
  return module(context, 'BOQ & Estimating');
}

describe('ERP uses the existing owner workspace and access policy', () => {
  it('does not expose an ERP module to unauthenticated users', () => {
    expect(ownerWorkspaceNavigation(null)).toEqual([
      { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    ]);
  });

  it('keeps project execution destinations inside Project Management', () => {
    expect(
      projectManagement(
        company([
          'execution.view',
          'estimate.view',
          'material.view',
          'estimate.manage_recipes',
          'purchase_order.view',
          'inventory.view',
          'inspection.view',
          'handover.view',
        ]),
      ),
    ).toEqual({
      label: 'Project Management',
      href: '/dashboard/operations',
      icon: 'projects',
      children: [
        { label: 'ERP: Site Execution', href: '/dashboard/operations' },
        { label: 'ERP: Execution Planner', href: '/dashboard/execution' },
        { label: 'ERP: Materials', href: '/dashboard/execution/materials' },
        {
          label: 'ERP: Procurement',
          href: '/dashboard/execution/purchase_orders',
        },
        {
          label: 'ERP: Inventory & Stock',
          href: '/dashboard/operations/stock',
        },
        {
          label: 'ERP: Quality Inspections',
          href: '/dashboard/operations/project_inspections',
        },
        {
          label: 'ERP: Handover',
          href: '/dashboard/operations/handover_records',
        },
      ],
    });
  });

  it('shows BOQ revisions and rate recipes in their own menu', () => {
    const context = company(['estimate.view', 'estimate.manage_recipes']);
    expect(boq(context)).toEqual({
      label: 'BOQ & Estimating',
      href: '/dashboard/execution/execution_estimate_revisions',
      icon: 'calculator',
      children: [
        {
          label: 'BOQ & Estimate Revisions',
          href: '/dashboard/execution/execution_estimate_revisions',
        },
        {
          label: 'Rate Recipes',
          href: '/dashboard/execution/estimation_recipes',
        },
      ],
    });
    expect(projectManagement(context)).toEqual({
      label: 'Project Management',
      href: '/dashboard/execution',
      icon: 'projects',
      children: [
        { label: 'ERP: Execution Planner', href: '/dashboard/execution' },
      ],
    });
  });

  it('hides procurement and stock when purchasing is not entitled', () => {
    const items = projectManagement(
      company(
        ['execution.view', 'purchase_order.view', 'inventory.view'],
        ['projects'],
      ),
    );
    expect(items?.children).toEqual([
      { label: 'ERP: Site Execution', href: '/dashboard/operations' },
    ]);
  });

  it('requires the project entitlement and active membership', () => {
    expect(
      projectManagement(company(['execution.view'], ['purchasing'])),
    ).toBeUndefined();
    const inactive = company(['execution.view'], ['projects'], 'inactive');
    expect(projectManagement(inactive)).toBeUndefined();
  });

  it('never grants access merely because a module entitlement exists', () => {
    expect(
      projectManagement(company([], ['projects', 'purchasing'])),
    ).toBeUndefined();
  });

  it('shows only the operator-authorized section', () => {
    expect(projectManagement(company(['inspection.view']))?.children).toEqual([
      {
        label: 'ERP: Quality Inspections',
        href: '/dashboard/operations/project_inspections',
      },
    ]);
  });
});
