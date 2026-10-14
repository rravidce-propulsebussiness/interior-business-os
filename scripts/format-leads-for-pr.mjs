// Temporary CI formatter transport; remove before merging.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = [
  'apps/business-app/src/app/dashboard/crm/leads/leads.css',
  'apps/business-app/src/app/dashboard/crm/leads/page.tsx',
  'apps/business-app/src/app/dashboard/crm/leads/quick-add-action.ts',
  'apps/business-app/src/app/dashboard/crm/leads/quick-add-lead.tsx',
];
execFileSync('pnpm', ['exec', 'prettier', '--write', ...files], {
  stdio: 'inherit',
});
for (const file of files) {
  const base64 = readFileSync(file).toString('base64');
  for (let pos = 0; pos < base64.length; pos += 2000) {
    console.log('LEAD_FORMAT_CAPTURE:' + file + ':' + (pos / 2000) +
      ':' + base64.slice(pos, pos + 2000));
  }
}
