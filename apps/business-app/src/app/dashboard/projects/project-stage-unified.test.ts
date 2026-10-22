import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read=(file:string)=>readFileSync(new URL(file,import.meta.url),'utf8');

describe('One work item owns its progress and material workflow',()=>{
 const screen=read('./project-v2-view.tsx');
 const activity=read('./project-stage-checklist-item.tsx');
 const forms=read('./project-v2-forms.tsx');
 const actions=read('./[id]/site/stage-checklist-actions.ts');
 it('places order and delivery actions alongside a real work item without duplicating them',()=>{
  expect(screen).toContain("const workMaterials=stageMaterials.filter(m=>stringValue(m.activity_index)===String(i))");
  expect(screen).toContain('activityIndex={i}');
  expect(screen).toContain('materialPanel={materialPanel}');
  expect(screen).toContain('<StageMaterialRows d={d} rows={workMaterials}/>');
  expect(screen).toContain('Earlier stage material requests');
  expect(screen).not.toContain('Materials to plan & request (');
  expect(screen).not.toContain('pv2-command-stage-actions');
  expect(activity).toContain('Materials & orders');
  expect(activity).toContain('setMaterialsOpen(open=>!open)');
  expect(activity).toContain('hidden={!materialsOpen}');
  expect(activity).toContain('target.open=true');
  expect(activity).toContain('individual.open=true');
  expect(screen).toContain('Materials required for this work');
  expect(screen).toContain('suggestedActivityMaterials(work,suggestedMaterials)');
 });
 it('keeps one canonical inspection checklist and one QC review for each stage',()=>{
  expect(screen).toContain('Site checks & company QC');
  expect(screen).toContain('pv2-stage-checks-');
  expect(screen).toContain('<BulkStageChecks');
  expect(screen).toContain('<StageOnsiteQcReview');
  expect(activity).toContain('checksHref');
  expect(screen).toContain('Evidence & reports to collect');
 });
 it('does not create orders when requesting project materials',()=>{
  expect(forms).toContain('Request materials for');
  expect(forms).toContain('activityIndex');
  expect(actions).toContain("'project_stage_activity_material_batch'");
  expect(actions).toContain("'project_stage_material_batch'");
  expect(actions).toContain("'project_site_material_batch'");
  expect(actions).not.toContain("'Marketplace request placed'");
 });
 it('scopes activity requests on the backend and preserves stage-wide legacy requests',()=>{
  const migration=read('../../../../../../packages/database/supabase/migrations/20261022140000_activity_material_requests.sql');
  const reader=read('../../../../../../packages/database/supabase/migrations/20261022140100_read_activity_material_requests.sql');
  expect(migration).toContain("public.project_stage_activity_material_batch");
  expect(migration).toContain('p_activity_index');
  expect(migration).toContain("Work item does not belong to this stage");
  expect(migration).toContain("private.site_allowed");
  expect(reader).toContain('select id,activity_index,item,quantity');
 });
});
