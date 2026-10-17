import { describe, expect, it } from 'vitest';
import { isAuthServiceFailure } from './auth-errors';

describe('Supabase authentication failure classification', () => {
  it.each([
    { status: 400, code: 'session_not_found' },
    { status: 401, code: 'bad_jwt' },
    { status: 403, code: 'invalid_token' },
    { status: 422, code: 'validation_failed' },
  ])('treats an invalid session as signed out (%j)', (error) => {
    expect(isAuthServiceFailure(error)).toBe(false);
  });

  it.each([
    { status: 0, code: 'network_error' },
    { status: 408, code: 'request_timeout' },
    { status: 429, code: 'over_request_rate_limit' },
    { status: 500, code: 'unexpected_failure' },
    { status: 503, code: 'server_error' },
    { code: 'network_error' },
    { status: 400, code: 'unexpected_failure' },
  ])('does not mistake provider downtime for a signed-out user (%j)', (error) => {
    expect(isAuthServiceFailure(error)).toBe(true);
  });
});
