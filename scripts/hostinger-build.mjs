import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Hostinger currently auto-selects npm for this pnpm workspace.
// Perform the actual frozen workspace install before building one Next.js app.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const service = process.env.BUSINESS_OS_SERVICE?.trim() || 'business-app';
if (!['business-app', 'platform-admin', 'websites'].includes(service)) {
  throw new Error('BUSINESS_OS_SERVICE must be business-app, platform-admin or websites');
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const runPnpm = (args) => {
  const result = spawnSync(
    npm,
    ['exec', '--yes', '--package=pnpm@10.34.5', '--', 'pnpm', ...args],
    { cwd: root, stdio: 'inherit', env: { ...process.env, CI: 'true' } },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

runPnpm(['install', '--frozen-lockfile', '--prod=false']);
runPnpm(['--filter', `@business-os/${service}`, 'build']);
