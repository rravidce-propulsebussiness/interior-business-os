import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = (name: string) => readFileSync(
  fileURLToPath(new URL(name, import.meta.url)), 'utf8',
);

describe('minimal quotation studio navigation', () => {
  const studio = file('./studio-editor.tsx');
  const sft = file('./premium-sft-builder.tsx');
  const payments = file('./payment-schedule-editor.tsx');
  const interior = file('./interior-room-builder.tsx');
  const construction = file('./construction-selector.tsx');
  const page = file('./[id]/studio/page.tsx');

  it('shows only Save and Preview & Share in the primary action toolbar', () => {
    const actions = studio.match(/<div className="qs-toolbar qs-studio-actions"[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(actions).toContain('▣ Save');
    expect(actions).toContain('◉ Preview &amp; Share');
    expect((actions.match(/<button/g) ?? [])).toHaveLength(2);
    expect(studio).not.toContain('Save Draft');
    expect(studio).not.toContain('Issue & Share');
    expect(studio).not.toContain('qs-stepper" aria-label="Quotation steps"');
    expect(studio).not.toContain('qs-sector-tabs');
    expect(studio).not.toContain('qs-method-tabs');
  });

  it('Save delegates to real persisted child actions, not a refresh fake', () => {
    expect(studio).toContain('saveButton.click()');
    expect(studio).not.toContain('router.refresh();');
    expect(sft).toContain('data-studio-save="quote"');
    expect(construction).toContain('data-studio-save="quote"');
    expect(interior).toContain("data-studio-save={!selectedPackage ? 'quote' : undefined}");
    expect(payments).toContain('data-studio-save="payments"');
    expect(page).toContain('data-studio-save-section="files"');
  });

  it('preserves server-side issue/share and new revision after customer sharing', () => {
    expect(studio).toContain('issueEditor');
    expect(studio).toContain('reviseEditor');
    expect(page).toContain('Confirm & Enable Customer Sharing');
    expect(page).toContain('CreateRevisionControl');
    expect(studio).toContain('Preview contains saved amounts');
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
    expect(form).toContain("industry === 'construction' ? 'sft' : 'custom'");
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
    expect(page).toContain('group.quotes.length > 1 && <details');
    expect(page).toContain('View all quotations ({group.quotes.length})');
    expect(page).toContain('group.quotes.slice(1).map(');
    expect(css).toContain('.qs-quotes-history[open]');
  });

  it('keeps other quote options available with independent edit and sharing', () => {
    expect(page).toContain("row.status === 'draft' && canEdit");
    expect(page).toContain('QuotationReviseButton');
    expect(page).toContain("editor + '?step=preview'");
    expect(page).toContain('QuotationRemovalButton');
  });
});

describe('compact single-screen construction quotation editor', () => {
  const selector = file('./construction-selector.tsx');
  const editor = file('./premium-sft-builder.tsx');
  const actions = file('./construction-actions.ts');
  const css = file('./studio.css');

  it('uses company orange hero and one package selector instead of a navy multi-step wizard', () => {
    expect(selector).toContain('qs-build-overview');
    expect(selector).toContain('quoteNumber ||');
    expect(selector).toContain('savedTotal ||');
    expect(selector).toContain('Select construction quotation package');
    expect(selector).toContain('qs-build-package-rate');
    expect(css).toContain('.qs-build-overview');
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

  it('shares an actual checked PDF File, not a link, using native Android sharing', () => {
    expect(controls).toContain("new File([blob], filename, { type: 'application/pdf' })");
    expect(controls).toContain("header !== PDF_HEADER");
    expect(controls).toContain('navigator.canShare?.({ files: [pdf] })');
    expect(controls).toContain('void navigator.share({');
    expect(controls).toContain('files: [pdf]');
    expect(controls).toContain('choose WhatsApp');
    expect(controls).toContain('downloadFile(pdf)');
    expect(controls).toContain("if (dirty)");
  });

  it('uses authenticated PDF bytes with renderer-independent fallback', () => {
    expect(controls).toContain("credentials: 'same-origin'");
    expect(controls).toContain("'/pdf?view=1'");
    expect(renderer).toContain('renderQuotationFallbackPdf');
    expect(renderer).toContain('parseSftEstimate');
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
    expect(builder).toContain('setSavedVersion(response.version??savedVersion+1)');
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
