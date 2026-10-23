import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const component=read('./project-item-schedule.tsx');
const view=read('./project-v2-view.tsx');
const data=read('./project-v2-data.ts');
const action=read('./[id]/site/stage-schedule-actions.ts');
const migration=read('../../../../../../packages/database/supabase/migrations/20261023190000_project_stage_item_schedule.sql');
describe('Existing project stage item dates, no second execution system',()=>{
 it('keeps one date editor on work/check, tests, materials and company QC across every stage',()=>{
  expect(view).toContain("const planFor=(stageId:string");
  expect(view).toContain("stage.activities.map((work,i)=>renderWorkItem(work,i)");
  expect(view).toContain('schedule={planFor(stage.id,');
  expect(view).toContain('kind="material"');
  expect(view).toContain('kind="qc"');
  expect(view).toContain("step.kind==='test'?'test':'check'");
  expect(view).toContain('scheduleKind={kind}');
  expect(read('./project-stage-checklist-item.tsx')).toContain('kind={scheduleKind??kind}');
  expect(view).toContain('Upcoming planned work');
  expect(view).toContain('canPlan={canPlan&&!complete}');
  expect(component).toContain('Planned start');
  expect(component).toContain('Planned finish');
 });
 it('saves planned date ranges without performing work completion, QC approval or finance commands',()=>{
  expect(action).toContain("rpc('project_stage_item_schedule_save'");
  expect(action).toContain('if(finish<start)');
  expect(action).toContain('requireAuthenticatedUser');
  for(const s of ['project_stage_checklist_command','payment_request','construction_stage_execution_command'])
   expect(action).not.toContain(s);
  expect(migration).toContain("check(planned_finish>=planned_start)");
  expect(migration).toContain('private.project_can_plan_item');
  expect(migration).toContain('private.construction_project_access');
  expect(migration).toContain('foreign key(organization_id,project_id,stage_id)');
 });
 it('does not reject same day or overlapping dates in different stages',()=>{
  expect(migration).toContain("p_finish<p_start");
  expect(migration).not.toContain('exclude using gist');
  expect(migration).not.toContain('p_finish<=p_start');
  expect(component).toContain("finish<start");
  expect(view).toContain('upcoming=[...d.itemPlans]');
 });
 it('reads dates for both owner and assigned staff from one source',()=>{
  expect(data.match(/project_stage_item_schedule_read/g)?.length).toBe(2);
  expect(data).toContain('itemPlans:parseStageItemPlans(scheduleResult.error?null:scheduleResult.data)');
  expect(migration).toContain('project_stage_item_schedule_history');
  expect(migration).toContain("auth.uid() is null");
 });
});
