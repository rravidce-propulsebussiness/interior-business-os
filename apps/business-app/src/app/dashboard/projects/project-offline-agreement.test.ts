import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8');

describe('optional offline agreement with final quotation', () => {
  const ui = read('./project-v2-view.tsx');
  const forms = read('./project-v2-forms.tsx');
  const action = read('./[id]/site/agreement-actions.ts');
  const data = read('./project-v2-data.ts');
  const migration = read(
    '../../../../../../packages/database/supabase/migrations/20261113110415_project_offline_agreement_skip.sql',
  );
  const databaseTest = read(
    '../../../../../../packages/database/tests/project-agreement.sql',
  );

  it('offers the offline choice only when the database identifies the owner', () => {
    expect(ui).toContain('<SkipAgreementUpload');
    expect(ui).toContain('d.agreement.canAuthorizeException');
    expect(ui).toContain('Use Final quotation without agreement upload');
    expect(forms).toContain('I am the company owner');
    expect(forms).toContain('disabled={pending||saved||!confirmed}');
    expect(forms).toContain('createAgreementException(projectId,contractId,form)');
  });

  it('records an owner exception instead of claiming a customer signature', () => {
    expect(action).toContain("call(projectId, contractId, 'owner_exception'");
    expect(forms).toContain('This does not mark a customer signature or approval.');
    expect(ui).toContain('This is not recorded as a customer signature.');
    expect(data).toContain(
      "['signed_copy_recorded','owner_exception'].includes(stringValue(agreement.clearance_type))",
    );
  });

  it('uses the same quote groups for schedule activation and downstream gates', () => {
    expect(migration).toContain("'signed_copy_recorded','owner_exception'");
    expect(migration).toContain('private.sync_signed_quotation_schedule');
    expect(migration).toContain('public.project_advance_proforma_prepare');
    expect(databaseTest).toContain('offline agreement choice changed the quote payment groups');
    expect(databaseTest).toContain("count(*) from public.payments where contract_id=contract)<>1");
  });
});
