import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Hostinger's Node.js app runtime expects an entry file at the repository root.
// Keep the existing production launcher as the only application startup path.
const root = dirname(fileURLToPath(import.meta.url));
const service = process.env.BUSINESS_OS_SERVICE?.trim() || 'business-app';
if (!['business-app', 'platform-admin', 'websites'].includes(service)) {
  throw new Error('BUSINESS_OS_SERVICE must be business-app, platform-admin or websites');
}

const port = process.env.PORT || '3000';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

const child = spawn(
  process.execPath,
  [
    resolve(root, 'scripts/start-service.mjs'),
    service,
    '--hostname',
    '0.0.0.0',
    '--port',
    port,
  ],
  { cwd: root, stdio: 'inherit', env: process.env },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error('Business OS service could not start:', error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
