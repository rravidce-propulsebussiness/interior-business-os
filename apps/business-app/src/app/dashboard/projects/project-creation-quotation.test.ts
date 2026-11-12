import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('delivery project creation starts from a customer quotation', () => {
  const projectStart = file('./new-project-for-customer.tsx');
  const projectsPage = file('./page.tsx');
  const quoteStart = file('../quotations/studio-start.tsx');
  const quotePage = file('../quotations/new/page.tsx');
  const quoteAction = file('../quotations/studio-actions.ts');
  const migration = file('../../../../../../packages/database/supabase/migrations/20261112190531_projects_require_quotation_20261112.sql');

  it('continues an existing customer quote or starts a quote for that customer', () => {
    expect(projectStart).toContain('Continue {quote.number}');
    expect(projectStart).toContain("'/dashboard/quotations/new?customer='");
    expect(projectsPage).toContain(".in('customer_id',customers.map(c=>c.id))");
    expect(projectsPage).toContain("['draft','issued'].includes(status)");
  });

  it('creates direct customer quotes from the selected company customer record', () => {
    expect(quotePage).toContain(".eq('is_sales_prospect', false)");
    expect(quoteStart).toContain('customerId: existingCustomer.id');
    expect(quoteStart).toContain('industryKey: industry');
    expect(quoteAction).toContain('customerId: z.uuid().optional()');
    expect(quoteAction).toContain(".eq('id', values.customerId)");
    expect(quoteAction).toContain('customerId: existingCustomer?.id');
    expect(quoteAction).toContain("p_new_customer: createdCustomer");
  });

  it('closes the legacy blank project RPC and directs stale callers to quotation flow', () => {
    expect(projectStart).not.toContain('customer_project_create');
    expect(migration).toContain("using errcode='23514'");
    expect(migration).toContain('from public,anon,authenticated');
    expect(migration).toContain('accepted quotation and agreement');
    expect(migration).toContain("public.crm_convert(uuid,jsonb)");
    expect(migration).toContain('A quotation is required before creating a project');
  });
});
