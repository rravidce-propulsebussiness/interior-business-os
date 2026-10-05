import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const offset = Number(process.env.E2E_RECOVERY_PORT_OFFSET ?? 0);
if (!Number.isInteger(offset) || offset < 0 || offset > 20000)
  throw new Error('Invalid recovery test port offset');
// Do not carry unrelated application/provider credentials into the development harness.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      !/SECRET|KEY|PASSWORD|TOKEN|DATABASE|EMAIL|ORIGIN|NEXT_PUBLIC|SUPABASE|APP_ENV|E2E_/.test(
        name,
      ),
  ),
);
const token = randomBytes(32).toString('hex');
env.RECOVERY_FIXTURE_TOKEN = token;
env.E2E_RECOVERY_PORT_OFFSET = String(offset);
env.APP_ENV = 'development';
env.E2E_RECOVERY_BUILD = 'true';
env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${3135 + offset}`;
env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_local_recovery_fixture';
async function run(args, environment) {
  const child = spawn(process.execPath, args, {
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (code !== 0) throw new Error('Local recovery verification failed');
}
const apps = [
  ['platform-admin', 3130],
  ['business-app', 3131],
];
for (const [name, port] of process.argv.includes('--skip-build') ? [] : apps) {
  await run(
    [
      require.resolve('next/dist/bin/next', { paths: [resolve('apps', name)] }),
      'build',
      resolve('apps', name),
    ],
    {
      ...env,
      APP_ORIGIN: `http://127.0.0.1:${port + offset}`,
      AUTH_RECOVERY_SIGNING_KEY: createHash('sha256')
        .update(`${token}:${name}`)
        .digest('hex'),
    },
  );
}
await run(
  [
    require.resolve('@playwright/test/cli'),
    'test',
    '--config',
    'tests/recovery/playwright.config.ts',
  ],
  env,
);
