import { expectSource } from './source-test-assertions';
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8');

describe('owner may proceed without the design advance', () => {
  const card = read('./project-design-stage-workflow.tsx');
  const forms = read('./project-v2-forms.tsx');
  const action = read('./[id]/site/agreement-actions.ts');
  const migration = read(
    '../../../../../../packages/database/supabase/migrations/20261123160000_owner_advance_waiver.sql',
  );

  it('offers the waiver only to the owner, with cash and pay-later reasons', () => {
    expectSource(card).toContain('agreement.canAuthorizeException ? (');
    expectSource(card).toContain('<OwnerAdvanceWaiver');
    expectSource(forms).toContain('Advance received in cash / offline');
    expectSource(forms).toContain('Client will pay the advance later');
    expectSource(action).toContain("'project_advance_waive'");
  });

  it('never creates a receipt and keeps the database the authority', () => {
    expectSource(migration).toContain('private.site_owner(p_organization_id)');
    expectSource(migration).toContain('and req.waived_at is null)');
    expectSource(migration).not.toContain('insert into public.payments');
  });

  it('lets a cleared project start site execution from the milestone card', () => {
    expectSource(card).toContain("data.site?.stage === 'client_approved'");
    expectSource(card).toContain('<StartSiteExecution');
    expectSource(forms).toContain('operation="execution_start"');
  });
});
