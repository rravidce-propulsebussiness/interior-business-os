import { refreshSessionWithRewrite } from '@business-os/database/proxy';
import { isManagedWebsiteHost } from './public-website-hosts';
import { publicAuthOrigin } from '@business-os/auth/origin';
import { NextResponse, type NextRequest } from 'next/server';
import {
  requestErrorName,
  requestLogCategory,
  requestLogMethod,
} from './request-log';
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
  // Record a safe request category before checking the session so even
  // hung or failed dashboard navigations leave evidence on stdout.
  const category = requestLogCategory(request.nextUrl.pathname);
  const requestId = crypto.randomUUID();
  const start = Date.now();
  if (category)
    console.log(
      '[Business OS] http.request.start id=' + requestId +
      ' category=' + category +
      ' method=' + requestLogMethod(request.method) +
      ' pid=' + process.pid,
    );
  // A visitor must not be allowed to supply internal tenant-scope headers.
  request.headers.delete(WORKSPACE_SLUG_HEADER);
  request.headers.delete(WORKSPACE_HOST_HEADER);
  // Published company websites share this Next.js process but must never
  // enter workspace authentication or the platform route tree. Opt-in only
  // after wildcard DNS and HTTPS are configured and checked.
  const publicWebsiteRouting =
    process.env.BUSINESS_OS_PUBLIC_WEBSITE_ROUTING_ENABLED === 'true';
  const baseDomain =
    process.env.BUSINESS_OS_PUBLIC_WEBSITE_BASE_DOMAIN ?? 'sghomesinterior.in';
  const host = request.headers.get('host') ?? request.nextUrl.hostname;
  if (request.nextUrl.pathname === '/public-site' ||
      request.nextUrl.pathname.startsWith('/public-site/')) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  if (publicWebsiteRouting && isManagedWebsiteHost(host, baseDomain)) {
    // Keep the original Host header intact: website_public/website_asset_public
    // require an exact registered hostname. No workspace cookies or headers
    // are injected into public site responses.
    const target = request.nextUrl.clone();
    target.pathname =
      '/public-site' +
      (request.nextUrl.pathname === '/' ? '' : request.nextUrl.pathname);
    const response = NextResponse.rewrite(target, {
      request: { headers: request.headers },
    });
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self'; media-src 'self'; " +
      "connect-src 'self'; frame-src 'self' https://www.youtube-nocookie.com " +
      "https://www.google.com https://www.openstreetmap.org; object-src 'none'; " +
      "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    return response;
  }
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
    // Hostinger may expose the internal Next listener as request.nextUrl.origin.
    // Workspace redirects are for the central platform host, so always use
    // its validated public origin instead of the reverse-proxy listener.
    const url = new URL(routing.redirect, publicAuthOrigin(request.url));
    url.search = request.nextUrl.search;
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
  let response: NextResponse;
  try {
    response = await refreshSessionWithRewrite(request, rewrite);
  } catch (error) {
    console.error(
      '[Business OS] http.proxy.error id=' + requestId +
      ' category=' + (category ?? 'other') +
      ' name=' + requestErrorName(error) +
      ' duration_ms=' + (Date.now() - start),
    );
    throw error;
  }
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
  if (category)
    console.log(
      '[Business OS] http.proxy.complete id=' + requestId +
      ' category=' + category +
      ' duration_ms=' + (Date.now() - start),
    );
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|__hostinger_diag/).*)',
  ],
};
