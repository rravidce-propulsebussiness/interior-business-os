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

test('manual, sheet and ProPulse actions open inline without separate lead pages', () => {
  for (const panel of ['add', 'sheet', 'propulse']) {
    assert.match(leads, new RegExp("leadTool === '" + panel + "'"));
  }
  assert.match(leads, /<QuickAddLead/);
  assert.match(leads, /<SheetImportForm/);
  assert.match(leads, /<ProPulseConnectPanel/);
  assert.doesNotMatch(leads, /href=\{path \+ '\/(?:new|import|propulse)'\}/);
  for (const [segment, panel] of [
    ['new', 'add'],
    ['import', 'sheet'],
    ['propulse', 'propulse'],
  ]) {
    const redirect = readFileSync(
      fileURLToPath(new URL(segment + '/page.tsx', root)),
      'utf8',
    );
    assert.match(
      redirect,
      new RegExp('redirect\\(\\x27/dashboard/crm/leads\\?panel=' + panel),
    );
  }
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
