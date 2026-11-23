import { describe, expect, it } from 'vitest';
import { activeProjectRoles } from './project-roles';

describe('activeProjectRoles', () => {
  it('lists only active role assignments from construction_project_read', () => {
    const roles = activeProjectRoles({
      roles: [
        {
          id: 'a',
          user_id: 'u1',
          role: 'quality_inspector',
          active: true,
          version: 1,
        },
        {
          id: 'b',
          user_id: 'u2',
          role: 'site_engineer',
          active: false,
          version: 2,
        },
      ],
    });
    expect(roles.map((row) => row.id)).toEqual(['a']);
  });

  it('returns no roles when the read failed', () => {
    expect(activeProjectRoles(null)).toEqual([]);
  });
});
