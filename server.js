import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeploymentEnvironment } from './packages/shared/src/runtime.ts';
import { checkClientAssetsAtStartup } from './scripts/client-asset-integrity.mjs';

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

// Keep Playwright pointed at the exact browser copied with the deployed
// project, independent of Hostinger's transient user HOME/cache directory.
const deployedBrowserPath = resolve(root, '.playwright-browsers');
if (service === 'business-app' && existsSync(deployedBrowserPath)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = deployedBrowserPath;
  console.log('[Business OS] Premium PDF Chromium bundle is available.');
} else if (service === 'business-app' &&
  process.env.PDF_RENDERER !== 'cloudflare-rest' &&
  !(process.env.CF_BROWSER_ACCOUNT_ID && process.env.CF_BROWSER_API_TOKEN)) {
  console.warn('[Business OS] Premium PDF renderer unavailable; build must install Chromium or configure Browser Rendering.');
}

const appDir = resolve(root, 'apps', service);
if (!existsSync(resolve(appDir, '.next', 'BUILD_ID'))) {
  throw new Error(
    `[Business OS] Missing Next.js build artifact for ${service}. Inspect Hostinger published files.`,
  );
}

// A browser asset mismatch is important, but must not take ALL routes offline.
// Builds continue to fail strictly on invalid chunks; runtime can still serve
// useful pages and health endpoints while administrators correct a bad deploy.
const clientAssets = checkClientAssetsAtStartup(appDir);
if (clientAssets.ok) {
  console.log(
    `[Business OS] Verified ${clientAssets.count} client JavaScript chunks against build manifest.`,
  );
}

// The release ID is compiled into the Next.js build. Recover it from the
// published artifact at process startup so build/runtime stay on the same
// deployment even when Hostinger does not persist build-only environment.
const releaseManifest = resolve(appDir, '.next', 'required-server-files.json');
if (existsSync(releaseManifest)) {
  const manifest = JSON.parse(readFileSync(releaseManifest, 'utf8'));
  const builtId = manifest?.config?.deploymentId;
  if (typeof builtId === 'string' && builtId.length > 0) {
    if (
      process.env.NEXT_DEPLOYMENT_ID &&
      process.env.NEXT_DEPLOYMENT_ID !== builtId
    ) {
      throw new Error(
        '[Business OS] Runtime NEXT_DEPLOYMENT_ID does not match the deployed Next.js build.',
      );
    }
    process.env.NEXT_DEPLOYMENT_ID = builtId;
    console.log(`[Business OS] Running deployment ${builtId}.`);
  }
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
