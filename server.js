import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeploymentEnvironment } from './packages/shared/src/runtime.ts';

// Hostinger's lsnode.js loads this entry file with require(esm).
// Do not use top-level await. Let Next.js run its own native HTTP router
// rather than the custom next({ dir }).getRequestHandler() wrapper, which
// emitted status 200 with no body or Content-Type for all Next-rendered routes.
const root = dirname(fileURLToPath(import.meta.url));
const service = process.env.BUSINESS_OS_SERVICE?.trim() || 'business-app';
if (!['business-app', 'platform-admin', 'websites'].includes(service)) {
  throw new Error(
    'BUSINESS_OS_SERVICE must be business-app, platform-admin or websites',
  );
}

const portText = process.env.PORT || '3000';
if (
  !/^[0-9]+$/.test(portText) ||
  Number(portText) < 1 ||
  Number(portText) > 65535
) {
  throw new Error('PORT must be a valid TCP port');
}
const port = Number(portText);
const hostname = '0.0.0.0';
console.log(
  `[Business OS] Starting native Next.js server for ${service} on ${hostname}:${port} (Node ${process.version}).`,
);
validateDeploymentEnvironment(process.env, service);

const appDir = resolve(root, 'apps', service);
if (!existsSync(resolve(appDir, '.next', 'BUILD_ID'))) {
  throw new Error(
    `[Business OS] Missing Next.js build artifact for ${service}. Inspect Hostinger published files.`,
  );
}

const appRequire = createRequire(resolve(appDir, 'package.json'));
let startServer;
try {
  // Next.js' own production 'next start' executable uses this module.
  ({ startServer } = appRequire('next/dist/server/lib/start-server'));
} catch (error) {
  console.error('[Business OS] Native Next.js server module unavailable.');
  throw error;
}

// A native server sets up routing, request/response handling and the HTTP
// listener in the same Node process supervised by Hostinger. Do not spawn.
startServer({
  dir: appDir,
  isDev: false,
  port,
  hostname,
  allowRetry: false,
})
  .then(() => {
    console.log(
      `[Business OS] Native Next.js server ready for ${service} on port ${port}.`,
    );
  })
  .catch((error) => {
    console.error('[Business OS] Native Next.js startup failed:', error);
    process.exitCode = 1;
  });
