import { describe, expect, it } from 'vitest';
import { googleProviderEnabled } from './google-provider-readiness';

const config = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
};

describe('Google OAuth provider readiness', () => {
  it('recognizes an enabled Google provider', async () => {
    const fetcher: typeof fetch = async (input, init) => {
      expect(String(input)).toBe('https://example.supabase.co/auth/v1/settings');
      expect(init?.headers).toEqual({
        apikey: 'test-public-key',
        Accept: 'application/json',
      });
      expect(init?.cache).toBe('no-store');
      return Response.json({ external: { google: true } });
    };
    expect(await googleProviderEnabled(config, fetcher)).toBe(true);
  });

  it('identifies a disabled provider before the browser sees a raw JSON error', async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({ external: { google: false, email: true } });
    expect(await googleProviderEnabled(config, fetcher)).toBe(false);
  });

  it('does not claim Google is disabled when settings are unavailable', async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error('Transient network failure');
    };
    expect(await googleProviderEnabled(config, fetcher)).toBe(null);
    expect(await googleProviderEnabled(config, async () => new Response('', { status: 503 }))).toBe(null);
  });

  it('does not leak an API key to a non-HTTPS auth host', async () => {
    let called = false;
    const fetcher: typeof fetch = async () => {
      called = true;
      return Response.json({ external: { google: true } });
    };
    expect(
      await googleProviderEnabled(
        { ...config, NEXT_PUBLIC_SUPABASE_URL: 'http://example.test' },
        fetcher,
      ),
    ).toBe(null);
    expect(called).toBe(false);
  });
});
