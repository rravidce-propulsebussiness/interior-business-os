// Keep legacy /favicon.ico requests on the same host as the generated Next.js
// icon.svg metadata asset. The browser's automatic favicon request is separate
// from login and must not rely on session or Supabase configuration.
export function GET() {
  return new Response(null, {
    status: 307,
    headers: {
      Location: '/icon.svg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
