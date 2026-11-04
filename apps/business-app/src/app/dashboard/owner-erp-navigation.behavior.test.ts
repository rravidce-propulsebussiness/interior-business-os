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
    (item) => item.label === 'ERP Operations',
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
          'purchase_order.view',
          'inventory.view',
          'inspection.view',
          'handover.view',
        ]),
      ),
    ).toEqual({
      label: 'ERP Operations',
      href: '/dashboard/operations',
      icon: 'projects',
      children: [
        { label: 'Site Operations', href: '/dashboard/operations' },
        { label: 'Estimates & Materials', href: '/dashboard/execution' },
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
      { label: 'Site Operations', href: '/dashboard/operations' },
    ]);
  });

  it('hides ERP when project entitlement or active membership is missing', () => {
    expect(erp(company(['execution.view'], ['purchasing']))).toBeUndefined();
    expect(erp(company(['execution.view'], ['projects'], 'inactive'))).toBeUndefined();
  });

  it('never grants access merely because a module entitlement exists', () => {
    expect(erp(company([], ['projects', 'purchasing']))).toBeUndefined();
  });

  it('links a single-permission operator only to their allowed section', () => {
    expect(erp(company(['inspection.view']))?.children).toEqual([
      {
        label: 'Quality Inspections',
        href: '/dashboard/operations/project_inspections',
      },
    ]);
  });
});
