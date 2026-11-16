Warning: truncated output (original token count: 15121)
Total output lines: 1299

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = (name: string) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

describe('lead quotation preview and secure WhatsApp PDF sharing', () => {
  const preview = file('../crm/leads/lead-quote-preview.tsx');
  const workspace = file('../crm/leads/workspace.tsx');
  const leadsPage = file('../crm/leads/page.tsx');
  const styles = file('../crm/leads/leads-premium.css');
  const share = file('./sharing-actions.ts');

  it('fetches authenticated HTML instead of embedding the blocked preview route as iframe URL', () => {
    expect(preview).toContain("fetch(base + '/preview'");
    expect(preview).toContain("credentials: 'same-origin'");
    expect(preview).toContain("cache: 'no-store'");
    expect(preview).toContain('iframe srcDoc={html} sandbox=""');
    expect(preview).not.toContain("iframe src={base+'/preview'}");
    expect(preview).toContain('Preview unavailable');
    expect(preview).toContain('Try again');
    expect(preview).toContain("base + '/preview'");
    expect(preview).toContain("base + '/pdf?view=1'");
  });

  it('finalizes approved drafts but attaches PDF file bytes, never creates a customer link', () => {
    const file = readFileSync(
      fileURLToPath(new URL('./quotation-pdf-file.ts', import.meta.url)),
      'utf8',
    );
    expect(preview).toContain('authorizeWhatsAppPdfAttachment(revisionId)');
    expect(preview).toContain("status === 'draft' && !window.confirm(");
    expect(preview).toContain('fetchQuotationPdfFile(revisionId, number)');
    expect(preview).toContain('supportsPdfFileSharing(preparedPdf)');
    expect(preview).toContain('sharePdfFile(preparedPdf, number)');
    expect(preview).toContain('downloadQuotationPdfFile(preparedPdf)');
    expect(preview).not.toContain("'/q/' + result.token");
    expect(preview).not.toContain('window.location.assign');
    expect(share).not.toContain('export async function createWhatsAppPdfShare');
    expect(share).toContain(
      "commercialServices('quotation.share', 'quotation')",
    );
    expect(share).toContain('hasSavedStagePaymentPlan(revision.terms)');
    expect(share).toContain("s.allowed('quotation.issue', 'quotation')");
    expect(share).not.toContain("p_action: 'create'");
    expect(file).toContain(
      'new File([blob], quotationPdfFilename(quoteNumber,kind)',
    );
    expect(file).toContain("await blob.slice(0, 5).text() !== '%PDF-'");
    expect(file).toContain('navigator.share({');
    expect(file).toContain('files: [file]');
    expect(file).toContain("credentials: 'same-origin'");
  });

  it('shows the share action only to permitted users on desktop and mobile', () => {
    expect(leadsPage).toContain(
      "canShareQuote={s.allowed('quotation.share', 'quotation')}",
    );
    expect(workspace).toContain('canShareQuote: boolean;');
    expect(workspace.match(/canShare=\{canShareQuote\}/g)?.length).toBe(2);
    expect(preview).toContain('canShare &&');
    expect(styles).toContain('.crm-quote-whatsapp');
    expect(styles).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(styles).toContain('grid-column:1/-1');
    expect(styles).toContain('.crm-quote-dialog[open]');
  });
});

describe('consistent premium quotation document across previews and PDF routes', () => {
  const leadsPreview = file('../crm/leads/lead-quote-preview.tsx');
  const quoteList = file('./page.tsx');
  const quoteStudio = file('./studio-editor.tsx');
  const privatePreview = file('./[id]/preview/route.ts');
  const privatePdf = file('./[id]/pdf/route.ts');
  const publicPdf = file('../../q/[token]/pdf/route.ts');
  const nodeRenderer = fileURLToPath(
    new URL(
      '../../../../../../packages/shared/src/pdf.node.ts',
      import.meta.url,
    ),
  );

  it('renders the same saved premium HTML in Leads, Quotations and Studio', () => {
    expect(leadsPreview).toContain("fetch(base + '/preview'");
    expect(quoteList).toContain(
      "const preview = '/dashboard/quotations/' + row.id + '/preview'",
    );
    expect(quoteStudio).toContain('srcDoc={previewHtml}');
    expect(privatePreview).toContain('quotationDocument(id)');
    expect(privatePdf).toContain('quotationDocument(');
    expect(privatePdf).toContain('renderQuotationPdf(html, document,');
    expect(publicPdf).toContain('renderQuotationDocument(q.document)');
    expect(publicPdf).toContain('renderQuotationPdf(');
  });

  it('uses browser HTML printing when provisioned and keeps the real PDF file for sharing', () => {
    const renderer = readFileSync(nodeRenderer, 'utf8');
    const pdfEntry = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../../packages/shared/src/pdf.ts',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const pdfClient = file('./quotation-pdf-file.ts');
    expect(renderer).toContain('CHROMIUM_EXECUTABLE_PATH');
    expect(renderer).toContain('chromium.launch');
    expect(pdfEntry).toContain(
      'env.CF_BROWSER_ACCOUNT_ID && env.CF_BROWSER_API_TOKEN',
    );
    expect(pdfClient).toContain('fetchQuotationPdfFile(');
    expect(pdfClient).toContain('files: [file]');
  });
});

describe('minimal quotation studio navigation', () => {
  const studio = file('./studio-editor.tsx');
  const sft = file('./premium-sft-builder.tsx');
  const payments = file('./payment-schedule-editor.tsx');
  const interior = file('./interior-room-builder.tsx');
  const construction = file('./construction-selector.tsx');
  const page = file('./[id]/studio/page.tsx');

  it('keeps only the three editing tabs and links directly to the saved premium preview', () => {
    expect(studio).not.toContain('qs-studio-compact-bar');
    expect(studio).not.toContain('qs-studio-hero');
    expect(studio).toContain('srcDoc={previewHtml}');
    expect(studio).toContain("url + '/preview?version=' + revisionVersion");
    expect(studio).not.toContain('View saved quotation');
    expect(studio).not.toContain("step === 'preview'");
    expect(studio).not.toContain("setStep('preview')");
    expect(studio).not.toContain('Preview &amp; Share');
    expect(sft).toContain('▣ Save quotation →');
    expect(studio).not.toContain('Save Draft');
    expect(studio).not.toContain('Issue & Share');
    expect(studio).not.toContain('qs-stepper" aria-label="Quotation steps"');
    expect(studio).not.toContain('qs-sector-tabs');
    expect(studio).not.toContain('qs-method-tabs');
  });

  it('keeps the saved state visible until the quotation is edited again', () => {
    expect(sft).toContain('useState(Boolean(initialSchedule))');
    expect(sft).toContain('disabled={pending||(saved&&!dirty)}');
    expect(sft).toContain("saved&&!dirty?'✓ Saved':'▣ Save quotation →'");
    expect(sft).toContain(
      "className={'qs-work-summary-save'+(saved&&!dirty?' is-saved':'')}",
    );
    expect(sft).toContain(
      "const touch=()=>{setSaved(false);setDirty(true);setMessage('');}",
    );
  });

  it('Save delegates to real persisted child actions, not a refresh fake', () => {
    expect(studio).not.toContain('saveButton.click()');
    expect(studio).not.toContain('router.refresh();');
    expect(sft).toContain('data-studio-save="quote"');
    expect(construction).toContain('data-studio-save="quote"');
    expect(interior).toContain(
      "data-studio-save={!selectedPackage ? 'quote' : undefined}",
    );
    expect(payments).toContain('data-studio-save="payments"');
    expect(file('./quotation-terms-editor.tsx')).toContain(
      'data-studio-save="files"',
    );
  });

  it('preserves independent revision workflow and redirects legacy studio preview links', () => {
    expect(studio).toContain('reviseEditor');
    expect(page).toContain('CreateRevisionControl');
    expect(page).toContain("query.step === 'preview'");
    expect(page).toContain(
      "redirect('/dashboard/quotations/' + encodeURIComponent(id) + '/preview')",
    );
    expect(page).not.toContain('Confirm & Enable Customer Sharing');
    expect(page).not.toContain('<SharingSection');
  });
});

describe('single package choice in the saved quotation editor', () => {
  const construction = file('./construction-selector.tsx');
  const sft = file('./premium-sft-builder.tsx');
  const interior = file('./interior-room-builder.tsx');

  it('shows one construction package selector and Custom Quote, not a second pricing-method selector', () => {
    expect(construction).toContain('Select construction quotation package');
    expect(construction).toContain(
      '<option value="custom">Custom Quote</option>',
    );
    expect(construction).not.toContain('Select quotation calculation method');
    expect(construction).not.toContain('2. Customized quotation');
    expect(construction).toContain('selectedPackageId={chosen.id}');
    expect(sft).not.toContain('Manage packages ↗');
  });

  it('shows the interior custom item editor only for Custom Quote and no package manager link', () => {
    expect(interior).toContain('<option value="custom">Custom Quote</option>');
    expect(interior).toContain("packageId === 'custom'");
    expect(interior).not.toContain('Package Manager ↗');
    expect(interior).toContain('data-studio-save={!selectedPackage');
  });
});

describe('lead-driven quotation creation', () => {
  const form = file('./studio-start.tsx');
  const page = file('./new/page.tsx');
  const action = file('./studio-actions.ts');
  const css = file('./clean-create.css');

  it('shows one lead selector instead of construction, interior and custom cards', () => {
    expect(form).not.toContain('qs-create-types');
    expect(form).not.toContain('Custom / Others');
    expect(form).not.toContain('chooseStyle');
    expect(css).not.toContain('.qs-create-type');
    expect(form).toContain(
      'onChange={(event) => chooseLead(event.target.value)}',
    );
    expect(form).toContain('selectedLead?.industryKey &&');
    expect(form).toContain(
      '(existingCustomer || quoteWithoutLead) ? industryKey',
    );
    expect(form).toContain('Auto-detected from lead');
    expect(form).toContain(
      'disabled={pending || (!existingCustomer && !quoteWithoutLead && !leadId) || !industry}',
    );
    expect(form).toContain(
      "industry === 'construction' && !initialCustomizedQuote ? 'sft' : 'custom'",
    );
  });

  it('offers quote preparation without creating a CRM lead when none are available', () => {
    expect(form).toContain('No CRM leads yet? Prepare a quote now.');
    expect(form).toContain('canPrepareWithoutLead');
    expect(page).toContain(
      "canPrepareWithoutLead={s.allowed('customer.create', 'crm') || s.allowed('customer.create', 'quotation')}",
    );
    expect(form).toContain('Quotation service');
    expect(form).toContain(
      'quoteWithoutLead ? { industryKey: industry } : { leadId }',
    );
    expect(form).toContain('Prepare quotation →');
    expect(css).toContain('.qs-no-leads-callout');
    expect(action).toContain('select a service for a quote without a lead.');
    expect(action).toContain(
      'Choose an active service before preparing a quote without a lead.',
    );
    expect(action).toContain(
      "createProspect('quotation_prospect_project_create'",
    );
  });

  it('requires a quotation before project conversion and no longer opens blank projects', () => {
    const inlineProject = file('../crm/leads/lead-project-action.tsx');
    const linkAction = file('../crm/leads/lead-project-actions.ts');
    const convert = file('../crm/leads/[id]/convert/page.tsx');
    expect(form).toContain('Client &amp; Quotation Details');
    expect(form).not.toContain('Enter project name');
    expect(form).not.toContain('data.projectName');
    expect(action).not.toContain('projectName: z.string()');
    expect(action).toContain('leadQuotationProjectIds');
    expect(action).toContain("'is_sales_prospect', true");
    expect(action).toContain('p_name: prospectName');
    expect(inlineProject).toContain('Create a quotation to start the project');
    expect(inlineProject).not.toContain('projectName');
    expect(inlineProject).toContain('quotationProjectId');
    expect(linkAction).toContain('customer_id: null, project_id: null');
    expect(convert).toContain("redirect('/dashboard/crm/leads/'");
  });

  it('derives category from the tenant lead and rejects unknown classifications', () => {
    expect(page).toContain('resolveLeadCategory(entry, enabledIndustries)');
    expect(action).toContain('leadId: z.uuid().optional()');
    expect(action).toContain('customerId: z.uuid().optional()');
    expect(action).toContain(
      'industryKey: z.string().trim().min(2).max(80).optional()',
    );
    expect(action).toContain('entry.id === lead?.industry_id');
    expect(action).toContain('resolveLeadCategory(lead, industries)');
    expect(action).toContain('Classify this lead in CRM');
  });

  it('accepts realistic plot and floor configuration in the quote form and server action', () => {
    const configuration = '200 sq yards · G+2 (Ground, First, Second)';
    expect(configuration.length).toBeGreaterThan(40);
    expect(form).toContain('maxLength={200} placeholder={industry ===');
    expect(action).toContain('plotSize: z.string().trim().max(200)');
  });

  it('uses the entered site location when an existing customer has no billing city', () => {
    expect(action).toContain(
      "typeof address.city === 'string' && address.city.trim().length > 0",
    );
    expect(action).toContain('? address.city : values.location');
  });
});

describe('single premium package library and working Custom Quote entry', () => {
  const page = file('./packages/page.tsx');
  const library = file('./packages/package-library.tsx');
  const stylesheet = file('./packages/package-library.css');
  const creation = file('./studio-start.tsx');
  const createPage = file('./new/page.tsx');
  const studio = file('./[id]/studio/page.tsx');

  it('renders a single company package catalogue, not both old manager pages', () => {
    expect(page).toContain('<PackageLibrary');
    expect(page).not.toContain('<ConstructionPackagesManager');
    expect(page).not.toContain('<QuotationPackagesManager');
    expect(page).toContain('construction={construction}');
    expect(page).toContain('other={configurable}');
    expect(library).toContain('Construction Packages');
    expect(library).toContain('Interior &amp; Other Packages');
    expect(library).toContain('Custom Package Management');
    expect(library).not.toContain('renderCustom()');
    const customManager = file('./packages/custom-package-manager.tsx');
    expect(customManager).toContain('Create Custom Quote');
    expect(customManager).toContain('/dashboard/quotations/new?mode=custom');
    expect(stylesheet).toContain('.qpl-cards');
    expect(stylesheet).toContain(
      'grid-template-columns:repeat(2,minmax(0,1fr))',
    );
    expect(stylesheet).toContain('@media(max-width:600px)');
  });

  it('preserves editing, duplication, removal and company snapshot PDF previews', () => {
    expect(library).toContain('<PremiumPackageEditor');
    expect(library).toContain('<IndustryPackageEditor');
    expect(library).toContain('duplicateConstructionPackage');
    expect(library).toContain('deleteConstructionPackage');
    expect(library).toContain('duplicateQuotationPackage');
    expect(library).toContain('deleteQuotationPackage');
    expect(library).toContain('preview?format=pdf');
    expect(library).toContain("detail.item.status === 'active'");
    expect(library).toContain('construction.map((item)');
    expect(library).toContain('(other ?? []).map((item)');
  });

  it('routes through classified CRM leads then preselects tenant-owned package or custom mode', () => {
    expect(library).toContain('new URLSearchParams');
    expect(library).toContain('package: entry.item.id');
    expect(createPage).toContain('initialPackageId={initialPackageId');
    expect(creation).toContain('initialPackageIndustry === industry');
    expect(creation).toContain("route.set('package', 'custom')");
    expect(studio).toContain('initialPackageId={query.package ??');
    expect(file('./construction-selector.tsx')).toContain(
      "initialPackageId === 'custom'",
    );
    expect(file('./interior-room-builder.tsx')).toContain(
      "initialPackageId === 'custom'",
    );
  });
});

describe('uniform quotation creation inputs', () => {
  const form = file('./studio-start.tsx');
  const css = file('./clean-create.css');

  it('uses a single inline field label for required marks and consistent full-width groups', () => {
    expect(form).toContain('className="qs-field-label"');
    expect(form).toContain('className="qs-field-required"');
    expect(form).toContain('qs-clean-field qs-field-full');
    expect(form).not.toContain('Client Name <span>*</span>');
    expect(form).not.toContain('Phone Number <span>*</span>');
    expect(form).not.toContain('Enter project name');
    expect(css).toContain(
      '.qs-field-full, .qs-clean-notes { grid-column:1/-1; }',
    );
    expect(css).toContain('grid-template-columns:minmax(0,1fr)');
    expect(css).not.toContain(
      '.qs-create-field-grid .qs-clean-field:nth-child(',
    );
  });

  it('has one scoped focus ring instead of inherited teal shadow and orange outline', () => {
    expect(css).toContain(
      '.qs-clean-create .qs-clean-field :is(input,select,textarea):focus',
    );
    expect(css).toContain('outline:none !important;');
    expect(css).toContain(
      'box-shadow:0 0 0 3px rgba(249,115,22,.19) !important;',
    );
    expect(css).toContain('background:#fff !important;');
    expect(css).not.toContain('outline:2px solid #ffc4a3');
    expect(css).not.toContain('.qs-clean-field :is(input,select):read-only');
  });
});

describe('automatic CRN reuse from selected lead', () => {
  const form = file('./studio-start.tsx');
  const page = file('./new/page.tsx');
  const action = file('./studio-actions.ts');
  const css = file('./clean-create.css');

  it('does not show or load a manual customer / CRN selector', () => {
    expect(form).not.toContain('Existing client / CRN');
    expect(form).not.toContain('New customer');
    expect(form).not.toContain('existingCustomers');
    expect(form).not.toContain('chooseCustomer');
    expect(form).not.toContain('matchingCustomers');
    expect(page).not.toContain('existingCustomers=');
    expect(css).not.toContain('.qs-create-existing');
  });

  it('resolves existing CRN securely on the server, never by a browser-selected id', () => {
    expect(form).toContain(
      'quoteWithoutLead ? { industryKey: industry } : { leadId }',
    );
    expect(action).toContain('customerId: z.uuid().optional()');
    expect(action).toContain("await s.client.rpc('lead_quotation_list'");
    expect(action).toContain('contactMatches(candidate, quoteClient)');
    expect(action).toContain('phone: lead.phone');
    expect(action).toContain('(!lead || contactMatches(candidate, {');
    expect(action).toContain(
      'let customerId = existingCustomer?.id || leadCustomerId || matches[0]?.id ||',
    );
    expect(action).toContain('if (!customerId) {');
  });
});

describe('customer-grouped quotation list without Draft presentation', () => {
  const list = file('./page.tsx');
  const css = file('./quotations-list.css');

  it('removes draft tabs, filters, badges and metrics while retaining editing permissions', () => {
    expect(list).not.toContain("label: 'Draft'");
    expect(list).not.toContain("label: 'Drafts'");
    expect(list).not.toContain('<option value="draft">');
    expect(list).not.toContain('statusName(row.status)');
    expect(list).not.toContain('qs-state-draft');
    expect(list).toContain("row.status === 'draft' && canEdit");
    expect(list).toContain('Not shared');
    expect(list).toContain('Shared');
  });

  it('labels saved editable quotations Saved even when sharin…5121 tokens truncated…ayment-schedule-editor.tsx');
    expect(studio).not.toContain("step !== 'preview' &&");
    expect(studio).toContain("step === 'payments' ? ' qs-studio-grid-full'");
    expect(studio).toContain("step !== 'payments' && <aside");
    expect(payments).toContain('Save Payment Schedule');
    expect(payments).toContain('data-studio-save="payments"');
    expect(payments).toContain('qs-payment-summary');
    expect(payments).toContain('qs-payment-row');
    expect(payments).not.toContain('<table');
    expect(css).toContain('.qs-payment-panel');
    expect(css).toContain('grid-template-areas:"grip stage stage remove"');
  });
});

describe('tenant-priced calculated Custom Quote package', () => {
  const selector = file('./construction-selector.tsx');
  const actions = file('./construction-actions.ts');
  const library = file('./packages/package-library.tsx');
  const studio = file('./[id]/studio/page.tsx');
  const quotePage = file('./packages/page.tsx');

  it('keeps brand and consumption setup inside Packages and selects per category', () => {
    expect(library).toContain(
      '<CustomPackageManager rates={rates} canManage={canManage}',
    );
    expect(file('./packages/custom-package-manager.tsx')).toContain(
      'Manage brands',
    );
    expect(quotePage).toContain('createConstructionRatesRepository');
    expect(selector).toContain('Custom Quote · Choose customer brands');
    expect(selector).toContain('consumptionPerSqft');
    expect(selector).toContain('saveCustomBrandQuote');
  });

  it('saves price cards from PostgreSQL as one editable quotation line', () => {
    expect(actions).toContain(
      'const price = await createConstructionRatesRepository',
    );
    expect(actions).toContain('encodeCustomBrandQuote');
    expect(actions).toContain('...(existing[0] ? { id: existing[0].id } : {})');
    expect(actions).toContain('SFT_ESTIMATE_V2:%');
    expect(studio).toContain('initialCustomQuote={existingCustomQuote}');
  });
});

describe('screenshot-matched Package Library with real company pricing', () => {
  const library = file('./packages/package-library.tsx');
  const manager = file('./packages/custom-package-manager.tsx');
  const css = file('./packages/custom-package-manager.css');
  const action = file('../pricing/construction/actions.ts');
  const pdf = file('./packages/custom/preview/route.ts');

  it('shows exactly two industry tabs and only one Custom Package Management toolbar button', () => {
    expect(library).toContain(
      "useState<'construction' | 'other'>('construction')",
    );
    expect(library).toContain('Add Package');
    expect(library).toContain('Compare');
    expect(library).toContain('Custom Package Management');
    expect(library).toContain('showCustomManagement && <CustomPackageManager');
    expect(library).not.toContain("tab === 'custom'");
    expect(library).not.toContain('renderCustom()');
    expect(library).not.toContain('qpl-custom-cta');
    expect(library).not.toContain('Manage Custom Package');
    expect(library).not.toContain('<details className="qpl-brand-pricing">');
  });
  it('keeps functional edit duplicate and delete controls on each package card', () => {
    expect(library).toContain('qpl-card-top');
    expect(library).toContain('qpl-card-meta');
    expect(library).toContain('qpl-manage');
    expect(library).toContain('onClick={() => duplicate(entry)}');
    expect(library).toContain('onClick={() => setRemove(entry)}');
    expect(library).toContain('setEditing({kind:entry.kind,id:current.id})');
    expect(library).toContain('PremiumPackageEditor');
    expect(library).toContain('IndustryPackageEditor');
    expect(library).toContain('Confirm Delete');
  });
  it('edits company units and brand options through authorized atomic persistence', () => {
    expect(manager).toContain('cpm-table');
    expect(manager).toContain('Manage brands');
    expect(manager).toContain('Add Material');
    expect(manager).toContain('Save Changes');
    expect(manager).toContain('saveCustomPackageSettings');
    expect(action).toContain('saveCustomSettings');
    expect(
      file('../../../../../../packages/database/src/construction-rates.ts'),
    ).toContain('construction_custom_package_settings_save');
    expect(css).toContain('@media(max-width:670px)');
  });
  it('provides a real authenticated Custom Package PDF instead of an inert CTA', () => {
    expect(pdf).toContain('catalogPage(true)');
    expect(pdf).toContain('renderPdf(html');
    expect(pdf).toContain('renderConstructionPackageSamplePdf');
    expect(pdf).toContain("'Content-Type':'application/pdf'");
  });
});

describe('mobile package library visual layout', () => {
  const css = file('./packages/package-library.css');
  const library = file('./packages/package-library.tsx');
  it('keeps header actions compact and two tabs on small screens', () => {
    expect(css).toContain('grid-template-columns:1.1fr .87fr 1.35fr');
    expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(css).toContain('@media(max-width:600px)');
    expect(css).toContain('.qpl-card-top');
    expect(css).toContain('.qpl-manage button');
    expect(library).not.toContain('qpl-features');
  });
});

describe('customer final quotation selection', () => {
  const quotes = file('./page.tsx');
  const action = file('./final-quotation-actions.ts');
  const button = file('./quotation-final-button.tsx');
  const migration = file(
    '../../../../../../packages/database/supabase/migrations/20261017001100_quotation_final_selection.sql',
  );

  it('defaults to latest active quotation and displays a manual Final selection first', () => {
    expect(migration).toContain("q.status IN ('draft','issued')");
    expect(migration).toContain('ORDER BY q.created_at DESC,q.id DESC');
    expect(migration).toContain('sel.selected_at>=newest.created_at');
    expect(quotes).toContain("s.client.rpc('quotation_final_choices'");
    expect(quotes).toContain('finalByCustomer.get(group.id)');
    expect(quotes).toContain('qs-final-label');
    expect(quotes).toContain('★ Final');
    expect(quotes).toContain('QuotationFinalButton');
    expect(quotes).toContain('quote.customerId');
    expect(quotes).toContain('quotation_final_marked');
    expect(quotes).toContain('Latest');
  });

  it('enforces assigned manager or owner only for created projects and keeps signed revisions fixed', () => {
    const permissions = file(
      '../../../../../../packages/database/supabase/migrations/20261022000800_project_final_quote_permissions.sql',
    );
    const manager = file(
      '../../../../../../packages/database/supabase/migrations/20261022001000_project_manager_final_quote_access.sql',
    );
    expect(permissions).toContain('private.site_owner(p_org)');
    expect(permissions).toContain(
      "r.role in ('project_manager','project_director')",
    );
    expect(permissions).toContain('coalesce(pinned.id,newest.id)');
    expect(manager).toContain("private.has_permission(p_org,'quotation.view')");
    expect(quotes).toContain('quotation_final_eligible');
    expect(quotes).toContain('manualByCustomer[customerId]');
    expect(action).toContain("revalidatePath('/dashboard/projects','layout')");
  });
  it('securely selects one customer quote without changing draft, issue or PDF', () => {
    expect(migration).toContain('PRIMARY KEY(organization_id,customer_id)');
    expect(migration).toContain(
      "private.has_permission(p_org,'quotation.edit')",
    );
    expect(migration).toContain('pinned.customer_id=c.id');
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
    expect(migration).toContain(
      'REVOKE ALL ON private.quotation_final_selections',
    );
    expect(migration).not.toContain('UPDATE public.quotation_revisions');
    expect(migration).not.toContain('UPDATE public.quotations');
    expect(action).toContain(
      "commercialServices('quotation.view','quotation')",
    );
    expect(action).toContain("s.client.rpc('quotation_mark_final'");
    expect(button).toContain('Mark as Final');
    expect(button).toContain('router.refresh()');
  });
});

describe('quotation stage requirements inline editing', () => {
  const editor = file('./stage-requirements-editor.tsx');
  const styles = file('./studio.css');
  const schedule = file('./payment-schedule-editor.tsx');

  it('provides inline Save item and Cancel without removing checklist toggles', () => {
    expect(editor).toContain('const saveEdit = () =>');
    expect(editor).toContain('setEditing(label)');
    expect(editor).toContain('Save item');
    expect(editor).toContain('Cancel');
    expect(editor).toContain('type="checkbox" checked');
    expect(editor).toContain('Add from standard items');
    expect(editor).toContain('locked && base.includes(label)');
    expect(styles).toContain('.qs-stage-item-inline-edit');
    expect(styles).toContain('.qs-stage-item-edit-button');
  });

  it('persists customized stage labels with the payment schedule', () => {
    expect(schedule).toContain(
      'onChange={(steps,changed)=>changeWorkflow(index,steps,changed)}',
    );
    expect(schedule).toContain('milestoneFlow');
    expect(schedule).toContain('encodeMilestoneFlow(milestoneFlow)');
    expect(schedule).toContain('<MilestoneWorkflowBuilder');
    expect(schedule).not.toContain('<StageRequirementsEditor');
    expect(schedule).toContain('stageRequirements:visibleRequirements');
    expect(schedule).toContain('encodeStageRequirements(visibleRequirements)');
  });
});

describe('Payment Settings keeps work-area entry textual and removes unrelated shortcuts', () => {
  const paymentSettings = file('../settings/page.tsx');
  const stageEditor = file('../settings/construction-payment-defaults.tsx');
  it('does not display extra bank-details, payment-method, or invoice navigation in Payment Settings', () => {
    const section =
      paymentSettings
        .split("{tab==='payments'&&")[1]
        ?.split("{tab==='team'&&")[0] ?? '';
    expect(section).not.toContain('Edit company bank details');
    expect(section).not.toContain("Payment methods',href:");
    expect(section).not.toContain('Invoices & stage collections');
  });
  it('inherits each item stage from its payment milestone and allows reuse in other milestones', () => {
    expect(stageEditor).not.toContain('className="us-payment-work-areas"');
    expect(stageEditor).not.toContain('className="us-payment-area-tags"');
    expect(stageEditor).not.toContain('Type construction work area name');
    expect(stageEditor).not.toContain('<label>Work area');
    expect(stageEditor).not.toContain('Type default step work area');
    expect(stageEditor).toContain('workAreaFor(title,insertAt-1)');
    expect(stageEditor).not.toContain('Use in construction stages');
    expect(stageEditor).not.toContain('type="checkbox"');
    expect(stageEditor).not.toContain(
      'aria-label="Construction stage for new item"',
    );
    expect(stageEditor).not.toContain('<label>Construction stage');
    expect(stageEditor).toContain(
      "const chosenArea=kind==='qc'?current!.area:workAreaFor(title,insertAt-1)",
    );
    expect(stageEditor).toContain(
      'steps[position]?.area??steps[position+1]?.area??areas[0]',
    );
    expect(stageEditor).toContain(
      'const nextItems:CompanyWorkStep[]=[{kind,name:title,area:chosenArea}]',
    );
    expect(stageEditor).toContain('item.area===next.area');
    expect(stageEditor).toContain('const targets=inferred?allRows.flatMap');
    expect(stageEditor).toContain('companyWorkAreaLabel(row,inferred)');
    expect(stageEditor).toContain('Add to {target.name}');
    expect(stageEditor).toContain('onRouteStep={(targetIndex,step)=>');
    expect(stageEditor).not.toContain(
      'This work belongs to another construction stage.',
    );
    expect(stageEditor).toContain('steps:updated');
  });
  it('renders one accordion per payment milestone, first open only', () => {
    expect(stageEditor).toContain(
      'const [expandedIndex,setExpandedIndex]=useState<number|null>(0)',
    );
    expect(stageEditor).toContain('className="us-payment-stage-toggle"');
    expect(stageEditor).toContain('aria-expanded={expanded}');
    expect(stageEditor).toContain('onToggle={()');
    expect(stageEditor).toContain('expanded={expandedIndex===index}');
    expect(stageEditor).not.toContain('className="us-payment-stage-work"');
    expect(stageEditor).toContain('us-payment-stage-stats');
    expect(stageEditor).toContain('kinds.map(type=>');
  });
  it('Show all and Show fewer actually change the rendered item count with no scrollbar cap', () => {
    const style = file('../settings/settings.css');
    expect(stageEditor).toContain('const limit=6');
    expect(stageEditor).toContain(
      'const visible=showAll?steps:steps.slice(0,limit)',
    );
    expect(stageEditor).toContain(
      "{showAll?'Show fewer items':'Show all '+steps.length+' items'}",
    );
    expect(stageEditor).toContain('setShowAll(value=>!value)');
    expect(stageEditor).toContain('visible.map((item,position)');
    expect(style).toContain('.us-payment-step-list{');
    expect(style).toContain('overflow:visible;max-height:none');
    expect(style).not.toContain('overflow-y:auto');
  });
  it('renders one compact action row with edit, move and delete for each work step', () => {
    expect(stageEditor).toContain('us-payment-step-name');
    expect(stageEditor).toContain('saveEdit');
    expect(stageEditor).toContain('startEdit(position)');
    expect(stageEditor).toContain('onClick={()=>removeStep(position)}');
    expect(stageEditor).toContain('us-payment-step-drag');
    expect(stageEditor).toContain(
      'onCommit={target=>moveStep(position,target)}',
    );
    expect(stageEditor).toContain('New item sequence number');
    expect(stageEditor).toContain('draggable={canEdit}');
    expect(stageEditor).toContain('New default work item name');
    expect(stageEditor).toContain('Company QC');
  });
  it('does not double number the work items', () => {
    expect(stageEditor).toContain('className="us-payment-step-list"');
    expect(stageEditor).not.toContain('<ol className="us-payment-step-list">');
  });
});

describe('Settings category dashboard keeps one canonical settings workspace', () => {
  const page = file('../settings/page.tsx');
  const cards = file('../settings/settings-home.tsx');
  const css = file('../settings/settings.css');
  it('opens the new card dashboard by default and preserves seven original detail tabs', () => {
    expect(page).toContain(
      'const tab=tabs.find(t=>t.id===params.tab)?.id??null;',
    );
    expect(page).toContain('tab===null?<SettingsHome sections={sections}/>');
    for (const tab of [
      'company',
      'branding',
      'invoice',
      'documents',
      'payments',
      'team',
      'preferences',
    ])
      expect(page).toContain("id:'" + tab + "'");
    expect(page).not.toContain('<nav className="us-tabs"');
    expect(page).toContain('href="/dashboard/settings" className="ush-back"');
  });
  it('matches five grouped sections with 16 visual category cards, without new forms', () => {
    for (const label of [
      'Business & Company',
      'Project & Construction',
      'People & Access',
      'Documents & Templates',
      'System & Preferences',
    ])
      expect(page).toContain(label);
    const home =
      page.split('const sections:SettingSection[]=')[1]?.split('\n ];')[0] ??
      '';
    // Five section headings plus the seventeen remaining category cards share this shape.
    expect((home.match(/\bid:'[^']+',title:/g) ?? []).length - 5).toBe(16);
    expect(page).toContain(
      "href:'/dashboard/settings?tab=payments#company-payment-stages'",
    );
    expect(page).toContain(
      "href:'/dashboard/settings?tab=branding#quotation-template-settings'",
    );
    expect(page).toContain("href:'/dashboard/settings?tab=invoice'");
    expect(page).toContain("href:'/dashboard/settings?tab=company'");
    expect(page).toContain("href:'/dashboard/settings?tab=documents'");
    expect(page).toContain("href:'/dashboard/settings?tab=preferences'");
    expect(page).not.toContain('create table');
  });
  it('supports live keyword search and only links to real destination pages', () => {
    expect(cards).toContain('useState');
    expect(cards).toContain('useMemo');
    expect(cards).toContain('onChange={event=>setSearch(event.target.value)}');
    expect(cards).toContain('aria-label="Search settings"');
    expect(cards).toContain('className="ush-grid"');
    expect(cards).toContain('card.href?');
    expect(cards).toContain('className="ush-tile is-planned"');
    expect(cards).toContain('No settings match');
  });
  it('keeps compact responsive card grid and retires the horizontal tab strip', () => {
    expect(css).toContain(
      '.ush-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))',
    );
    expect(css).toContain('.ush-tile{display:flex');
    expect(css).toContain('.ush-search');
    expect(css).toContain('@media(max-width:455px)');
    expect(css).not.toContain('.us-tabs{display:flex');
  });
});

describe('construction quotation schedule is managed from company settings', () => {
  const editor = file('./payment-schedule-editor.tsx');
  const workflow = file('./milestone-workflow-builder.tsx');

  it('renders construction payments and work without quotation editing controls', () => {
    expect(editor).toContain(
      "const scheduleEditable=editable&&industry!=='construction'",
    );
    expect(editor).toContain('editable={scheduleEditable}');
    expect(editor).toContain('className="qs-payment-stage-readonly"');
    expect(editor).toContain('className="qs-payment-percent-readonly"');
    expect(editor).toContain(
      'Payment and work milestones are fixed from this quotation.',
    );
    expect(workflow).toContain(
      '{editable&&<div className="qs-one-flow-footer">',
    );
    expect(workflow).toContain(
      '{editable&&catalog.length>0&&<details className="qs-one-flow-catalog">',
    );
    expect(workflow).toContain(
      "{editable?'Existing saved work is retained. Type the next activity and add it in order.':'Work sequence managed in Settings.'}",
    );
    expect(workflow).toContain(
      "{editable?'Type a new work item using + Add, or choose an existing one from the library above. Your old standard item names are still available.':'No work items are configured for this stage in Settings.'}",
    );
    expect(workflow).toContain(
      '{editable&&preservedReports.length>0&&<details className="qs-one-flow-advanced qs-one-flow-reports">',
    );
  });
});

describe('construction quotation snapshots use the current company payment stages', () => {
  const editor = file('./payment-schedule-editor.tsx');

  it('copies configured company work into new or outdated editable quotation snapshots', () => {
    expect(editor).toMatch(
      /const companySchedule\s*=\s*industry === 'construction' &&\s*floorNames\.length &&\s*defaultCompanyRows\.length/,
    );
    expect(editor).toMatch(
      /const savedWorkflow\s*=\s*visibleMilestoneFlow\(\s*initial\.terms,\s*initialRows,\s*originalRequirements,\s*\)/,
    );
    expect(editor).toMatch(
      /const hasCompanyWorkDefaults\s*=\s*defaultCompanyRows\.some\(\s*\(row\) => \(row\.steps \?\? \[\]\)\.length > 0/,
    );
    expect(editor).toMatch(
      /companyWorkSnapshotNeedsSync\(\s*savedWorkflow,\s*originalRequirements,\s*companyWorkSnapshot/,
    );
    expect(editor).toMatch(
      /const syncingCompanySchedule\s*=\s*Boolean\(\s*editable &&\s*companySchedule\?\.length &&\s*\(!savedPlan \|\|[\s\S]*workSnapshotNeedsSync/,
    );
    expect(editor).toMatch(
      /const inheritedWork\s*=\s*syncingCompanySchedule && companyWorkSnapshot/,
    );
    expect(editor).toMatch(
      /if \(\s*!editable \|\|\s*industry !== 'construction' \|\|\s*!syncingCompanySchedule/,
    );
    expect(editor).toContain('Updating this draft from the');
  });
});
