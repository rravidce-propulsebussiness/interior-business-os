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
