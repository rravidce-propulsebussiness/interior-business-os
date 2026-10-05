import { isPublicKey } from './runtime';
import type { Environment } from './runtime';

export function liveness() {
  return Response.json(
    { status: 'alive' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** A data-free invoker RPC exercises PostgREST and the DB; never uses a service key. */
export function createReadiness(env: Environment, probe: typeof fetch = fetch) {
  let pending: Promise<boolean> | undefined;
  let cached: { until: number; ok: boolean } | undefined;
  return async function readiness() {
    if (!cached || cached.until <= Date.now()) {
      pending ??= (async () => {
        try {
          const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '');
          const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
          if (!['http:', 'https:'].includes(url.protocol) || !isPublicKey(key))
            return false;
          const response = await probe(
            new URL('/rest/v1/rpc/deployment_readiness', url),
            {
              headers: {
                apikey: key,
                ...(key.split('.').length === 3
                  ? { Authorization: `Bearer ${key}` }
                  : {}),
              },
              cache: 'no-store',
              redirect: 'error',
              signal: AbortSignal.timeout(4000),
            },
          );
          return response.ok && (await response.text()) === 'true';
        } catch {
          return false;
        }
      })();
      const ok = await pending;
      cached = { until: Date.now() + 5000, ok };
      pending = undefined;
    }
    return Response.json(
      { status: cached.ok ? 'ready' : 'unavailable' },
      {
        status: cached.ok ? 200 : 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' },
      },
    );
  };
}
