import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveDeploymentId,
  validateServerActionsEncryptionKey,
} from './hostinger-deployment.mjs';

// Hostinger currently auto-selects npm for this pnpm workspace.
// Perform the actual frozen workspace install before building one Next.js app.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const service = process.env.BUSINESS_OS_SERVICE?.trim() || 'business-app';
if (!['business-app', 'platform-admin', 'websites'].includes(service)) {
  throw new Error(
    'BUSINESS_OS_SERVICE must be business-app, platform-admin or websites',
  );
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nextDeploymentId = resolveDeploymentId({ cwd: root });
const hasActionKey = validateServerActionsEncryptionKey();
console.log(`[Business OS] Next deployment ID: ${nextDeploymentId}`);
if (!hasActionKey) {
  console.warn(
    '[Business OS] NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is unset. ' +
      'For stable Server Actions across builds/instances, configure a ' +
      'private 32-byte base64 key at BOTH build and runtime.',
  );
}

const runPnpm = (args, overrides = {}) => {
  const result = spawnSync(
    npm,
    ['exec', '--yes', '--package=pnpm@10.34.5', '--', 'pnpm', ...args],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, CI: 'true', ...overrides },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

runPnpm(['install', '--frozen-lockfile', '--prod=false']);

// A production quotation PDF must be the exact premium HTML preview printed
// to A4. The old pdf-lib fallback intentionally cannot meet that contract.
// Provision Chromium headless-shell during the build when a managed Cloudflare
// Browser Rendering PDF provider is not configured. Install in the deployed
// project root, not a transient HOME cache that Hostinger may discard.
if (service === 'business-app') {
  const useCloudflare = process.env.PDF_RENDERER === 'cloudflare-rest' ||
    (process.env.PDF_RENDERER !== 'node' &&
      Boolean(process.env.CF_BROWSER_ACCOUNT_ID && process.env.CF_BROWSER_API_TOKEN));
  if (useCloudflare) {
    console.log('[Business OS] Premium PDFs use configured Cloudflare Browser Rendering.');
  } else {
    const browserPath = resolve(root, '.playwright-browsers');
    console.log('[Business OS] Installing production Chromium headless-shell for premium PDFs.');
    runPnpm(
      ['--filter', '@business-os/business-app', 'exec', 'playwright',
        'install', 'chromium-headless-shell'],
      { PLAYWRIGHT_BROWSERS_PATH: browserPath },
    );
    console.log('[Business OS] Installed premium PDF Chromium runtime at project path.');
  }
}
// Next.js 16 defaults to Turbopack. On Hostinger its PostCSS child worker
// exits before establishing IPC while processing globals.css. The officially
// supported --webpack path avoids that Turbopack-specific process failure.
// Keep each application's usual build script unchanged for local development.
console.log(
  `[Business OS] Building ${service} with Next.js Webpack for Hostinger.`,
);
runPnpm(
  ['--filter', `@business-os/${service}`, 'exec', 'next', 'build', '--webpack'],
  {
    NEXT_DEPLOYMENT_ID: nextDeploymentId,
    // Keep Node workers and native Rust runtimes within shared-host process limits.
    // The flags apply only to the build subprocess, never the running app.
    BUSINESS_OS_HOSTED_BUILD: '1',
    TOKIO_WORKER_THREADS: '2',
    RAYON_NUM_THREADS: '2',
  },
);

const verify = spawnSync(
  process.execPath,
  ['scripts/client-asset-integrity.mjs', service, '--build'],
  {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  },
);
if (verify.error) throw verify.error;
if (verify.status !== 0) process.exit(verify.status || 1);
