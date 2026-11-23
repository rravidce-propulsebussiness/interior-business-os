type RoleRow = Record<string, unknown> & { id: string };

/** Active role assignments returned by construction_project_read. */
export function activeProjectRoles(value: unknown): RoleRow[] {
  const roles =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>).roles
      : null;
  if (!Array.isArray(roles)) return [];
  return roles.filter(
    (row): row is RoleRow =>
      !!row &&
      typeof row === 'object' &&
      typeof (row as Record<string, unknown>).id === 'string' &&
      (row as Record<string, unknown>).active === true,
  );
}
