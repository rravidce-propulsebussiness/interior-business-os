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
  console.log(`[Business OS] Received ${signal}; stopping HTTP server.`);
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
