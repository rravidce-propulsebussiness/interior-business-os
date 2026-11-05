import { describe, expect, it } from 'vitest';
import { canUseOperations } from './access';

const organizationId = '8f00fa93-8734-44c1-8917-2a4eb6e4c3a5';
const context = {
  userId: '8f00fa93-8734-44c1-8917-2a4eb6e4c3a5',
  organizationId,
  membershipId: '8f00fa93-8734-44c1-8917-2a4eb6e4c3a5',
  membershipStatus: 'active' as const,
  roles: [],
  grants: [
    { permission: 'task.view', scope: { kind: 'organization' as const } },
    { permission: 'task.manage', scope: { kind: 'organization' as const } },
    { permission: 'inventory.view', scope: { kind: 'organization' as const } },
  ],
  entitlements: ['projects', 'purchasing'],
};

describe('project operations access from the active organization context', () => {
  it('allows an owner context to view and manage project tasks', () => {
    expect(canUseOperations(context, 'task.view')).toBe(true);
    expect(canUseOperations(context, 'task.manage')).toBe(true);
  });

  it('denies missing permissions and missing module entitlements', () => {
    expect(canUseOperations(context, 'handover.approve')).toBe(false);
    expect(
      canUseOperations(
        { ...context, entitlements: ['projects'] },
        'inventory.view',
      ),
    ).toBe(false);
    expect(canUseOperations(null, 'task.view')).toBe(false);
  });
});
