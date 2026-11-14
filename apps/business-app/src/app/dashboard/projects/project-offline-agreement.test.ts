import { expectSource } from './source-test-assertions';
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8');

describe('optional offline agreement with final quotation', () => {
  const designWorkflow = read('./project-design-stage-workflow.tsx');
  const forms = read('./project-v2-forms.tsx');
  const action = read('./[id]/site/agreement-actions.ts');
  const data = read('./project-v2-data.ts');
  const migration = read(
    '../../../../../../packages/database/supabase/migrations/20261113110415_project_offline_agreement_skip.sql',
  );
  const quoteSetupGuard = read(
    '../../../../../../packages/database/supabase/migrations/20261113161437_allow_final_quote_project_agreement.sql',
  );
  const stageGuidanceGuard = read(
    '../../../../../../packages/database/supabase/migrations/20261113163106_allow_saved_final_quote_stage_guidance.sql',
  );
  const databaseTest = read(
    '../../../../../../packages/database/tests/project-agreement.sql',
  );

  it('offers the offline choice only when the database identifies the owner', () => {
    expectSource(designWorkflow).toContain('<SkipAgreementUpload');
    expectSource(designWorkflow).toContain('agreement?.canAuthorizeException && hasOwnerAccess');
    expectSource(forms).toContain('I am the company owner');
    expectSource(forms).toContain('disabled={pending||saved||!confirmed}');
    expectSource(forms).toContain(
      'createAgreementException(projectId,contractId,form)',
    );
  });

  it('records the owner-confirmed offline homeowner approval without claiming a digital signature', () => {
    expectSource(action).toContain(
      "call(projectId, contractId, 'owner_exception'",
    );
    expectSource(forms).toContain(
      'confirm the homeowner approved this final quotation or agreement offline.',
    );
    expectSource(forms).toContain('Record offline homeowner approval');
    expectSource(forms).toContain('confirm the homeowner approved this final quotation or agreement offline.');
    expectSource(data).toContain(
      "['signed_copy_recorded','owner_exception'].includes(stringValue(agreement.clearance_type))",
    );
  });

  it('uses the same quote groups for schedule activation and downstream gates', () => {
    expectSource(migration).toContain(
      "'signed_copy_recorded','owner_exception'",
    );
    expectSource(migration).toContain('private.sync_signed_quotation_schedule');
    expectSource(migration).toContain(
      'public.project_advance_proforma_prepare',
    );
    expectSource(databaseTest).toContain(
      'offline agreement choice changed the quote payment groups',
    );
    expectSource(databaseTest).toContain(
      'count(*) from public.payments where contract_id=contract)<>1',
    );
  });

  it('allows the saved customer Final quote to seed the project while keeping digital acceptance strict', () => {
    expectSource(quoteSetupGuard).toContain(
      "r.status not in ('draft','issued')",
    );
    expectSource(quoteSetupGuard).toContain(
      "q.status not in ('draft','issued')",
    );
    expectSource(quoteSetupGuard).toContain('public.quotation_final_choices');
    expectSource(quoteSetupGuard).toContain(
      "if r.status<>'issued' or q.status<>'issued'",
    );
    expectSource(quoteSetupGuard).toContain(
      'Digitally accepted contract source mismatch',
    );
  });

  it('syncs frozen quote guidance only from the pending project current Final quote', () => {
    expectSource(stageGuidanceGuard).toContain(
      "rev.status='draft' and c.status='pending'",
    );
    expectSource(stageGuidanceGuard).toContain('c.acceptance_id is null');
    expectSource(stageGuidanceGuard).toContain('q.current_revision_id=rev.id');
    expectSource(stageGuidanceGuard).toContain(
      'public.quotation_final_choices',
    );
    expectSource(stageGuidanceGuard).toContain(
      'execute replace(definition,old_gate,new_gate)',
    );
  });
});
