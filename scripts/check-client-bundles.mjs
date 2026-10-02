import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const forbidden = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_DATABASE_URL',
  'QUOTATION_SIGNING_KEY',
  'WEBSITE_BUILD_SIGNING_KEY',
  'phase8-test-key-not-a-production-secret-123456',
  'phase1-server-secret-canary',
];
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}
let checked = 0;
for (const app of ['business-app', 'platform-admin', 'websites']) {
  const root = `apps/${app}/.next/static`;
  if (!existsSync(root))
    throw new Error(`Build ${app} before checking browser bundles.`);
  for (const file of walk(root).filter((file) => file.endsWith('.js'))) {
    const content = readFileSync(file, 'utf8');
    if (forbidden.some((value) => content.includes(value)))
      throw new Error(`Server-only credential marker found in ${file}`);
    checked++;
  }
}
console.log(
  `Checked ${checked} browser JavaScript files: no privileged environment names or server secret canary.`,
);
