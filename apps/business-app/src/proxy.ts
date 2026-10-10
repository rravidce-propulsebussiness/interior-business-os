import { refreshSessionWithRewrite } from '@business-os/database/proxy';
import { NextResponse, type NextRequest } from 'next/server';
import {
  WORKSPACE_COOKIE,
  WORKSPACE_HOST_HEADER,
  WORKSPACE_SLUG_HEADER,
  workspaceIngress,
} from './workspace-paths';

function centralHosts(): string[] {
  const names = (process.env.BUSINESS_OS_CENTRAL_HOSTNAMES ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (process.env.APP_ORIGIN) {
    try {
      names.push(new URL(process.env.APP_ORIGIN).hostname);
    } catch {
      // Malformed configuration cannot authorize extra platform hosts.
    }
  }
  if (process.env.NODE_ENV !== 'production')
    names.push('localhost', '127.0.0.1');
  return names;
}

export async function proxy(request: NextRequest) {
  // A visitor must not be allowed to supply internal tenant-scope headers.
  request.headers.delete(WORKSPACE_SLUG_HEADER);
  request.headers.delete(WORKSPACE_HOST_HEADER);
  const enabled = process.env.BUSINESS_OS_TENANT_ROUTES_ENABLED === 'true';
  const routing = workspaceIngress({
    host: request.nextUrl.hostname,
    pathname: request.nextUrl.pathname,
    selectedSlug: request.cookies.get(WORKSPACE_COOKIE)?.value ?? null,
    centralHosts: centralHosts(),
    enabled,
    method: request.method,
  });
  if (routing.denyPlatform) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  if (routing.redirect) {
    const url = request.nextUrl.clone();
    url.pathname = routing.redirect;
    return NextResponse.redirect(url, 307);
  }
  if (routing.scope) {
    request.headers.set(
      routing.scope.type === 'slug'
        ? WORKSPACE_SLUG_HEADER
        : WORKSPACE_HOST_HEADER,
      routing.scope.value,
    );
  }
  const rewrite = routing.rewrite
    ? new URL(routing.rewrite + request.nextUrl.search, request.nextUrl.origin)
    : undefined;
  const response = await refreshSessionWithRewrite(request, rewrite);
  if (routing.setSlugCookie) {
    response.cookies.set(WORKSPACE_COOKIE, routing.setSlugCookie, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure:
        process.env.NODE_ENV === 'production' ||
        request.nextUrl.protocol === 'https:',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|__hostinger_diag/).*)',
  ],
};
