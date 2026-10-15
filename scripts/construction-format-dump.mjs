// Temporary CI-only formatting artifact for Phase 12. This helper
// prints the exact Prettier output of changed TSX/TS files so the feature
// branch can be updated through the authenticated GitHub connector.
// Remove this script and restore the original package script after use.
import { readFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';

const paths = [
  'apps/business-app/src/app/client/projects/[projectId]/page.tsx',
  'apps/business-app/src/app/client/projects/page.tsx',
  'apps/business-app/src/app/dashboard/projects/[id]/site/construction-client-access-actions.ts',
  'apps/business-app/src/app/dashboard/projects/[id]/site/construction-client-access-panel.tsx',
  'apps/business-app/src/app/dashboard/projects/[id]/site/page.tsx',
  'apps/business-app/src/app/login/page.tsx',
];
for (const path of paths) {
  const before = readFileSync(path, 'utf8');
  const output = await format(before, {
    ...(await resolveConfig(path)),
    filepath: path,
  });
  if (output === before) continue;
  const encoded = Buffer.from(output, 'utf8').toString('base64');
  const pieces = encoded.match(/.{1,1500}/g) ?? [];
  pieces.forEach((piece, index) =>
    console.log(`@@PRETTIER|${path}|${index}|${pieces.length}|${piece}@@`),
  );
}
