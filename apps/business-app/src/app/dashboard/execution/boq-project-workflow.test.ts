import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('BOQ project selection and save invariants', () => {
  const page = source('./boq/page.tsx');
  const editor = source('./boq-workspace.tsx');
  const save = source('./boq-actions.ts');
  const auto = source('./boq-quotation.ts');
  const migration = source(
    '../../../../../../packages/database/supabase/migrations/20261121000001_boq_final_quote_single_per_project.sql',
  );
  const defaultFinalMigration = source(
    '../../../../../../packages/database/supabase/migrations/20261121160000_boq_latest_project_quote_default_final.sql',
  );

  it('uses project-scoped newest saved Final by default with manual override', () => {
    expect(page).toContain("'boq_effective_project_quotes'");
    expect(page).toContain('p_project_ids: projectIds');
    expect(page).toContain('projectsReadyForNewBoq(');
    expect(page).toContain('newProjects={newProjects}');
    expect(page).not.toContain(")('quotation_final_choices'");
    expect(defaultFinalMigration).toContain('coalesce(pinned.id, newest.id)');
    expect(defaultFinalMigration).toContain(
      'order by q.created_at desc, q.id desc',
    );
    expect(defaultFinalMigration).toContain('q.project_id = p.id');
    expect(defaultFinalMigration).toContain(
      'selection.customer_id = p.customer_id',
    );
    expect(defaultFinalMigration).toContain('public.quotation_items');
  });

  it('keeps saved BOQs for editing but removes them from the new-project list', () => {
    expect(editor).toContain('projects.map((project) => {');
    expect(editor).toContain('disabled={!saved && !ready}');
    expect(editor).toContain('openDocument(existing)');
    expect(editor).toContain('setActive(null)');
    expect(editor).toContain('if (!newProjects.length)');
    expect(editor).toContain('onClick={() => openDocument(document)}');
    expect(editor).not.toContain('Document status');
    expect(editor).not.toContain('setStatus(');
  });

  it('requires a real project and selected Final quotation at save time', () => {
    expect(save).toContain("'boq_effective_project_quotes' as never");
    expect(save).toContain('p_project_ids: [value.projectId]');
    expect(save).toContain('effectiveByProject[value.projectId]');
    expect(save).toContain(".eq('is_sales_prospect', false)");
    expect(save).toContain(".eq('project_id', value.projectId)");
    expect(save).toContain(
      'finalQuote.data.current_revision_id !== value.quotationRevisionId',
    );
    expect(save).not.toContain('status: value.status');
    expect(save).toContain("status: 'draft'");
  });

  it('protects existing BOQs against project reassignment and duplicate creation', () => {
    expect(save).toContain(
      'original.data.project_id !== (value.projectId ?? null)',
    );
    expect(auto).toContain(".eq('project_id', projectId)");
    expect(auto).toContain("'boq_effective_project_quotes'");
    expect(auto).toContain('selected.data?.[projectId]');
    expect(defaultFinalMigration).toContain('private.has_permission');
    expect(defaultFinalMigration).toContain('grant execute');
    expect(migration).toContain('construction_boq_documents_one_per_project');
    expect(migration).toContain('public.boq_final_quotation_choices');
  });
});
