import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parsePublicEnvironment } from '@business-os/shared';
import { boundedFetch } from '@business-os/shared/runtime';
import { adminContentSecurityPolicy } from '@business-os/shared/security';
import type { Database } from './generated/database.types';
export async function refreshSession(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = adminContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development',
  );
  request.headers.set('x-request-id', requestId);
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', policy);
  const protect = (response: NextResponse) => {
    response.headers.set('x-request-id', requestId);
    response.headers.set('Content-Security-Policy', policy);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
  if (['/api/health', '/api/ready'].includes(request.nextUrl.pathname))
    return protect(NextResponse.next({ request }));
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return protect(NextResponse.next({ request }));
  const env = parsePublicEnvironment(process.env);
  let response = NextResponse.next({ request });
  const client = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: { fetch: boundedFetch },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          for (const { name, value } of values)
            request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of values)
            response.cookies.set(name, value, {
              ...options,
              sameSite: 'lax',
              secure:
                ['staging', 'production'].includes(process.env.APP_ENV ?? '') ||
                request.nextUrl.protocol === 'https:',
            });
        },
      },
    },
  );
  await client.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store');
  return protect(response);
}
