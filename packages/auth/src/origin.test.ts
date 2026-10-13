import { describe, expect, it } from 'vitest';
import { publicAuthOrigin } from './origin';

describe('OAuth public URL selection behind Hostinger', () => {
  const internal = 'http://0.0.0.0:3000/auth/callback?code=private';
  const production = { NODE_ENV: 'production' };

  it('never redirects a production OAuth callback to the internal listener', () => {
    expect(publicAuthOrigin(internal, production)).toBe(
      'https://sghomesinterior.in',
    );
    expect(publicAuthOrigin(internal, { ...production, APP_ORIGIN: 'http://0.0.0.0:3000' }))
      .toBe('https://sghomesinterior.in');
  });

  it('prefers a valid explicit public HTTPS origin even behind a reverse proxy', () => {
    expect(publicAuthOrigin(internal, {
      ...production, APP_ORIGIN: 'https://sghomesinterior.in/',
    })).toBe('https://sghomesinterior.in');
  });

  it('rejects poisoned origins and untrusted incoming hosts', () => {
    expect(publicAuthOrigin('https://evil.example/auth/callback', production)).toBe(
      'https://sghomesinterior.in',
    );
    expect(publicAuthOrigin(internal, {
      ...production, APP_ORIGIN: 'https://evil.example/login?next=other',
    })).toBe('https://sghomesinterior.in');
  });

  it('supports local development, but not proxy-internal staging redirects', () => {
    expect(publicAuthOrigin('http://localhost:3333/auth/google', {
      NODE_ENV: 'development',
    })).toBe('http://localhost:3333');
    expect(() => publicAuthOrigin(internal, {
      APP_ENV: 'staging', NODE_ENV: 'production',
    })).toThrow('APP_ORIGIN');
  });
});
