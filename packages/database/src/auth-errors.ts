/**
 * Supabase Auth uses 4xx errors for expired or invalid sessions. Only
 * infrastructure failures must surface as internal errors, never as a sign-out.
 */
export function isAuthServiceFailure(error: {
  status?: number | undefined;
  code?: string | undefined;
}): boolean {
  const status = error.status;
  return (
    status === undefined ||
    status === 0 ||
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    [
      'request_timeout',
      'over_request_rate_limit',
      'unexpected_failure',
    ].includes(error.code ?? '')
  );
}
