/** Missing new schema during a rolling deployment, not an authorization fallback. */
export function websiteSchemaPending(error: { code?: string } | null) {
  return (
    !!error &&
    ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code ?? '')
  );
}
