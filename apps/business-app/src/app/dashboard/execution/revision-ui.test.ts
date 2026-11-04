import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('server-only', () => ({}));
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
type Context = NonNullable<Parameters<typeof ownerWorkspaceNavigation>[0]>;
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const company = (permissions: string[], entitlements = ['projects']): Context => ({
  userId: 'member', organizationId: 'company', membershipStatus: 'active',
  entitlements,
  grants: permissions.map((permission) => ({
    permission, scope: { kind: 'organization' },
  })),
}) as unknown as Context;

describe('permission-aware BOQ presentation', () => {
  it('retains all old URLs and actual server-approved revision commands', () => {
    const list = read('./[entity]/page.tsx');
    const detail = read('./[entity]/[id]/page.tsx');
    const workspace = read('./revision-workspace.tsx');
    expect(list).toContain('<RevisionRegister s={s} data={data} filter={q} />');
    expect(detail).toContain('<RevisionWorkspace s={s} row={row} />');
    for (const check of [
      "s.allowed('estimate.view_cost')",
      "s.allowed('estimate.approve')",
      "s.allowed('estimate.review')",
      "s.allowed('estimate.edit')",
      "s.allowed('estimate.create')",
      "s.allowed('purchase_requisition.create')",
    ]) expect(workspace).toContain(check);
    expect(workspace).toContain("action: 'estimate'");
    expect(workspace).not.toContain('.insert(');
    expect(workspace).not.toContain('.update(');
    expect(workspace).not.toContain('service_role');
  });
  it('hides BOQ menu without grant, active project entitlement and company context', () => {
    const name = 'BOQ & Estimating';
    expect(ownerWorkspaceNavigation(null).some((item) => item.label === name)).toBe(false);
    expect(ownerWorkspaceNavigation(company([])).some((item) => item.label === name)).toBe(false);
    expect(ownerWorkspaceNavigation(company(['estimate.view'], [])).some((item) => item.label === name)).toBe(false);
    expect(ownerWorkspaceNavigation(company(['estimate.view'])).find((item) => item.label === name)?.children)
      .toEqual([
        { label: 'Estimate Revisions', href: '/dashboard/execution/execution_estimate_revisions' },
        { label: 'Execution Planner', href: '/dashboard/execution' },
      ]);
  });
  it('uses shared navigation and scoped styles for execution routes', () => {
    const layout = read('./layout.tsx');
    expect(layout).toContain('<OwnerShell');
    expect(layout).toContain('ownerWorkspaceNavigation(context)');
    expect(layout).toContain('className="execution-workspace"');
    expect(read('./execution-premium.css')).toContain('.execution-workspace');
  });
});
