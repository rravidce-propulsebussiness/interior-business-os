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
// Next.js 16 defaults to Turbopack. On Hostinger its PostCSS child worker
// exits before establishing IPC while processing globals.css. The officially
// supported --webpack path avoids that Turbopack-specific process failure.
// Keep each application's usual build script unchanged for local development.
console.log(
  `[Business OS] Building ${service} with Next.js Webpack for Hostinger.`,
);
runPnpm(
  ['--filter', `@business-os/${service}`, 'exec', 'next', 'build', '--webpack'],
  { NEXT_DEPLOYMENT_ID: nextDeploymentId },
);
