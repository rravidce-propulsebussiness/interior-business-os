import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeploymentEnvironment } from './packages/shared/src/runtime.ts';

// Hostinger supervises this entrypoint. Listen from this same Node process
// rather than spawning "next start" in a child process, which can leave
// managed-hosting gateways waiting for the entrypoint to bind its HTTP port.
// This follows Next.js' documented custom-server API.
const root = dirname(fileURLToPath(import.meta.url));
const service = process.env.BUSINESS_OS_SERVICE?.trim() || 'business-app';
if (!['business-app', 'platform-admin', 'websites'].includes(service)) {
  throw new Error('BUSINESS_OS_SERVICE must be business-app, platform-admin or websites');
}

const portText = process.env.PORT || '3000';
if (!/^[0-9]+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  throw new Error('PORT must be a valid TCP port');
}
const port = Number(portText);
const hostname = '0.0.0.0';
console.log(`[Business OS] Starting ${service} on port ${port} (Node ${process.version}).`);
validateDeploymentEnvironment(process.env, service);

const appDir = resolve(root, 'apps', service);
if (!existsSync(resolve(appDir, '.next', 'BUILD_ID'))) {
  throw new Error(
    `[Business OS] Next.js build missing for ${service}: .next/BUILD_ID not present in published runtime.`,
  );
}

// Resolve the workspace package from the selected app; the repository root
// itself does not declare Next.js as a dependency in pnpm.
const appRequire = createRequire(resolve(appDir, 'package.json'));
let next;
try {
  next = appRequire('next');
} catch (error) {
  console.error('[Business OS] Next.js dependency not available at runtime.');
  throw error;
}

const app = next({ dev: false, dir: appDir, hostname, port });
const handler = app.getRequestHandler();
const server = createServer((req, res) => {
  // Diagnostic boundary: this data-free endpoint is identical to the Next.js
  // health response, but bypasses Next routing, middleware and Supabase.
  // If Hostinger still returns 504, the request never reached this listener.
  const pathname = req.url?.split('?', 1)[0];
  // Only log public diagnostic paths, never URLs with query strings, request
  // bodies, cookies, authorization headers, or private document/token routes.
  const tracked = req.method === 'GET' &&
    (pathname === '/' || pathname === '/login' || pathname === '/register' ||
      pathname === '/api/ready');
  if (tracked) {
    const started = Date.now();
    console.log(`[Business OS] Incoming GET ${pathname}.`);
    const warning = setTimeout(() => {
      if (!res.writableEnded)
        console.error(`[Business OS] GET ${pathname} still pending after 5s.`);
    }, 5000);
    warning.unref();
    res.once('finish', () => {
      console.log(`[Business OS] GET ${pathname} completed: HTTP ${res.statusCode} in ${Date.now() - started}ms.`);
    });
    res.once('close', () => {
      clearTimeout(warning);
      if (!res.writableFinished)
        console.error(`[Business OS] GET ${pathname} connection closed before completion after ${Date.now() - started}ms.`);
    });
  }
  if (pathname === '/api/health' && req.method === 'GET') {
    console.log('[Business OS] Direct HTTP health request received.');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end('{"status":"alive"}');
    return;
  }
  if (pathname === '/api/ready') {
    console.log('[Business OS] Database readiness request reached Node.js.');
  }
  Promise.resolve(handler(req, res)).catch((error) => {
    console.error('[Business OS] Request handling failed:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (!res.writableEnded) res.end('Internal Server Error');
  });
});
server.on('error', (error) => {
  console.error('[Business OS] HTTP server startup error:', error);
  process.exitCode = 1;
});
const shutdown = (signal) => {
  console.log(`[Business OS] Received ${signal}; stopping HTTP server after ${Math.round(process.uptime())}s uptime.`);
  server.close(() => process.exit(0));
};
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => shutdown(signal));

// Hostinger's lsnode.js uses require() to load this ESM entrypoint.
// Avoid top-level await: require(esm) in Node 24 only supports synchronous
// ESM graphs. Prepare Next asynchronously after the module evaluates.
console.log('[Business OS] Preparing Next.js application.');
app.prepare()
  .then(() => {
    server.listen(port, hostname, () => {
      console.log(`[Business OS] HTTP server listening on ${hostname}:${port} for ${service}.`);
    });
  })
  .catch((error) => {
    console.error('[Business OS] Next.js preparation failed:', error);
    process.exitCode = 1;
  });
