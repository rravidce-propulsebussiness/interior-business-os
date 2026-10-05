import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { parsePublicEnvironment } from '@business-os/shared';
import { boundedFetch } from '@business-os/shared/runtime';
import type { Database } from './generated/database.types';

/** Fresh public-key client; never inherits staff cookies or an elevated key.
 * Recovery may establish a provider-verified session in this in-memory client only.
 */
export function createPublicDatabase() {
  const env = parsePublicEnvironment(process.env);
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: { fetch: boundedFetch },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export async function createServerDatabase() {
  const env = parsePublicEnvironment(process.env);
  const store = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: { fetch: boundedFetch },
      cookies: {
        getAll: () => store.getAll(),
        setAll(values) {
          // Server Components cannot write cookies. The proxy refreshes them before rendering.
          try {
            for (const { name, value, options } of values)
              store.set(name, value, {
                ...options,
                sameSite: 'lax',
                secure:
                  ['staging', 'production'].includes(
                    process.env.APP_ENV ?? '',
                  ) || options.secure,
              });
          } catch {
            /* read-only Server Component cookie store */
          }
        },
      },
    },
  );
}
