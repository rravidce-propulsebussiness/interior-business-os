import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const leads = readFileSync(fileURLToPath(new URL('../apps/business-app/src/app/dashboard/crm/leads/workspace.tsx', import.meta.url)), 'utf8');
const root = new URL('../apps/business-app/src/app/dashboard/crm/leads/', import.meta.url);

test('manual, sheet and ProPulse actions open inline without separate lead pages', () => {
  for (const panel of ['add', 'sheet', 'propulse']) {
    assert.match(leads, new RegExp("leadTool === '" + panel + "'"));
  }
  assert.match(leads, /<QuickAddLead/);
  assert.match(leads, /<SheetImportForm/);
  assert.match(leads, /<ProPulseConnectPanel/);
  assert.doesNotMatch(leads, /href=\{path \+ '\/(?:new|import|propulse)'\}/);
  for (const [segment, panel] of [['new', 'add'], ['import', 'sheet'], ['propulse', 'propulse']]) {
    const redirect = readFileSync(fileURLToPath(new URL(segment + '/page.tsx', root)), 'utf8');
    assert.match(redirect, new RegExp('redirect\\(\\x27/dashboard/crm/leads\\?panel=' + panel));
  }
});
