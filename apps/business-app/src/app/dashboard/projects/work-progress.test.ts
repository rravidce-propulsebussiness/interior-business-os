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
    expect(action).toContain("rpc('project_permanent_delete'");
    expect(action).not.toContain("status: 'inactive'");
    expect(action).not.toContain('setProjectArchived');
    expect(button).toContain('Permanently Delete');
    expect(button).toContain("confirmation!=='DELETE'");
    expect(button).toContain('Delete permanently');
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
