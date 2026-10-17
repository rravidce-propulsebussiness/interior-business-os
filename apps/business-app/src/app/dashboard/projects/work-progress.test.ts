import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { workCompletionByProject } from './work-progress';

describe('Project weighted work completion', () => {
  it('uses recorded task percentages and weight, not approvals', () => {
    const progress = workCompletionByProject(['p1'], [
      { project_id: 'p1', status: 'done', completion_percentage: '20', weight: '3' },
      { project_id: 'p1', status: 'in_progress', completion_percentage: '50', weight: '1' },
    ]);
    expect(progress.get('p1')).toBe(88);
  });

  it('treats no recorded tasks, blocked data and other projects as untracked', () => {
    expect(workCompletionByProject(['a', 'b'], []).get('a')).toBeNull();
    expect(workCompletionByProject(['a'], null).get('a')).toBeNull();
    expect(workCompletionByProject(['a'], [
      { project_id: 'other', status: 'done', completion_percentage: '100', weight: '1' },
      { project_id: 'a', status: 'in_progress', completion_percentage: '20', weight: '0' },
    ]).get('a')).toBeNull();
  });

  it('clamps invalid percentages and excludes cancelled tasks', () => {
    const progress = workCompletionByProject(['p1'], [
      { project_id: 'p1', status: 'in_progress', completion_percentage: '400', weight: '1' },
      { project_id: 'p1', status: 'cancelled', completion_percentage: '30', weight: '1' },
      { project_id: 'p1', status: 'not_started', completion_percentage: '-10', weight: '1' },
    ]);
    expect(progress.get('p1')).toBe(50);
  });
});

describe('Permanent project deletion safeguards',()=>{
  const file=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
  const action=file('./project-removal-actions.ts');
  const button=file('./project-removal-button.tsx');
  const page=file('./page.tsx');
  const sql=file('../../../../../../packages/database/supabase/migrations/20261017001000_project_permanent_delete.sql');

  it('does not archive or soft delete when permanently deleting',()=>{
    expect(action).toContain("rpc('project_remove_from_workspace'");
    expect(action).not.toContain("status: 'inactive'");
    expect(action).not.toContain('setProjectArchived');
    expect(button).toContain('Delete Project');
    expect(button).toContain("confirmation!=='DELETE'");
    expect(button).toContain('Delete Project');
    expect(page).toContain("has('organization.manage')");
    expect(page).toContain('version={project.version}');
  });

  it('checks every project FK and blocks financial records and quotations',()=>{
    expect(sql).toContain("private.commercial_access(p_org,'project.manage','projects')");
    expect(sql).toContain("private.has_permission(p_org,'organization.manage')");
    expect(sql).toContain("p_confirm IS DISTINCT FROM 'DELETE'");
    expect(sql).toContain("pg_catalog.pg_constraint fk");
    expect(sql).toContain("fk.confrelid='public.projects'::regclass");
    expect(sql).toContain("public.quotations q");
    expect(sql).toContain("private.gst_stage_invoice_links i");
    expect(sql).toContain("public.contracts c");
    expect(sql).toContain("DELETE FROM public.projects p");
    expect(sql).toContain("converted_project_id=NULL");
    expect(sql).toContain("'project.permanently_deleted'");
    expect(sql).not.toContain('CASCADE');
    expect(sql).not.toContain('DISABLE TRIGGER');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION');
  });
});

describe('Remove project only, keep quotation history',()=>{
  const file=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
  const sql=file('../../../../../../packages/database/supabase/migrations/20261017001200_project_remove_keep_quotations.sql');
  const action=file('./project-removal-actions.ts');
  const button=file('./project-removal-button.tsx');
  const projects=file('./page.tsx');

  it('removes a project from the workspace without deleting linked quotations',()=>{
    expect(sql).toContain("v_quote_count=0");
    expect(sql).toContain("public.project_permanent_delete");
    expect(sql).toContain("SET is_sales_prospect=true");
    expect(sql).not.toContain("SET is_sales_prospect=true,status='inactive'");
    expect(projects).toContain(".eq('is_sales_prospect', false)");
    expect(sql).toContain("converted_project_id=NULL");
    expect(sql).toContain("'project.removed_quotation_history_retained'");
    expect(sql).not.toContain("DELETE FROM public.quotations");
    expect(sql).not.toContain("UPDATE public.quotations");
    expect(sql).not.toContain("UPDATE public.quotation_revisions");
    expect(sql).not.toContain("DELETE FROM public.quotation_items");
  });

  it('refuses unrelated site, invoice, payment and contract records and explains the outcome',()=>{
    expect(sql).toContain("private.commercial_access(p_org,'project.manage','projects')");
    expect(sql).toContain("private.has_permission(p_org,'organization.manage')");
    expect(sql).toContain("p_confirm IS DISTINCT FROM 'DELETE'");
    expect(sql).toContain("pg_catalog.pg_constraint fk");
    expect(sql).toContain("v_table IN");
    expect(sql).toContain("private.lead_quotation_links");
    expect(sql).toContain("FROM pg_catalog.pg_class t");
    expect(sql).toContain("IF v_has_children THEN");
    expect(sql).toContain("RETURN 'removed_quotes_preserved'");
    expect(action).toContain("data==='permanently_deleted'");
    expect(action).toContain("Project removed from Projects. Linked quotation history was preserved.");
    expect(button).toContain("will remain unchanged");
    expect(button).toContain("Invoices, contracts or site work");
  });
});
describe('Removed quotation reference does not resurrect a delivery project',()=>{
  const file=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
  const migration=file('../../../../../../packages/database/supabase/migrations/20261017001300_keep_removed_projects_out_of_crm.sql');
  const leadPage=file('../crm/leads/page.tsx');
  const leadDetail=file('../crm/leads/[id]/page.tsx');
  const leadAction=file('../crm/leads/lead-project-actions.ts');

  it('marks a hidden quotation-only reference and excludes it from CRM project reuse',()=>{
    expect(migration).toContain('removed_from_workspace boolean NOT NULL DEFAULT false');
    expect(migration).toContain('removed_from_workspace=true');
    expect(migration).toContain('case when qp.removed_from_workspace then null::uuid else q.project_id end');
    expect(migration).toContain('and not removed_from_workspace');
    expect(migration).not.toContain('DELETE FROM public.quotations');
  });

  it('shows Create Project rather than Open Project for a removed quote project',()=>{
    expect(leadPage).toContain("eq('removed_from_workspace',false)");
    expect(leadDetail).toContain("eq('removed_from_workspace',false)");
    expect(leadAction).toContain("eq('removed_from_workspace',false)");
    expect(leadAction).toContain('project_name: projectName');
  });
});
