/** Supabase Auth uses 4xx errors for expired/invalid sessions. Only
 * infrastructure failures must be surfaced as internal errors, never mistaken
 * for an unauthenticated user (which would unnecessarily log them out). */
export function isAuthServiceFailure(error: { status?: number; code?: string }): boolean {
  const status = error.status;
  return (
    status === undefined ||
    status === 0 ||
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    ['request_timeout', 'over_request_rate_limit', 'unexpected_failure'].includes(
      error.code ?? '',
    )
  );
}
