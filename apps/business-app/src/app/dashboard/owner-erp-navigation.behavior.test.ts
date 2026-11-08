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

function erp(context: Context | null) {
  return ownerWorkspaceNavigation(context).find(
    (item) => item.label === 'Construction ERP',
  );
}

describe('ERP uses the existing owner workspace and access policy', () => {
  it('does not expose an ERP module to unauthenticated users', () => {
    expect(ownerWorkspaceNavigation(null)).toEqual([
      { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    ]);
  });

  it('shows authorized ERP destinations under the current owner menu', () => {
    expect(
      erp(
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
      label: 'Construction ERP',
      href: '/dashboard/operations',
      icon: 'building',
      children: [
        { label: 'Site Execution', href: '/dashboard/operations' },
        {
          label: 'BOQ & Estimate Revisions',
          href: '/dashboard/execution/execution_estimate_revisions',
        },
        { label: 'Execution Planner', href: '/dashboard/execution' },
        { label: 'Materials', href: '/dashboard/execution/materials' },
        {
          label: 'Rate Recipes',
          href: '/dashboard/execution/estimation_recipes',
        },
        {
          label: 'Procurement',
          href: '/dashboard/execution/purchase_orders',
        },
        { label: 'Inventory & Stock', href: '/dashboard/operations/stock' },
        {
          label: 'Quality Inspections',
          href: '/dashboard/operations/project_inspections',
        },
        { label: 'Handover', href: '/dashboard/operations/handover_records' },
      ],
    });
  });

  it('hides procurement and stock when purchasing is not entitled', () => {
    const items = erp(
      company(
        ['execution.view', 'purchase_order.view', 'inventory.view'],
        ['projects'],
      ),
    );
    expect(items?.children).toEqual([
      { label: 'Site Execution', href: '/dashboard/operations' },
    ]);
  });

  it('requires the project entitlement and active membership', () => {
    expect(erp(company(['execution.view'], ['purchasing']))).toBeUndefined();
    const inactive = company(['execution.view'], ['projects'], 'inactive');
    expect(erp(inactive)).toBeUndefined();
  });

  it('never grants access merely because a module entitlement exists', () => {
    expect(erp(company([], ['projects', 'purchasing']))).toBeUndefined();
  });

  it('shows only the operator-authorized section', () => {
    expect(erp(company(['inspection.view']))?.children).toEqual([
      {
        label: 'Quality Inspections',
        href: '/dashboard/operations/project_inspections',
      },
    ]);
  });
});
