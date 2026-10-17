import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = (name: string) => readFileSync(
  fileURLToPath(new URL(name, import.meta.url)), 'utf8',
);

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
    const file = readFileSync(fileURLToPath(new URL('./quotation-pdf-file.ts', import.meta.url)), 'utf8');
    expect(preview).toContain('authorizeWhatsAppPdfAttachment(revisionId)');
    expect(preview).toContain("status === 'draft' && !window.confirm(");
    expect(preview).toContain('fetchQuotationPdfFile(revisionId, number)');
    expect(preview).toContain('supportsPdfFileSharing(preparedPdf)');
    expect(preview).toContain('sharePdfFile(preparedPdf, number)');
    expect(preview).toContain('downloadQuotationPdfFile(preparedPdf)');
    expect(preview).not.toContain("'/q/' + result.token");
    expect(preview).not.toContain('window.location.assign');
    expect(share).not.toContain("export async function createWhatsAppPdfShare");
    expect(share).toContain("commercialServices('quotation.share', 'quotation')");
    expect(share).toContain('hasSavedStagePaymentPlan(revision.terms)');
    expect(share).toContain("s.allowed('quotation.issue', 'quotation')");
    expect(share).not.toContain("p_action: 'create'");
    expect(file).toContain("new File([blob], quotationPdfFilename(quoteNumber)");
    expect(file).toContain("await blob.slice(0, 5).text() !== '%PDF-'");
    expect(file).toContain('navigator.share({');
    expect(file).toContain('files: [file]');
    expect(file).toContain("credentials: 'same-origin'");
  });

  it('shows the share action only to permitted users on desktop and mobile', () => {
    expect(leadsPage).toContain("canShareQuote={s.allowed('quotation.share', 'quotation')}");
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
  const nodeRenderer = fileURLToPath(new URL('../../../../../../packages/shared/src/pdf.node.ts', import.meta.url));

  it('renders the same saved premium HTML in Leads, Quotations and Studio', () => {
    expect(leadsPreview).toContain("fetch(base + '/preview'");
    expect(quoteList).toContain("const preview = '/dashboard/quotations/' + row.id + '/preview'");
    expect(quoteStudio).toContain('srcDoc={previewHtml}');
    expect(privatePreview).toContain('quotationDocument(id)');
    expect(privatePdf).toContain('quotationDocument(id)');
    expect(privatePdf).toContain('renderQuotationPdf(html, document)');
    expect(publicPdf).toContain('renderQuotationDocument(q.document)');
    expect(publicPdf).toContain('renderQuotationPdf(');
  });

  it('uses browser HTML printing when provisioned and keeps the real PDF file for sharing', () => {
    const renderer = readFileSync(nodeRenderer,'utf8');
    const pdfEntry = readFileSync(fileURLToPath(new URL('../../../../../../packages/shared/src/pdf.ts', import.meta.url)), 'utf8');
    const pdfClient = file('./quotation-pdf-file.ts');
    expect(renderer).toContain("CHROMIUM_EXECUTABLE_PATH");
    expect(renderer).toContain("chromium.launch");
    expect(pdfEntry).toContain("env.CF_BROWSER_ACCOUNT_ID && env.CF_BROWSER_API_TOKEN");
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
    expect(studio).toContain("href={url + '/preview'}");
    expect(studio).toContain('View saved quotation');
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

  it('Save delegates to real persisted child actions, not a refresh fake', () => {
    expect(studio).not.toContain('saveButton.click()');
    expect(studio).not.toContain('router.refresh();');
    expect(sft).toContain('data-studio-save="quote"');
    expect(construction).toContain('data-studio-save="quote"');
    expect(interior).toContain("data-studio-save={!selectedPackage ? 'quote' : undefined}");
    expect(payments).toContain('data-studio-save="payments"');
    expect(file('./quotation-terms-editor.tsx')).toContain('data-studio-save="files"');
  });

  it('preserves independent revision workflow and redirects legacy studio preview links', () => {
    expect(studio).toContain('reviseEditor');
    expect(page).toContain('CreateRevisionControl');
    expect(page).toContain("query.step === 'preview'");
    expect(page).toContain("redirect('/dashboard/quotations/' + encodeURIComponent(id) + '/preview')");
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
    expect(construction).toContain('<option value="custom">Custom Quote</option>');
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
    expect(form).toContain('onChange={(event) => chooseLead(event.target.value)}');
    expect(form).toContain('const industry = selectedLead?.industryKey');
    expect(form).toContain('Auto-detected from lead');
    expect(form).toContain('disabled={pending || !leadId || !industry');
    expect(form).toContain("industry === 'construction' && !initialCustomizedQuote ? 'sft' : 'custom'");
  });

  it('does not require a project name before the lead is Won', () => {
    const convert = file('../crm/leads/[id]/convert/page.tsx');
    expect(form).toContain('Client &amp; Quotation Details');
    expect(form).not.toContain('Enter project name');
    expect(form).not.toContain('data.projectName');
    expect(action).not.toContain('projectName: z.string()');
    expect(action).toContain('leadQuotationProjectIds');
    expect(action).toContain("'is_sales_prospect', true");
    expect(action).toContain("p_name: prospectName");
    expect(convert).toContain("project_name: quoteProject.is_sales_prospect ? ''");
    expect(convert).toContain("label: 'Project name'");
  });

  it('derives category from the tenant lead and rejects unknown classifications', () => {
    expect(page).toContain('resolveLeadCategory(entry, enabledIndustries)');
    expect(action).toContain('leadId: z.uuid()');
    expect(action).not.toContain('industryKey: z.string()');
    expect(action).toContain('entry.id === lead.industry_id');
    expect(action).toContain('resolveLeadCategory(lead, industries)');
    expect(action).toContain('Classify this lead in CRM');
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
    expect(library).toContain('Custom Quote');
    expect(library).toContain('Create Custom Quote');
    expect(library).toContain('/dashboard/quotations/new?mode=custom');
    expect(stylesheet).toContain('.qpl-cards');
    expect(stylesheet).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
    expect(stylesheet).toContain('@media (max-width:740px)');
  });

  it('preserves editing, duplication, removal and company snapshot PDF previews', () => {
    expect(library).toContain('<PremiumPackageEditor');
    expect(library).toContain('<IndustryPackageEditor');
    expect(library).toContain('duplicateConstructionPackage');
    expect(library).toContain('deleteConstructionPackage');
    expect(library).toContain('duplicateQuotationPackage');
    expect(library).toContain('deleteQuotationPackage');
    expect(library).toContain("preview?format=pdf");
    expect(library).toContain("detail.item.status === 'active'");
    expect(library).toContain("construction.map((item)");
    expect(library).toContain("(other ?? []).map((item)");
  });

  it('routes through classified CRM leads then preselects tenant-owned package or custom mode', () => {
    expect(library).toContain('new URLSearchParams');
    expect(library).toContain('package: entry.item.id');
    expect(createPage).toContain('initialPackageId={initialPackageId');
    expect(creation).toContain("initialPackageIndustry === industry");
    expect(creation).toContain("route.set('package', 'custom')");
    expect(studio).toContain('initialPackageId={query.package ??');
    expect(file('./construction-selector.tsx')).toContain("initialPackageId === 'custom'");
    expect(file('./interior-room-builder.tsx')).toContain("initialPackageId === 'custom'");
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
    expect(css).toContain('.qs-field-full, .qs-clean-notes { grid-column:1/-1; }');
    expect(css).toContain('grid-template-columns:minmax(0,1fr)');
    expect(css).not.toContain('.qs-create-field-grid .qs-clean-field:nth-child(');
  });

  it('has one scoped focus ring instead of inherited teal shadow and orange outline', () => {
    expect(css).toContain('.qs-clean-create .qs-clean-field :is(input,select,textarea):focus');
    expect(css).toContain('outline:none !important;');
    expect(css).toContain('box-shadow:0 0 0 3px rgba(249,115,22,.19) !important;');
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
    expect(form).toContain('...data, leadId, currency: defaultCurrency');
    expect(action).not.toContain('customerId: z.uuid()');
    expect(action).toContain("await s.client.rpc('lead_quotation_list'");
    expect(action).toContain('contactMatches(candidate, values)');
    expect(action).toContain('phone: lead.phone');
    expect(action).toContain('let customerId = leadCustomerId || matches[0]?.id ||');
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

  it('shows one mobile customer card containing all quote options for their customer ID', () => {
    expect(list).toContain(".select('id,industry_id,customer_id')");
    expect(list).toContain('const customerGroups = new Map<string');
    expect(list).toContain('customerGroups.get(quote.customerId)');
    expect(list).toContain('group.quotes.push(quote)');
    expect(list).toContain('mobileCustomers.map((group)');
    expect(list).toContain('renderMobileQuote(group.quotes[0]!)');
    expect(list).toContain('renderTableRow(group.quotes[0]!)');
    expect(list).toContain('group.quotes.slice(1).map(');
    expect(list).toContain('qs-quotes-customer-card');
    expect(list).toContain('qs-quotes-mobile-quote');
    expect(list).toContain('<QuotationReviseButton');
    expect(css).toContain('.qs-quotes-customer-header');
  });
});

describe('latest quote per customer with expandable prior history', () => {
  const page = file('./page.tsx');
  const css = file('./quotations-list.css');

  it('orders by newly created quotation date rather than revised snapshot date', () => {
    expect(page).toContain("from('quotations')");
    expect(page).toContain(".select('id,created_at')");
    expect(page).toContain('quoteCreatedAt.get(revision.quotation_id)');
    expect(page).toContain("b.createdAt ?? ''");
    expect(page).toContain('b.row.quotation_number');
  });

  it('only renders the newest quote initially on desktop and mobile', () => {
    expect(page).toContain('renderTableRow(group.quotes[0]!)');
    expect(page).toContain('renderMobileQuote(group.quotes[0]!)');
    expect(page).toContain('<QuotationMobileFooter count={group.quotes.length}');
    expect(page).toContain('View all quotations ({group.quotes.length})');
    expect(page).toContain('group.quotes.slice(1).map(');
    expect(css).toContain('.qs-quotes-history[open]');
    expect(page).toContain('<QuotationMobileMore>');
    expect(page).toContain("pdfHref={'/dashboard/quotations/'");
    expect(css).toContain('.qs-quotes-mobile-card-footer');
    expect(css).toContain('.qs-quotes-mobile-more-panel');
  });

  it('keeps other quote options available with independent editing and PDF download', () => {
    expect(page).toContain("row.status === 'draft' && canEdit");
    expect(page).toContain('QuotationReviseButton');
    expect(page).not.toContain("editor + '?step=preview'");
    expect(page).toContain("const preview = '/dashboard/quotations/' + row.id + '/preview'");
    expect(page).toContain('QuotationRemovalButton');
  });
});

describe('premium mobile quotation actions and matching workspace navigation', () => {
  const page = file('./page.tsx');
  const mobile = file('./quotation-mobile-disclosures.tsx');
  const css = file('./quotations-list.css');
  const frame = file('./studio-frame.tsx');

  it('has exactly one visible set of compact controls and a separate PDF footer', () => {
    expect(page).toContain('<QuotationMobileMore>');
    expect(page).toContain('<QuotationMobileFooter count={group.quotes.length}');
    expect(page).not.toContain('qs-quotes-mobile-more"');
    expect(page).not.toContain('<summary>••• More</summary>');
    expect(page).toContain("row.status === 'draft' && canEdit");
    expect(page).toContain('QuotationReviseButton');
    expect(page).toContain('QuotationRemovalButton');
    expect(mobile).toContain('aria-expanded={open}');
    expect(mobile).toContain('setOpen((value) => !value)');
    expect(mobile).toContain('qs-quotes-mobile-more-panel');
    expect(mobile).toContain('qs-quotes-mobile-expanded');
  });

  it('keeps More as a separate row without a Share tile or overlap', () => {
    expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(css).toContain('.qs-quotes-mobile-actions > .qs-quotes-mobile-more-panel');
    expect(css).toContain('.qs-quotes-mobile-actions > .qs-quotes-more-trigger');
    expect(page).not.toContain('qs-quotes-action-share');
    expect(page).not.toContain('Review and share in Quotation Studio');
    expect(css).toContain('grid-column:1/-1');
    expect(css).toContain('width:100%;height:49px;min-height:49px');
    expect(css).toContain('@keyframes qs-quote-expand');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps a visible hamburger with Leads-style accessible drawer on scroll', () => {
    expect(frame).toContain('qs-mobile-menu-button');
    expect(frame).toContain('aria-controls="qs-sidebar-navigation"');
    expect(frame).toContain("setMenuOpen(true)");
    expect(css).toContain('position: sticky;');
    expect(css).toContain('.qs-layout:has(.qs-quotes-page) .qs-mobile-menu-button');
  });
});

describe('compact single-screen construction quotation editor', () => {
  const selector = file('./construction-selector.tsx');
  const editor = file('./premium-sft-builder.tsx');
  const actions = file('./construction-actions.ts');
  const css = file('./studio.css');

  it('uses company orange hero and one package selector instead of a navy multi-step wizard', () => {
    expect(selector).not.toContain('qs-build-overview');
    expect(selector).not.toContain('Saved estimate');
    expect(selector).not.toContain('clientName');
    expect(selector).toContain('Select construction quotation package');
    expect(selector).toContain('qs-build-package-rate');
    expect(css).not.toContain('.qs-build-overview');
    expect(css).not.toContain('.qs-studio-compact-bar');
    expect(css).toContain('#f16a22');
    expect(editor).not.toContain('01 · Package & floor costing');
    expect(editor).not.toContain('02 · Package specifications');
    expect(editor).not.toContain('Build your quotation, floor by floor.');
  });

  it('offers floor count and optional shelves with direct area inputs', () => {
    expect(editor).toContain('setFloors(n)');
    expect(editor).toContain("'Ground Floor','First Floor','Second Floor'");
    expect(editor).toContain('Shelves & Sajjas');
    expect(editor).toContain("name:'Shelves & Sajjas'");
    expect(editor).toContain("'Compound Wall'");
    expect(editor).toContain("'wall_sqft'");
    expect(editor).toContain('Length (ft)');
    expect(editor).toContain('Height (ft)');
    expect(editor).toContain('Area / Qty');
    expect(editor).toContain('data-studio-save="quote"');
  });

  it('stores brand edits in a quotation specification snapshot, not a package template', () => {
    expect(editor).toContain('Edit all material specifications');
    expect(editor).toContain('Apply to this quotation');
    expect(editor).toContain('master package remains untouched');
    expect(editor).toContain('Quote-only editable');
    expect(editor).toContain('setDraftSections(curr=>curr.map(');
    expect(editor).toContain('setSections(draftSections.map(');
    expect(editor).toContain('cancelMaterials');
    expect(editor).toContain("'/dashboard/quotations/'+revisionId+'/sft-save'");
    expect(editor).toContain('if(validationMessage)');
    expect(editor).toContain('setSavedVersion(data.version??savedVersion+1)');
    expect(editor).toContain('propagateFloorChanges(current,index,patch)');
    expect(editor).not.toContain('construction_package_save');
    expect(actions).toContain('const calculated = calculateSftEstimate(');
    expect(actions).toContain('const description = encodeSftEstimate(calculated)');
  });
});

describe('unified construction quote page and reliable preview', () => {
  const detail = file('./[id]/page.tsx');
  const studio = file('./studio-editor.tsx');
  const page = file('./[id]/studio/page.tsx');
  const editor = file('./premium-sft-builder.tsx');

  it('redirects the old details route to Studio without a second editor', () => {
    expect(detail).toContain("redirect('/dashboard/quotations/'");
    expect(detail).not.toContain('LineForm');
    expect(studio).not.toContain('Advanced item editing, discounts &amp; revisions');
    expect(studio).toContain('!isConstruction && <section className="qs-card"');
  });
  it('passes authenticated PDF preview HTML instead of depending on a separate iframe request', () => {
    expect(page).toContain('quotationDocument(revision.id)');
    expect(page).toContain('previewHtml={previewHtml}');
    expect(editor).not.toContain('srcDoc={previewHtml}');
    expect(editor).not.toContain('Hide inline preview');
    expect(editor).toContain('<QuotationPdfControls');
    expect(editor).not.toContain('Hide inline preview');
    expect(editor).toContain('<QuotationPdfControls');
  });
});

describe('PDF attachment sharing and reliable file operations', () => {
  const editor = file('./premium-sft-builder.tsx');
  const controls = file('./quotation-pdf-controls.tsx');
  const renderer = file('./pdf-renderer.ts');
  const secureRoute = file('./[id]/pdf/route.ts');
  const css = file('./studio.css');

  it('shows only view PDF, download PDF, and actual file share actions', () => {
    expect(editor).toContain('<QuotationPdfControls');
    expect(controls).toContain('◉ View PDF');
    expect(controls).toContain('↓ Download PDF');
    expect(controls).toContain('Share PDF to WhatsApp');
    expect(controls).not.toContain('wa.me/');
    expect(editor).not.toContain('Hide inline preview');
    expect(editor).not.toContain("url+'/studio?step=preview'");
    expect(css).toContain('.qs-work-pdf-actions');
    expect(css).not.toContain('.qs-work-preview-grid');
  });

  it('opens the same premium HTML preview in Leads and the quotations list, keeping PDF output separate', () => {
    const list = file('./page.tsx');
    const studio = file('./studio-editor.tsx');
    expect(list).toContain("const preview = '/dashboard/quotations/' + row.id + '/preview'");
    expect(studio).toContain("href={url + '/preview'}");
    expect(studio).not.toContain("'/pdf?view=1&version=' + revisionVersion");
    expect(studio).not.toContain('Print A4 design / Save as PDF');
    expect(studio).not.toContain('qs-studio-compact-bar');
  });

  it('shares the same checked PDF File through the Studio and Leads', () => {
    const common = file('./quotation-pdf-file.ts');
    expect(controls).toContain('fetchQuotationPdfFile(revisionId, quoteNumber, signal)');
    expect(controls).toContain('supportsPdfFileSharing(pdf)');
    expect(controls).toContain('sharePdfFile(pdf, quoteNumber)');
    expect(controls).toContain('downloadQuotationPdfFile(pdf)');
    expect(controls).toContain('choose WhatsApp');
    expect(controls).toContain('if (dirty)');
    expect(common).toContain("new File([blob], quotationPdfFilename(quoteNumber)");
    expect(common).toContain("await blob.slice(0, 5).text() !== '%PDF-'");
    expect(common).toContain('navigator.share({');
    expect(common).toContain('files: [file]');
    expect(common).toContain("credentials: 'same-origin'");
  });

  it('uses one premium HTML PDF printer without switching to a second template', () => {
    const common = file('./quotation-pdf-file.ts');
    expect(common).toContain('/pdf?view=1&_pdf=');
    expect(controls).toContain("'?view=1&version=' + version");
    expect(controls).toContain('downloadRoute');
    expect(renderer).not.toContain('renderQuotationFallbackPdf');
    expect(renderer).toContain('return renderPdf(safeQuotationPrintHtml(html)');
    expect(renderer).toContain('customerDocumentSchema.parse(document)');
    expect(secureRoute).toContain('renderQuotationPdf(html, document)');
  });
});

describe('split-floor construction area editing and resilient PDF routes', () => {
  const pkg = file('../pricing/construction/premium-package-editor.tsx');
  const builder = file('./premium-sft-builder.tsx');
  const pdf = file('./[id]/pdf/route.ts');

  it('keeps parking and penthouse rate defaults in company package settings', () => {
    expect(pkg).toContain('Default parking area rate');
    expect(pkg).toContain('Same as construction package');
    expect(pkg).not.toContain('Default penthouse rate');
    expect(pkg).toContain('writeFloorRateDefaults(sections');
    expect(pkg).toContain('name="specSections" value={JSON.stringify(savedSections)}');
  });

  it('allows independently priced construction, parking and penthouse portions', () => {
    expect(builder).toContain("type FloorZone = 'construction' | 'parking' | 'penthouse'");
    expect(builder).toContain("floorZoneName(level,zone)");
    expect(builder).toContain("zone==='parking'");
    expect(builder).toContain('selectPenthouseFloor(current,level)');
    expect(builder).toContain('combinedArea');
    expect(builder).toContain('floorRateDefaults.parking');
    expect(builder).toContain('editableSftRows(initialSchedule)');
    expect(builder).not.toContain('floorRateDefaults.penthouse');
    expect(builder).toContain("zone==='parking'");
    expect(builder).toContain("rows.length>=18");
  });

  it('serves base PDF when optional annexure credentials are not set', () => {
    expect(pdf).toContain('privilegedStorageConfigured');
    expect(pdf).toContain('const base = await renderQuotationPdf(html, document)');
    expect(pdf).toContain('const bytes = await appendQuotationAnnexures(base, additional)');
  });
});

describe('save resiliency and floor auto-inheritance', () => {
  const builder = file('./premium-sft-builder.tsx');
  const action = file('./construction-actions.ts');

  it('accepts Save taps and reports invalid row fields rather than disabling the button', () => {
    expect(builder).toContain('disabled={pending}');
    expect(builder).toContain('if(validationMessage)');
    expect(builder).toContain('setMessage(validationMessage)');
    expect(builder).toContain('setSavedVersion(data.version??savedVersion+1)');
    expect(builder).toContain("sftEstimateInputSchema.safeParse(savePayload)");
  });

  it('copies updates through linked upper floors while supporting individual exceptions', () => {
    expect(builder).toContain('propagateFloorChanges(current,index,patch)');
    expect(builder).toContain('restoreFloorFollowing(current,level)');
    expect(builder).toContain("Follow lower floor");
    expect(builder).toContain('inheritFromPrevious');
  });

  it('never checks private PDF tables with the authenticated browser client', () => {
    const floorSave = action.slice(action.indexOf('export async function saveFloorwiseSftEstimate('));
    expect(floorSave).not.toContain("s.client.from('quotation_studio_attachments')");
    expect(floorSave).not.toContain("s.client.from('construction_package_spec_attachments')");
    expect(floorSave).toContain('privilegedStorageConfigured');
    expect(floorSave).toContain('const id = await s.commercial.saveManualLine(');
    expect(floorSave).toContain('attachmentWarning');
  });
});

describe('regression for Ground Floor Save and penthouse default rate', () => {
  const editor = file('./premium-sft-builder.tsx');
  const pkg = file('../pricing/construction/premium-package-editor.tsx');
  it('converts saved snapshot rows to strict editable inputs without deleting floor measurements', () => {
    expect(editor).toContain('editableSftRows(initialSchedule)');
    expect(editor).toContain('sftEstimateInputSchema.safeParse(savePayload)');
  });
  it('sets new penthouse to construction rate, not separate package rate', () => {
    expect(editor).not.toContain('floorRateDefaults.penthouse');
    expect(pkg).toContain('penthouse:');
    expect(pkg).toContain("penthouse: ''");
    expect(pkg).toContain('Same as construction package');
  });
});

describe('exclusive penthouse + actual HTTP save route', () => {
  const builder = file('./premium-sft-builder.tsx');
  const route = file('./[id]/sft-save/route.ts');
  it('replaces the top floor with penthouse and retains normal floor area only once',()=>{
    expect(builder).toContain('normalizePenthouseFloors(initial.map(');
    expect(builder).toContain('selectPenthouseFloor(current,level)');
    expect(builder).toContain('selectNormalFloor(current,group.level)');
    expect(builder).toContain("group.isPenthouse?'Penthouse ('+group.name+')':group.name");
  });
  it('saves through authenticated tenant-aware HTTP rather than stale hosted action IDs',()=>{
    expect(builder).toContain("method:'POST',credentials:'same-origin'");
    expect(builder).toContain("body:JSON.stringify({version:savedVersion,input:savePayload})");
    expect(route).toContain('saveFloorwiseSftEstimate(id,data.data.version,data.data.input)');
    expect(route).toContain('Cross-site quotation save denied.');
    expect(route).toContain("Cache-Control': 'private, no-store'");
    expect(builder).toContain('setMessage(detail');
  });
});


describe('streamlined quote, terms and payment Studio', () => {
  const studio = file('./studio-editor.tsx');
  const page = file('./[id]/studio/page.tsx');
  const terms = file('./quotation-terms-editor.tsx');
  const settings = file('./settings/page.tsx');
  const css = file('./studio.css');

  it('keeps only three editing tabs and removes duplicate client and branding panels', () => {
    expect(studio).toContain("{ id: 'quote', title: 'Scope' }");
    expect(studio).toContain("{ id: 'files', title: 'Terms & Inclusions' }");
    expect(studio).toContain("{ id: 'payments', title: 'Payment Schedule' }");
    expect(studio).not.toContain("id: 'client'");
    expect(studio).not.toContain("step === 'client'");
    expect(studio).not.toContain('qs-client-strip');
    expect(studio).not.toContain('Client &amp; Project Details');
    expect(studio).not.toContain('View details');
    expect(studio).not.toContain('brandingEditor');
    expect(page).not.toContain('DraftBrandingControl');
    expect(page).toContain('<QuotationTermsEditor');
    expect(settings).toContain('branding.logo_data_uri');
    expect(settings).toContain('branding.cover_image_data_uri');
  });

  it('provides quote-specific cards and one working Save for terms', () => {
    expect(terms).toContain('Quotation validity');
    expect(terms).toContain('Inclusions');
    expect(terms).toContain('Exclusions');
    expect(terms).toContain('Warranty');
    expect(terms).toContain('Additional terms');
    expect(terms).toContain('Customer notes');
    expect(terms).toContain('Internal notes');
    expect(terms).toContain('data-studio-save="files"');
    expect(terms).toContain("kind:'terms'");
    expect(terms).toContain("'/dashboard/quotations/'+initial.revision_id+'/conditions'");
    expect(file('./[id]/conditions/route.ts')).toContain('paymentPlan:saved.paymentPlan');
    expect(studio).toContain("{step === 'files' && termsEditor}");
    expect(studio).not.toContain('qs-studio-compact-bar');
    expect(studio).not.toContain('<h1>{industryName} Quote</h1>');
    expect(studio).not.toContain('qs-studio-hero');
    expect(css).toContain('.qs-terms-grid');
    expect(css).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
  });
  
  it('shows only milestone payment details on the Payment Schedule tab', () => {
    const payments = file('./payment-schedule-editor.tsx');
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
    expect(library).toContain('<CustomPackageManager rates={rates} canManage={canManage}');
    expect(file('./packages/custom-package-manager.tsx')).toContain('Manage brands');
    expect(quotePage).toContain('createConstructionRatesRepository');
    expect(selector).toContain('Custom Quote · Choose customer brands');
    expect(selector).toContain('consumptionPerSqft');
    expect(selector).toContain('saveCustomBrandQuote');
  });

  it('saves price cards from PostgreSQL as one editable quotation line', () => {
    expect(actions).toContain("const price = await createConstructionRatesRepository");
    expect(actions).toContain('encodeCustomBrandQuote');
    expect(actions).toContain("...(existing[0] ? { id: existing[0].id } : {})");
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

  it('uses three top tabs and a compact custom package card, not an accordion', () => {
    expect(library).toContain("tab === 'custom'");
    expect(library).toContain('Custom Package Management');
    expect(library).toContain('Manage Custom Package');
    expect(library).not.toContain('<details className="qpl-brand-pricing">');
    expect(library).toContain('Compare Packages');
    expect(library).toContain('Add New Package');
  });
  it('edits company units and brand options through authorized atomic persistence', () => {
    expect(manager).toContain('cpm-table');
    expect(manager).toContain('Manage brands');
    expect(manager).toContain('Add Material');
    expect(manager).toContain('Save Changes');
    expect(manager).toContain('saveCustomPackageSettings');
    expect(action).toContain('construction_custom_package_settings');
    expect(css).toContain('@media(max-width:670px)');
  });
  it('provides a real authenticated Custom Package PDF instead of an inert CTA', () => {
    expect(pdf).toContain('catalogPage(true)');
    expect(pdf).toContain('renderPdf(html');
    expect(pdf).toContain('renderConstructionPackageSamplePdf');
    expect(pdf).toContain("'Content-Type':'application/pdf'");
  });
});
