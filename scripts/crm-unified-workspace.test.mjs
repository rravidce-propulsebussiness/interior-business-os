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
  assert.match(leads, /List view/);
  assert.match(leads, /Board view/);
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
  const unifiedNav = readFileSync(
    fileURLToPath(
      new URL(
        '../apps/business-app/src/app/dashboard/leads-navigation.ts',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  assert.match(leadPage, /leadsNavigation/);
  assert.doesNotMatch(unifiedNav, /label: 'Follow-ups'/);
  assert.doesNotMatch(unifiedNav, /label: 'Site Visits'/);

  assert.doesNotMatch(importer, /setMethod/);
  assert.doesNotMatch(importer, /crm-import-methods/);
  assert.match(importer, /method === 'file'/);
  assert.match(importer, /onDrop=\{handleDrop\}/);
  assert.match(importer, /readCsv\(pasteText, delimiter\)/);
  assert.match(importer, /importSheetLeads/);
  assert.match(importer, /report\.duplicates/);
  assert.match(importer, /report\.invalid/);
});

test('Leads listing has one preview drawer and keeps canonical history, without duplicate editors', () => {
  const drawer = readFileSync(fileURLToPath(new URL('lead-details-drawer.tsx', root)), 'utf8');
  assert.match(leads, /<LeadDetailsDrawer/);
  assert.match(drawer, /encodeURIComponent\(lead\.id\)/);
  assert.match(drawer, /<LeadQuotePreview/);
  assert.match(leads, /onOpen=\{open\}/);
  assert.doesNotMatch(leads, /Open full lead workspace/);
  assert.doesNotMatch(leads, /Open full lead notes and history/);
  assert.doesNotMatch(leads, /crm-detail-pane/);
  assert.doesNotMatch(leads, /crm-detail-editor/);
  const detail = readFileSync(
    fileURLToPath(new URL('[id]/page.tsx', root)),
    'utf8',
  );
  // Lead detail remains a focused history view. Follow-ups, priority,
  // call logging and quote previews are accessible from the listing.
  assert.match(detail, /<LeadHistoryTimeline/);
  assert.match(detail, /<LeadUpdateComposer/);
  assert.match(detail, /<LeadQuotePreview/);
  assert.match(detail, /<LeadFollowUpSetter/);
  assert.match(detail, /<LeadStageSelect/);
  assert.doesNotMatch(detail, /<LeadMeetActions/);
  assert.doesNotMatch(detail, /Daily actions/);
  assert.match(leads, /<LeadQuotePreview/);
  assert.match(leads, /<LeadStageSelect/);
  assert.doesNotMatch(leads, /<LeadAssigneeSelect/);
  assert.match(leads, /<LeadPrioritySelect/);
  assert.doesNotMatch(leads, /name="converted"/);
  assert.doesNotMatch(leads, /name="assigned_to"/);
  assert.match(leads, /<LeadUpdateComposer/);
});

test('mobile lead quotation is one full-width field, and Priority uses the Stage control', () => {
  const controls = readFileSync(
    fileURLToPath(new URL('lead-inline-controls.tsx', root)),
    'utf8',
  );
  const styles = readFileSync(
    fileURLToPath(new URL('leads-premium.css', root)),
    'utf8',
  );
  assert.match(leads, /className="crm-mobile-quotation"/);
  assert.match(leads, /gridColumn: '1 \/ -1'/);
  assert.match(leads, /aria-label=\{'Prepare quotation for ' \+ lead\.name\}/);
  assert.match(leads, /minHeight: 46/);
  assert.match(leads, /width: '100%'/);
  assert.match(styles, /\.crm-leads-root \.crm-mobile-quotation \.crm-quote-create/);
  assert.match(controls, /export function LeadPrioritySelect/);
  assert.match(controls, /className="crm-inline-field"/);
  assert.doesNotMatch(controls, /className="crm-inline-priority"/);
  assert.doesNotMatch(controls, /className=\{'crm-premium-priority-select/);
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
  assert.match(quotationsPage, /commercial\.search/);
  assert.match(quotationsPage, /quotation_revisions/);
  assert.match(quotationsPage, /quotation\.view/);
});

test('invited clients can open only explicitly granted project records', () => {
  const portalSql = readFileSync(
    fileURLToPath(
      new URL(
        '../packages/database/supabase/migrations/20261015000700_client_project_portal.sql',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const inviteUi = readFileSync(
    fileURLToPath(
      new URL(
        '../apps/business-app/src/app/dashboard/customers/[id]/client-access.tsx',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const projectPage = readFileSync(
    fileURLToPath(
      new URL(
        '../apps/business-app/src/app/client/projects/[id]/page.tsx',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const loginPage = readFileSync(
    fileURLToPath(
      new URL(
        '../apps/business-app/src/app/client/login/page.tsx',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const home = readFileSync(
    fileURLToPath(
      new URL('../apps/business-app/src/app/client/page.tsx', import.meta.url),
    ),
    'utf8',
  );

  // The project UUID and the verified email must match on every read path;
  // no customer-level wildcard is allowed to expose sibling projects.
  assert.match(portalSql, /a\.project_id=p_project and a\.active/);
  assert.match(portalSql, /a\.email=private\.client_portal_verified_email\(\)/);
  assert.match(portalSql, /p\.customer_id=a\.customer_id/);
  assert.match(
    portalSql,
    /if not private\.client_portal_accessible\(p_project_id\)/,
  );
  assert.match(
    portalSql,
    /not private\.client_portal_accessible\(m\.project_id\)/,
  );
  assert.match(inviteUi, /'\/client\/projects\/' \+ item\.project_id/);
  const clientForm = readFileSync(
    fileURLToPath(
      new URL('../apps/business-app/src/app/client/client-auth-form.tsx', import.meta.url),
    ),
    'utf8',
  );
  assert.match(loginPage, /z\.uuid\(\)\.safeParse\(query\.project\)/);
  assert.match(clientForm, /'\/client\/projects\/'\+projectId/);
  assert.match(projectPage, /client_portal_project/);
  assert.match(projectPage, /'\/client\/login\?project=' \+ id/);
  assert.match(home, /if \(projects\.length === 1\) redirect/);
});

test('client timeline uses only the invited project’s canonical workflow', () => {
  const migration = readFileSync(
    fileURLToPath(
      new URL(
        '../packages/database/supabase/migrations/20261015000900_client_portal_timeline.sql',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const project = readFileSync(
    fileURLToPath(
      new URL(
        '../apps/business-app/src/app/client/projects/[id]/page.tsx',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const timeline = readFileSync(
    fileURLToPath(
      new URL(
        '../apps/business-app/src/app/client/project-timeline.tsx',
        import.meta.url,
      ),
    ),
    'utf8',
  );

  assert.match(migration, /private\.client_portal_accessible\(p_project_id\)/);
  assert.match(migration, /where p\.id=p_project_id/);
  assert.match(
    migration,
    /s\.organization_id=p\.organization_id and s\.project_id=p\.id/,
  );
  assert.match(migration, /private\.project_stage_owner_overrides/);
  assert.match(migration, /private\.construction_stage_clearances/);
  assert.match(
    migration,
    /revoke all on function public\.client_portal_timeline\(uuid\) from public, anon/,
  );
  assert.doesNotMatch(
    migration,
    /public\.payments|private\.project_advance_requirements|public\.invoices/,
  );
  assert.match(
    project,
    /rpc\('client_portal_timeline', \{ p_project_id: id \}\)/,
  );
  const dashboardView = readFileSync(
    fileURLToPath(
      new URL(
        '../apps/business-app/src/app/client/client-dashboard.tsx',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  assert.match(project, /<ClientDashboard/);
  assert.match(dashboardView, /<ClientProjectTimeline\s+stages=\{timeline\}/);
  assert.match(timeline, /Work timeline/);
  assert.match(timeline, /completed_at/);
});

test('premium client dashboard reads only invited-project delivery data', () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL(
        '../packages/database/supabase/migrations/20261015001000_client_dashboard_read.sql',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const project = readFileSync(
    fileURLToPath(
      new URL(
        '../apps/business-app/src/app/client/projects/[id]/page.tsx',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const dashboard = readFileSync(
    fileURLToPath(
      new URL(
        '../apps/business-app/src/app/client/client-dashboard.tsx',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const styles = readFileSync(
    fileURLToPath(
      new URL(
        '../apps/business-app/src/app/client/client-dashboard.css',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  assert.match(sql, /not private\.client_portal_accessible\(p_project_id\)/);
  assert.match(sql, /project_id=p_project_id/);
  assert.match(sql, /gr\.project_id=p_project_id/);
  assert.match(sql, /ri\.po_item_id=item\.id/);
  assert.match(sql, /private\.finance_decimal\(ri\.received_quantity,false\)/);
  assert.match(sql, /'status','requested'/);
  assert.match(sql, /public\.project_inspections/);
  assert.match(sql, /private\.site_reports/);
  assert.match(
    sql,
    /revoke all on function public\.client_portal_dashboard\(uuid\) from public,anon/,
  );
  assert.doesNotMatch(
    sql,
    /public\.invoices|public\.payments|vendor_name|unit_price/,
  );
  assert.match(
    project,
    /rpc\('client_portal_dashboard', \{ p_project_id: id \}\)/,
  );
  assert.match(project, /<ClientDashboard/);
  for (const area of [
    'Project timeline',
    'Materials delivery status',
    "Tomorrow's work plan",
    "Today's site progress",
    'Quality checks',
    'Site photos & updates',
    'Designs & documents',
    'Client approvals',
    'Recent updates',
  ]) {
    assert.ok(dashboard.includes(area), area + ' must be available to clients');
  }
  assert.match(dashboard, /goods_receipt|Materials delivered|client\/media/);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)/);
  assert.match(styles, /pc-mobile-tabs/);
});


test('filtered Leads bulk editing uses real company permissions and versioned commands', () => {
  const bulk = readFileSync(fileURLToPath(new URL('bulk-lead-actions.ts', root)), 'utf8');
  const toolbar = readFileSync(fileURLToPath(new URL('lead-bulk-toolbar.tsx', root)), 'utf8');
  assert.match(leads, /<LeadBulkToolbar/);
  assert.match(leads, /params\.priority !== 'high'/);
  assert.match(leads, /Select filtered page/);
  assert.match(leads, /<LeadStageSelect/);
  assert.match(leads, /<LeadQuotePreview/);
  assert.match(bulk, /\.max\(25\)/);
  assert.match(bulk, /crmServices\(permission\)/);
  assert.match(bulk, /Set\(value\.leads/);
  assert.match(bulk, /lead\.version !== selected\.version/);
  assert.match(bulk, /s\.crm\.command\('assign'/);
  assert.match(bulk, /s\.crm\.command\('stage'/);
  assert.match(toolbar, /fewest assignments among the leads on this page/);
  assert.match(toolbar, /window\.confirm/);
});

test('one lead supports multiple package quotations and previews newest, with simple staff statuses', () => {
  const appRoot = new URL('../apps/business-app/src/app/dashboard/', import.meta.url);
  const quoteList = readFileSync(fileURLToPath(new URL('quotations/page.tsx', appRoot)), 'utf8');
  const createQuote = readFileSync(fileURLToPath(new URL('quotations/studio-actions.ts', appRoot)), 'utf8');
  const leadPage = readFileSync(fileURLToPath(new URL('crm/leads/page.tsx', appRoot)), 'utf8');
  const summarySql = readFileSync(
    fileURLToPath(new URL('../packages/database/supabase/migrations/20261016000200_lead_latest_quote.sql', import.meta.url)),
    'utf8',
  );

  assert.doesNotMatch(createQuote, /Opening the existing project quotation/);
  assert.doesNotMatch(createQuote, /existingQuotes\?\.\[0\]/);
  assert.match(createQuote, /action: 'create'/);
  assert.match(createQuote, /await attachLead\(newRevision\.quotation_id\)/);
  assert.match(leads, /\+ New quotation/);
  assert.match(leads, /\+ New quote/);
  assert.match(leadPage, /lead_quotation_summary/);
  assert.match(summarySql, /order by l\.created_at desc,q\.created_at desc/);
  assert.match(summarySql, /quotation_shared_revisions/);
  assert.match(quoteList, /\{ label: 'Shared', status: 'shared' \}/);
  assert.doesNotMatch(quoteList, /\{ label: 'Draft', status: 'draft' \}/);
  assert.doesNotMatch(quoteList, /\{ label: 'Superseded', status:/);
  assert.doesNotMatch(quoteList, /\{ label: 'Cancelled', status:/);
  assert.match(quoteList, /qs-quote-edit/);
  assert.match(quoteList, /\?step=quote/);
  assert.match(quoteList, /Not shared/);
  assert.match(quoteList, /mobileCustomers\.map/);
  assert.match(quoteList, /group\.quotes\.slice\(1\)\.map/);
  assert.match(quoteList, /renderMobileQuote\(group\.quotes\[0\]!\)/);
  assert.match(quoteList, /renderTableRow\(group\.quotes\[0\]!\)/);
  const revise = readFileSync(fileURLToPath(new URL('quotations/quotation-revise-button.tsx', appRoot)), 'utf8');
  assert.match(quoteList, /<QuotationReviseButton/);
  assert.match(revise, /action: 'clone'/);
  assert.match(revise, /step=quote/);
  assert.match(revise, /Edit a new version/);
  assert.ok(!quoteList.includes("issued={row.status === 'issued'}"));
});

test('Follow-ups and Visits are handled inside Leads and legacy links redirect', () => {
  const activity = readFileSync(fileURLToPath(new URL('lead-activity-scheduler.tsx', root)), 'utf8');
  const actions = readFileSync(fileURLToPath(new URL('lead-activity-actions.ts', root)), 'utf8');
  const panel = readFileSync(fileURLToPath(new URL('lead-activity-panel.tsx', root)), 'utf8');
  const drawer = readFileSync(fileURLToPath(new URL('lead-details-drawer.tsx', root)), 'utf8');
  const detail = readFileSync(fileURLToPath(new URL('[id]/page.tsx', root)), 'utf8');
  const followups = readFileSync(fileURLToPath(new URL('../followups/page.tsx', root)), 'utf8');
  const visits = readFileSync(fileURLToPath(new URL('../site-visits/page.tsx', root)), 'utf8');
  assert.match(leads, /crm-activity-filters/);
  assert.match(leads, /Upcoming Visits/);
  assert.match(leads, /Due Today/);
  assert.match(leads, /Overdue/);
  assert.match(activity, /value="office_visit"/);
  assert.match(activity, /value="site_visit"/);
  assert.match(activity, /value="call"/);
  assert.match(drawer, /<LeadActivityScheduler/);
  assert.match(detail, /<LeadActivityScheduler/);
  assert.match(actions, /crm\.followup\.manage/);
  assert.match(actions, /crm\.site_visit\.manage/);
  assert.match(actions, /s\.crm\.save\('site_visits'/);
  assert.match(actions, /s\.crm\.save\('lead_followups'/);
  assert.match(panel, /services\.crm\.search/);
  assert.match(followups, /redirect\('\/dashboard\/crm\/leads\?'/);
  assert.match(visits, /redirect\('\/dashboard\/crm\/leads\?'/);
});
