import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parsePublicEnvironment } from '@business-os/shared';
import { boundedFetch } from '@business-os/shared/runtime';
import { adminContentSecurityPolicy } from '@business-os/shared/security';
import type { Database } from './generated/database.types';
export async function refreshSession(request: NextRequest, rewriteTarget?: URL) {
  const debugPublicPage =
    request.method === 'GET' &&
    (request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/login');
  const diagnosticStart = Date.now();
  if (debugPublicPage)
    console.log(
      `[Business OS] Next proxy entered ${request.nextUrl.pathname}.`,
    );
  const requestId = crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = adminContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development',
  );
  request.headers.set('x-request-id', requestId);
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', policy);
  const responseForRequest = () =>
    rewriteTarget
      ? NextResponse.rewrite(rewriteTarget, { request })
      : NextResponse.next({ request });
  const protect = (response: NextResponse) => {
    response.headers.set('x-request-id', requestId);
    response.headers.set('Content-Security-Policy', policy);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
  if (['/api/health', '/api/ready'].includes(request.nextUrl.pathname))
    return protect(responseForRequest());
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return protect(responseForRequest());
  const env = parsePublicEnvironment(process.env);
  let response = responseForRequest();
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
          response = responseForRequest();
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
  if (debugPublicPage)
    console.log(
      `[Business OS] Next proxy requesting authenticated session for ${request.nextUrl.pathname}.`,
    );
  try {
    await client.auth.getUser();
  } finally {
    if (debugPublicPage)
      console.log(
        `[Business OS] Next proxy session check finished for ${request.nextUrl.pathname} after ${Date.now() - diagnosticStart}ms.`,
      );
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return protect(response);
}
