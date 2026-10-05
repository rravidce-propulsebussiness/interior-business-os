import { writeFileSync, readFileSync } from 'node:fs';
import { catalog, migrationFiles, protectedHashes, sha } from './database.mjs';
protectedHashes();
if (!process.env.TEST_DATABASE_URL || process.env.HOSTED_DATABASE_URL)
  throw new Error('REFERENCE_REQUIRES_LOCAL_DATABASE_ONLY');
const u = new URL(process.env.TEST_DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
  throw new Error('REFERENCE_REQUIRES_LOOPBACK_DATABASE');
writeFileSync(
  'scripts/acceptance/schema-reference.json',
  JSON.stringify(
    {
      version: 1,
      migrations: migrationFiles(),
      catalog: catalog(process.env),
      generatedTypesSha256: sha(
        readFileSync('packages/database/src/generated/database.types.ts'),
      ),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Local schema reference written; no hosted acceptance PASS is claimed.',
);
