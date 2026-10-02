import { refreshSession } from '@business-os/database/proxy';
export const proxy = refreshSession;
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
