import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { LabourDisbursement } from '@business-os/database/labour-disbursements';
import { labourDisbursementsCsv } from './labour-csv';

const read = (url: URL) => readFileSync(url, 'utf8');
const migration = read(
  new URL(
    '../../../../../../../packages/database/supabase/migrations/20261017000300_labour_disbursement_register.sql',
    import.meta.url,
  ),
);
const page = read(new URL('./page.tsx', import.meta.url));
const actions = read(new URL('./actions.ts', import.meta.url));
const route = read(new URL('./export/route.ts', import.meta.url));
const finance = read(new URL('../../finance/page.tsx', import.meta.url));

const row: LabourDisbursement = {
  id: '00000000-0000-4000-8000-000000000001',
  projectId: null,
  projectName: null,
  payeeName: '=PAYLOAD()',
  workDescription: '+Shuttering team',
  workFrom: '2026-10-01',
  workTo: '2026-10-17',
  grossAmount: 15000,
  deductions: 1500,
  netAmount: 13500,
  status: 'paid',
  paymentMethod: 'upi',
  paymentReference: 'UTR-123',
  notes: '"Some note"',
  paidAt: '2026-10-17T12:00:00Z',
  createdAt: '2026-10-17T10:00:00Z',
};

describe('labour register and accountant exports', () => {
  it('generates an Excel-compatible CSV with formula-injection protection', () => {
    const csv = labourDisbursementsCsv([row]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(`"'=PAYLOAD()"`);
    expect(csv).toContain(`"'+Shuttering team"`);
    expect(csv).toContain('\"13500.00\"');
    expect(csv).toContain('\"\"\"Some note\"\"\"');
    expect(csv.split('\r\n')).toHaveLength(3);
  });
  it('does not mix labour expenses with GST purchase input credit or customer receipts', () => {
    expect(migration).toContain('create table private.labour_disbursements');
    expect(migration).toContain('gross_amount');
    expect(migration).toContain('deductions');
    expect(migration).toContain("status in ('pending','paid')");
    expect(migration).toContain(
      "private.finance_require(p_org,'payment.record')",
    );
    expect(migration).toContain(
      "private.finance_require(p_org,'payment.view')",
    );
    expect(migration).toContain('labour_project_scope');
    expect(migration).toContain('for update');
    expect(migration).toContain(
      'private.labour_disbursements enable row level security',
    );
    expect(migration).toContain('audit_logs');
    expect(migration).not.toContain('private.gst_business_documents');
    expect(finance).toContain('href="/dashboard/billing/labour"');
  });
  it('validates payment creation and explicit settlement through server actions', () => {
    expect(actions).toContain(
      "authorization.requirePermission(ctx.organizationId,'payment.record')",
    );
    expect(actions).toContain('paymentInput.parse');
    expect(actions).toContain('z.iso.date()');
    expect(actions).toContain('idSchema.parse');
    expect(actions).toContain(
      'markPaid(ctx.organizationId,id,method,reference)',
    );
    expect(actions).toContain('revalidatePath');
    expect(page).toContain('action={createLabourDisbursement}');
    expect(page).toContain('action={markLabourDisbursementPaid}');
    expect(page).toContain(
      "authorization.requirePermission(ctx.organizationId,'payment.view')",
    );
    expect(page).toContain('Download labour CSV');
  });
  it('protects CSV download with organization-scope authorization, date checks and private headers', () => {
    expect(route).toContain(
      "authorization.requirePermission(ctx.organizationId,'payment.view')",
    );
    expect(route).toContain('createLabourDisbursementsRepository(client)');
    expect(route).toContain('Date.parse(to)-Date.parse(from)>366*86400000');
    expect(route).toContain("'Cache-Control':'private, no-store, max-age=0'");
    expect(route).toContain("'Content-Type':'text/csv; charset=utf-8'");
    expect(route).toContain('labourDisbursementsCsv(rows)');
  });
});
