import { refreshSession } from '@business-os/database/proxy';
export const proxy = refreshSession;
export const config = {
  // Keep the temporary renderer diagnostic out of Auth session handling.
  // All existing application routes keep their original Proxy coverage.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|__hostinger_diag/).*)'],
};
