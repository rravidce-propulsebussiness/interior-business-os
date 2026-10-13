import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const leads = readFileSync(
  fileURLToPath(
    new URL(
      '../apps/business-app/src/app/dashboard/crm/leads/workspace.tsx',
      import.meta.url,
    ),
  ),
  'utf8',
);
const root = new URL(
  '../apps/business-app/src/app/dashboard/crm/leads/',
  import.meta.url,
);

test('lead list retains inline Add and ProPulse but uses separate import routes', () => {
  for (const panel of ['add', 'propulse']) {
    assert.match(leads, new RegExp("leadTool === '" + panel + "'"));
  }
  assert.match(leads, /<QuickAddLead/);
  assert.match(leads, /<ProPulseConnectPanel/);
  assert.doesNotMatch(leads, /<SheetImportForm/);
  assert.doesNotMatch(leads, /leadTool === 'sheet'/);
  assert.match(leads, /href="\/dashboard\/crm\/leads\/upload"/);
  assert.match(leads, /href="\/dashboard\/crm\/leads\/google-sheets"/);

  const oldUpload = readFileSync(
    fileURLToPath(new URL('import/page.tsx', root)),
    'utf8',
  );
  const oldNew = readFileSync(
    fileURLToPath(new URL('new/page.tsx', root)),
    'utf8',
  );
  const oldProPulse = readFileSync(
    fileURLToPath(new URL('propulse/page.tsx', root)),
    'utf8',
  );
  assert.match(oldUpload, /redirect\('\/dashboard\/crm\/leads\/upload'\)/);
  assert.match(oldNew, /panel=add/);
  assert.match(oldProPulse, /panel=propulse/);
});

test('Pipeline is Board View inside Leads, with its old URL redirected', () => {
  const leadPage = readFileSync(
    fileURLToPath(new URL('page.tsx', root)),
    'utf8',
  );
  const board = readFileSync(
    fileURLToPath(new URL('board-view.tsx', root)),
    'utf8',
  );
  const pipeline = readFileSync(
    fileURLToPath(new URL('../pipeline/page.tsx', root)),
    'utf8',
  );
  const layout = readFileSync(
    fileURLToPath(new URL('../layout.tsx', root)),
    'utf8',
  );
  assert.match(leads, /<LeadsBoardView/);
  assert.match(leads, /List View/);
  assert.match(leads, /Board View/);
  assert.doesNotMatch(leads, /href="\/dashboard\/crm\/pipeline"/);
  assert.match(leadPage, /'view'/);
  assert.match(leadPage, /key !== 'view'/);
  assert.match(
    pipeline,
    /redirect\('\/dashboard\/crm\/leads\?' \+ query\.toString\(\)\)/,
  );
  assert.match(pipeline, /query\.set\('view', 'board'\)/);
  assert.doesNotMatch(layout, /\['Pipeline', '\/dashboard\/crm\/pipeline'\]/);
  assert.match(board, /runCrmCommand/);
  assert.match(board, /target\.outcome !== 'open'/);
  assert.match(board, /onOpen\(lead\)/);
});

test('Upload Leads and Google Sheets have distinct protected pages', () => {
  const uploadPage = readFileSync(
    fileURLToPath(new URL('upload/page.tsx', root)),
    'utf8',
  );
  const sheetsPage = readFileSync(
    fileURLToPath(new URL('google-sheets/page.tsx', root)),
    'utf8',
  );
  const pageShell = readFileSync(
    fileURLToPath(new URL('import-page-shell.tsx', root)),
    'utf8',
  );
  const importer = readFileSync(
    fileURLToPath(new URL('import/sheet-import-form.tsx', root)),
    'utf8',
  );
  const leadPage = readFileSync(
    fileURLToPath(new URL('page.tsx', root)),
    'utf8',
  );
  const crmLayout = readFileSync(
    fileURLToPath(new URL('../layout.tsx', root)),
    'utf8',
  );

  assert.match(uploadPage, /method="file"/);
  assert.match(sheetsPage, /method="google"/);
  assert.match(pageShell, /crmServices\('lead.create', true\)/);
  assert.match(pageShell, /<OwnerShell/);
  assert.match(pageShell, /<SheetImportForm/);
  assert.match(pageShell, /\/dashboard\/crm\/leads\/upload/);
  assert.match(pageShell, /\/dashboard\/crm\/leads\/google-sheets/);
  assert.match(leadPage, /label: 'Upload Leads'/);
  assert.match(leadPage, /label: 'Google Sheets'/);
  assert.match(crmLayout, /\['Upload Leads',/);
  assert.match(crmLayout, /\['Google Sheets',/);

  assert.doesNotMatch(importer, /setMethod/);
  assert.doesNotMatch(importer, /crm-import-methods/);
  assert.match(importer, /method === 'file'/);
  assert.match(importer, /onDrop=\{handleDrop\}/);
  assert.match(importer, /readCsv\(pasteText, delimiter\)/);
  assert.match(importer, /importSheetLeads/);
  assert.match(importer, /report\.duplicates/);
  assert.match(importer, /report\.invalid/);
});
