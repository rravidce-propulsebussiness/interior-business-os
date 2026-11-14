import { expectSource } from './source-test-assertions';
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('delivery project creation starts from a customer quotation', () => {
  const projectStart = file('./new-project-for-customer.tsx');
  const projectsPage = file('./page.tsx');
  const quoteStart = file('../quotations/studio-start.tsx');
  const quotePage = file('../quotations/new/page.tsx');
  const quoteAction = file('../quotations/studio-actions.ts');
  const migration = file(
    '../../../../../../packages/database/supabase/migrations/20261112190531_projects_require_quotation_20261112.sql',
  );
  const projectView = file('./project-v2-view.tsx');
  const linkAction = file('./project-quotation-link-action.ts');
  const linker = file('./project-quotation-linker.tsx');
  const workspace = file('./project-v2-data.ts');

  it('continues an existing customer quote or starts a quote for that customer', () => {
    expectSource(projectStart).toContain('Continue {quote.number}');
    expectSource(projectStart).toContain(
      "'/dashboard/quotations/new?customer='",
    );
    expectSource(projectsPage).toContain(
      ".in('customer_id',customers.map(c=>c.id))",
    );
    expectSource(projectsPage).toContain("['draft','issued'].includes(status)");
  });

  it('creates direct customer quotes from the selected company customer record', () => {
    expectSource(quotePage).toContain(".eq('is_sales_prospect', false)");
    expectSource(quoteStart).toContain('customerId: existingCustomer.id');
    expectSource(quoteStart).toContain('industryKey: industry');
    expectSource(quoteAction).toContain('customerId: z.uuid().optional()');
    expectSource(quoteAction).toContain(".eq('id', values.customerId)");
    expectSource(quoteAction).toContain(
      'let customerId = existingCustomer?.id ||',
    );
    expectSource(quoteAction).toContain('p_customer_id: customerId');
    expectSource(quoteAction).toContain('p_new_customer: createdCustomer');
  });

  it('syncs planned stages from the current Final quote when a delivery project is created', () => {
    const leadProjectAction = file('../crm/leads/lead-project-actions.ts');
    const handoff = file(
      '../../../../../../packages/database/supabase/migrations/20261113200000_auto_sync_final_quote_project_timeline.sql',
    );
    expectSource(leadProjectAction).toContain("rpc('quotation_final_choices'");
    expectSource(leadProjectAction).toContain(
      "rpc('contract_create_for_project_quote'",
    );
    expectSource(leadProjectAction).toContain(
      'syncQuotedConstructionTimeline(contractId.data)',
    );
    expectSource(leadProjectAction).toContain(
      'No customer acceptance, signed agreement, or payment was recorded.',
    );
    expectSource(handoff).toContain("rev.status not in ('draft','issued')");
    expectSource(handoff).toContain('q.current_revision_id=rev.id');
    expectSource(handoff).toContain('quotation_final_choices');
    expectSource(handoff).toContain('planned stages');
  });

  it('closes the legacy blank project RPC and directs stale callers to quotation flow', () => {
    expectSource(projectStart).not.toContain('customer_project_create');
    expectSource(migration).toContain("using errcode='23514'");
    expectSource(migration).toContain('from public,anon,authenticated');
    expectSource(migration).toContain('accepted quotation and agreement');
    expectSource(migration).toContain('public.crm_convert(uuid,jsonb)');
    expectSource(migration).toContain(
      'A quotation is required before creating a project',
    );
  });

  it('lets an owner attach an existing quote to its converted lead without cloning it', () => {
    expectSource(projectView).toContain(
      '<ProjectQuotationLinker projectId={d.project.id} quotes={d.linkableQuotations}/>',
    );
    expectSource(workspace).toContain('linkableQuotations');
    expectSource(linkAction).toContain("rpc('lead_quotation_link'");
    expectSource(linkAction).toContain(
      'quote.customer_id !== project.customer_id',
    );
    expectSource(linkAction).toContain(
      'source.industry_id !== project.industry_id',
    );
    expectSource(linkAction).toContain("['pending', 'active', 'on_hold']");
    expectSource(linkAction).not.toContain("from('quotations').update");
    expectSource(linkAction).not.toContain(
      "from('quotation_revisions').update",
    );
    expectSource(linker).toContain('does not issue');
    expectSource(linker).toContain('record customer approval or payment.');
  });
});
