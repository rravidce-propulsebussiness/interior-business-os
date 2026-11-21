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

  it('loads explicitly pinned Final quotations, never the latest fallback', () => {
    expect(page).toContain("'boq_final_quotation_choices'");
    expect(page).toContain('projectsReadyForNewBoq(');
    expect(page).toContain('newProjects={newProjects}');
    expect(page).not.toContain(")('quotation_final_choices'");
  });

  it('keeps saved BOQs for editing but removes them from the new-project list', () => {
    expect(editor).toContain('newProjects.map((project)');
    expect(editor).toContain('disabled={Boolean(active)}');
    expect(editor).toContain('if (!newProjects.length)');
    expect(editor).toContain('onClick={() => openDocument(document)}');
    expect(editor).not.toContain('Document status');
    expect(editor).not.toContain('setStatus(');
  });

  it('requires a real project and selected Final quotation at save time', () => {
    expect(save).toContain("'boq_final_quotation_choices' as never");
    expect(save).toContain(".eq('is_sales_prospect', false)");
    expect(save).toContain('.eq(\'project_id\', value.projectId)');
    expect(save).toContain('finalQuote.data.current_revision_id !== value.quotationRevisionId');
    expect(save).not.toContain('status: value.status');
    expect(save).toContain("status: 'draft'");
  });

  it('protects existing BOQs against project reassignment and duplicate creation', () => {
    expect(save).toContain('original.data.project_id !== (value.projectId ?? null)');
    expect(auto).toContain(".eq('project_id', projectId)");
    expect(auto).toContain("'boq_final_quotation_choices'");
    expect(migration).toContain('construction_boq_documents_one_per_project');
    expect(migration).toContain('public.boq_final_quotation_choices');
  });
});
