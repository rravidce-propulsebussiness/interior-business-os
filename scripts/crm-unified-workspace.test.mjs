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
  assert.match(pageShell, /const leadsPath = '\/dashboard\/crm\/leads'/);
  assert.match(pageShell, /const uploadPath = leadsPath \+ '\/upload'/);
  assert.match(pageShell, /const googlePath = leadsPath \+ '\/google-sheets'/);
  // Upload and Google Sheets remain reachable from the Leads workspace,
  // without restoring duplicate sidebar entries removed in the CRM cleanup.
  assert.match(leads, /href="\/dashboard\/crm\/leads\/upload"/);
  assert.match(leads, /href="\/dashboard\/crm\/leads\/google-sheets"/);
  assert.doesNotMatch(leadPage, /label: 'Upload Leads'/);
  assert.doesNotMatch(leadPage, /label: 'Google Sheets'/);
  assert.doesNotMatch(crmLayout, /\['Upload Leads',/);
  assert.doesNotMatch(crmLayout, /\['Google Sheets',/);
  assert.match(leadPage, /label: 'Follow-ups'/);
  assert.doesNotMatch(leadPage, /label: 'Site Visits'/);

  assert.doesNotMatch(importer, /setMethod/);
  assert.doesNotMatch(importer, /crm-import-methods/);
  assert.match(importer, /method === 'file'/);
  assert.match(importer, /onDrop=\{handleDrop\}/);
  assert.match(importer, /readCsv\(pasteText, delimiter\)/);
  assert.match(importer, /importSheetLeads/);
  assert.match(importer, /report\.duplicates/);
  assert.match(importer, /report\.invalid/);
});

test('Leads listing opens the single canonical detail page without duplicate editors', () => {
  assert.match(leads, /router\.push\(path \+ '\/'/);
  assert.match(leads, /onOpen=\{open\}/);
  assert.doesNotMatch(leads, /Open full lead workspace/);
  assert.doesNotMatch(leads, /Open full lead notes and history/);
  assert.doesNotMatch(leads, /crm-detail-pane/);
  assert.doesNotMatch(leads, /crm-detail-editor/);
  const detail = readFileSync(
    fileURLToPath(new URL('[id]/page.tsx', root)),
    'utf8',
  );
  assert.match(detail, /LeadMeetActions/);
  assert.match(detail, /id="lead-followups"/);
  assert.match(detail, /id="lead-site-visits"/);
  assert.match(detail, /id="lead-activity"/);
});

test('legacy CRM overview and commercial response pages redirect to their canonical workspaces', () => {
  const crmPage = readFileSync(
    fileURLToPath(new URL('../page.tsx', root)),
    'utf8',
  );
  const commercialPage = readFileSync(
    fileURLToPath(new URL('../commercial/page.tsx', root)),
    'utf8',
  );
  const layout = readFileSync(
    fileURLToPath(new URL('../layout.tsx', root)),
    'utf8',
  );
  const quotationsPage = readFileSync(
    fileURLToPath(new URL('../../quotations/page.tsx', root)),
    'utf8',
  );
  const leadPage = readFileSync(
    fileURLToPath(new URL('page.tsx', root)),
    'utf8',
  );

  assert.match(crmPage, /redirect\('\/dashboard\/crm\/leads'\)/);
  assert.match(commercialPage, /response_status/);
  assert.match(commercialPage, /redirect\('\/dashboard\/quotations\?/);
  assert.match(commercialPage, /allowedStatuses/);
  assert.doesNotMatch(commercialPage, /<main|Quotation customer responses/);
  assert.doesNotMatch(layout, /crm-shared-navigation/);
  assert.doesNotMatch(leadPage, /label: 'CRM Overview'/);
  assert.match(quotationsPage, /customer_response\.view/);
  assert.match(quotationsPage, /showResponses/);
  assert.match(quotationsPage, /quotation_response_queue/);
  assert.match(quotationsPage, /id="customer-responses"/);
  assert.match(quotationsPage, /p_organization_id: s\.org/);
});
