import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const forbidden = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_DATABASE_URL',
  'QUOTATION_SIGNING_KEY',
  'AUTH_RECOVERY_SIGNING_KEY',
  'WEBSITE_BUILD_SIGNING_KEY',
  'BROCHURE_BUILD_SIGNING_KEY',
  'AUTOMATION_DATABASE_URL',
  'AUTOMATION_EMAIL_API_KEY',
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
  for (const directory of ['.next', '.next-recovery']) {
    const root = `apps/${app}/${directory}/static`;
    if (directory === '.next-recovery' && !existsSync(root)) continue;
    if (!existsSync(root))
      throw new Error(`Build ${app} before checking browser bundles.`);
    for (const file of walk(root).filter((file) => /\.(js|map)$/.test(file))) {
      const content = readFileSync(file, 'utf8');
      if (forbidden.some((value) => content.includes(value)))
        throw new Error(`Server-only credential marker found in ${file}`);
      checked++;
    }
  }
}
console.log(
  `Checked ${checked} browser JavaScript files: no privileged environment names or server secret canary.`,
);
const sourceRoots = [
  'scripts',
  'packages/core/src',
  'packages/auth/src',
  'packages/shared/src',
  'packages/database/src',
  'apps/business-app/src/app/dashboard/automations',
  'apps/business-app/src/app/dashboard/reports',
];
let sourceCount = 0;
for (const root of sourceRoots)
  for (const file of walk(root).filter((file) =>
    /\.(mjs|ts|tsx|map)$/.test(file),
  )) {
    const content = readFileSync(file, 'utf8');
    if (
      /\bre_[A-Za-z0-9]{30,}\b|\bsb_secret_[A-Za-z0-9_-]{25,}\b|postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]{8,}@/i.test(
        content,
      )
    )
      throw new Error(`Possible embedded credential in ${file}`);
    sourceCount++;
  }
console.log(
  `Checked ${sourceCount} worker, email, report and shared source files for embedded provider/database credential patterns.`,
);
