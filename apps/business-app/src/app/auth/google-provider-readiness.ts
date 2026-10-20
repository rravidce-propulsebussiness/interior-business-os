/**
 * Supabase Auth exposes its public provider switches at /auth/v1/settings.
 * A missing Google provider is a project configuration issue, not a broken
 * PKCE callback. Detect it before navigating away from the application's UI.
 *
 * null means undetermined (network/settings unavailable). In that case the
 * normal OAuth flow remains available; we never guess that Google is disabled.
 */
export async function googleProviderEnabled(
  env: {
    NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
  } = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
  fetcher: typeof fetch = fetch,
): Promise<boolean | null> {
  const base = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const apiKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!base || !apiKey) return null;

  let settingsUrl: URL;
  try {
    settingsUrl = new URL('/auth/v1/settings', base);
    // Only a configured HTTPS Auth host can receive the public API key.
    if (settingsUrl.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  try {
    const response = await fetcher(settingsUrl.toString(), {
      method: 'GET',
      headers: { apikey: apiKey, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return null;
    const settings: unknown = await response.json();
    if (!settings || typeof settings !== 'object') return null;
    const external = (settings as { external?: unknown }).external;
    if (!external || typeof external !== 'object') return null;
    const google = (external as { google?: unknown }).google;
    return typeof google === 'boolean' ? google : null;
  } catch {
    return null;
  }
}
