import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeploymentEnvironment } from './packages/shared/src/runtime.ts';

// Hostinger runs this Node entrypoint, not the Next.js CLI directly.
// Launch Next in one child instead of server -> launcher -> Next to reduce
// shared-hosting process pressure and make startup failures visible in logs.
const root = dirname(fileURLToPath(import.meta.url));
const service = process.env.BUSINESS_OS_SERVICE?.trim() || 'business-app';
if (!['business-app', 'platform-admin', 'websites'].includes(service)) {
  throw new Error('BUSINESS_OS_SERVICE must be business-app, platform-admin or websites');
}

const port = process.env.PORT || '3000';
if (!/^\\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

console.log(`[Business OS] Starting ${service} (Node ${process.version}, port ${port}).`);
validateDeploymentEnvironment(process.env, service);

const appDir = resolve(root, 'apps', service);
const buildId = resolve(appDir, '.next', 'BUILD_ID');
if (!existsSync(buildId)) {
  throw new Error(`Next.js build missing for ${service}: .next/BUILD_ID was not published. Check Hostinger runtime artifacts.`);
}

const require = createRequire(import.meta.url);
let nextCli;
try {
  nextCli = require.resolve('next/dist/bin/next', { paths: [appDir] });
} catch (error) {
  console.error('[Business OS] Next.js runtime dependency missing from the published artifact.');
  throw error;
}

console.log(`[Business OS] Production build and runtime found for ${service}; launching Next.js.`);
const child = spawn(
  process.execPath,
  [nextCli, 'start', appDir, '--hostname', '0.0.0.0', '--port', port],
  { cwd: root, stdio: 'inherit', env: process.env },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error('[Business OS] Failed to launch Next.js:', error.message);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  console.error(`[Business OS] Next.js exited (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`);
  process.exitCode = code ?? 1;
});
