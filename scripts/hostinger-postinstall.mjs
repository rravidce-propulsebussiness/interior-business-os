import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Hostinger sometimes persists "Build command: none" for a monorepo whose
// root launcher makes it look like Express. Its deployment still runs
// "npm install" (and, after npm's Arborist failure, --legacy-peer-deps).
// Run the real frozen pnpm/Next.js build as an npm lifecycle fallback.
// Do not alter development/CI pnpm installs, or recursively rebuild when
// pnpm's own install runs the root postinstall lifecycle.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.env.APP_ENV;
const npmAgent = process.env.npm_config_user_agent ?? '';
const isHostedNpmInstall =
  npmAgent.startsWith('npm/') &&
  process.env.npm_lifecycle_event === 'postinstall' &&
  (stage === 'staging' || stage === 'production') &&
  process.env.SUPABASE_ENVIRONMENT === stage &&
  process.env.HOSTINGER_NESTED_INSTALL !== '1' &&
  process.env.BUSINESS_OS_SKIP_AUTOBUILD !== '1';

if (!isHostedNpmInstall) {
  console.log('[Business OS] Skipping hosted build during this package lifecycle.');
} else {
  console.log(
    '[Business OS] Hosted npm install detected; running frozen pnpm workspace install and selected Next.js build.',
  );
  const result = spawnSync(
    process.execPath,
    [resolve(root, 'scripts/hostinger-build.mjs')],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, HOSTINGER_NESTED_INSTALL: '1' },
    },
  );
  if (result.error) {
    console.error('[Business OS] Hosted postinstall build failed:', result.error.message);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status || 1;
  } else {
    console.log('[Business OS] Selected Next.js production build completed.');
  }
}
