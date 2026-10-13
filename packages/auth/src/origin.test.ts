import { describe, expect, it } from 'vitest';
import { publicAuthOrigin } from './origin';

describe('OAuth public URL selection behind Hostinger', () => {
  const internal = 'http://0.0.0.0:3000/auth/callback?code=private';
  const production = { NODE_ENV: 'production' };
  const expected = 'https://sghomesinterior.in';

  it('never redirects a production OAuth callback to the internal listener', () => {
    expect(publicAuthOrigin(internal, production)).toBe(expected);
    const invalid = { ...production, APP_ORIGIN: 'http://0.0.0.0:3000' };
    expect(publicAuthOrigin(internal, invalid)).toBe(expected);
  });

  it('prefers valid public HTTPS even behind an internal reverse proxy', () => {
    const configured = {
      ...production,
      APP_ORIGIN: 'https://sghomesinterior.in/',
    };
    expect(publicAuthOrigin(internal, configured)).toBe(expected);
  });

  it('rejects poisoned origins and untrusted incoming hosts', () => {
    const malicious = 'https://evil.example/auth/callback';
    expect(publicAuthOrigin(malicious, production)).toBe(expected);
    const invalid = {
      ...production,
      APP_ORIGIN: 'https://evil.example/login?next=other',
    };
    expect(publicAuthOrigin(internal, invalid)).toBe(expected);
  });

  it('supports local development but rejects proxy-internal staging', () => {
    const development = { NODE_ENV: 'development' };
    const local = 'http://localhost:3333/auth/google';
    expect(publicAuthOrigin(local, development)).toBe(
      'http://localhost:3333',
    );
    const staging = { APP_ENV: 'staging', NODE_ENV: 'production' };
    expect(() => publicAuthOrigin(internal, staging)).toThrow('APP_ORIGIN');
  });
});
