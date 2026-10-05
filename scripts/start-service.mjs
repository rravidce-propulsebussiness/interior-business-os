import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { validateDeploymentEnvironment } from '../packages/shared/src/runtime.ts';

const service = process.argv[2];
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
if (
  !['business-app', 'platform-admin', 'websites', 'worker'].includes(service)
) {
  throw new Error('Choose business-app, platform-admin, websites or worker');
}
validateDeploymentEnvironment(process.env, service);
if (process.argv.includes('--check')) {
  console.log(`Deployment configuration valid for ${service}`);
  process.exit(0);
}
const require = createRequire(import.meta.url);
const child =
  service === 'worker'
    ? spawn(
        process.execPath,
        ['scripts/automation-worker.mjs', ...process.argv.slice(3)],
        { stdio: 'inherit', windowsHide: true },
      )
    : spawn(
        process.execPath,
        [
          require.resolve('next/dist/bin/next', {
            paths: [resolve('apps', service)],
          }),
          'start',
          resolve('apps', service),
          ...process.argv.slice(3),
        ],
        { stdio: 'inherit', windowsHide: true },
      );
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('Service could not start');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
