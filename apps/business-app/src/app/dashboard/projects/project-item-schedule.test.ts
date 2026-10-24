import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {forecastWork} from './project-work-forecast';
import {offsetPlanDate} from './project-schedule-dates';
import {stagePlanPreview} from './project-stage-schedule-preview';
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const component=read('./project-item-schedule.tsx');
const view=read('./project-v2-view.tsx');
const data=read('./project-v2-data.ts');
const action=read('./[id]/site/stage-schedule-actions.ts');
const migration=read('../../../../../../packages/database/supabase/migrations/20261023190000_project_stage_item_schedule.sql');
describe('Fast planned-date shortcuts for every stage item',()=>{
 it('offers Today, Tomorrow and a seven-day span in the existing item editor',()=>{
  expect(component).toContain('aria-label="Quick planned dates"');
  for(const label of ['Today','Tomorrow','Next 7 days'])
   expect(component).toContain(label);
  expect(component).toContain('setStart(today);setFinish(today)');
  expect(component).toContain('setFinish(offsetPlanDate(today,6))');
  expect(view).toContain('planningMode={planningMode}');
  expect(component).not.toContain('complete this work automatically');
 });
 it('preserves calendar dates across month and year boundaries',()=>{
  expect(offsetPlanDate('2026-10-24',1)).toBe('2026-10-25');
  expect(offsetPlanDate('2026-10-31',1)).toBe('2026-11-01');
  expect(offsetPlanDate('2026-12-30',6)).toBe('2027-01-05');
  expect(offsetPlanDate('2026-02-28',1)).toBe('2026-03-01');
  expect(offsetPlanDate('2028-02-28',1)).toBe('2028-02-29');
  expect(offsetPlanDate('2026-02-31',1)).toBe('');
  expect(offsetPlanDate('2026-02-28',0.5)).toBe('');
 });
});
describe('Existing project stage item dates, no second execution system',()=>{
 it('keeps one date editor on work/check, tests, materials and company QC across every stage',()=>{
  expect(view).toContain("const planFor=(stageId:string");
  expect(view).toContain("stage.activities.map((work,i)=>renderWorkItem(work,i)");
  expect(view).toContain('schedule={planFor(stage.id,');
  expect(view).toContain('kind="material"');
  expect(view).toContain('orderedFlow.length===0&&plannedMaterials.length>0');
  expect(view).toContain('pv2-legacy-material-planning');
  expect(view).toContain('Plan material delivery dates');
  expect(view).toContain('kind="material" index={i} title={material}');
  expect(view).toContain('Procurement, delivery updates');
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

describe('Automatic project work forecast and owner/engineer schedule boundaries',()=>{
 const limits=read('../../../../../../packages/database/supabase/migrations/20261024120000_site_engineer_future_stage_plan.sql');
 it('permits site engineer planning ahead while preserving project roles and execution checks',()=>{
  expect(limits).toContain('private.project_can_plan_item(p_org,p_project)');
  expect(limits).toContain('v_existing.version');
  expect(limits).toContain("p_kind not in ('work','check','test','qc','material')");
  expect(limits).toContain('Stage item changed; refresh the project timeline');
  expect(limits).not.toContain('p_start<v_today or p_finish>v_today+1');
  expect(component).toContain("planningMode==='site'");
  expect(component).not.toContain('max={maximum}');
  expect(view).toContain('planningMode={planningMode} today={todayInIndia}');
  expect(view).toContain("site engineers can plan upcoming stages as well.");
 });
 it('calculates actual physical work completion and detects late items without approving QC',()=>{
  const stages=[{id:'f',activities:['Mark','Excavate','PCC','Footing']}];
  const plans=[
   {stageId:'f',kind:'work',index:0,plannedStart:'2026-10-20',plannedFinish:'2026-10-21'},
   {stageId:'f',kind:'work',index:1,plannedStart:'2026-10-21',plannedFinish:'2026-10-22'},
   {stageId:'f',kind:'work',index:2,plannedStart:'2026-10-22',plannedFinish:'2026-10-24'},
   {stageId:'f',kind:'work',index:3,plannedStart:'2026-10-23',plannedFinish:'2026-10-26'},
  ];
  const result=forecastWork(stages,plans,[{stage_id:'f',index:0,status:'completed'}],'2026-10-23');
  expect(result).toMatchObject({completed:1,total:4,progressPct:25,scheduled:4,
   scheduledCompleted:1,due:2,late:1,pace:'delayed',originalFinish:'2026-10-26'});
  expect(result.forecastFinish).toBe('2026-11-03');
  expect(view).toContain('Recorded physical work');
  expect(view).toContain('Indicative finish at current recorded pace');
 });
 it('shows ahead of plan for work completed before its planned finish',()=>{
  const stages=[{id:'a',activities:['Site marking','Excavation']}];
  const plans=[
   {stageId:'a',kind:'work',index:0,plannedStart:'2026-10-23',plannedFinish:'2026-10-26'},
   {stageId:'a',kind:'work',index:1,plannedStart:'2026-10-24',plannedFinish:'2026-10-27'},
  ];
  const result=forecastWork(stages,plans,[{stage_id:'a',index:0,status:'completed'}],'2026-10-23');
  expect(result).toMatchObject({progressPct:50,early:1,late:0,pace:'ahead'});
  const allDone=forecastWork(stages,plans,[
   {stage_id:'a',index:0,status:'completed'},
   {stage_id:'a',index:1,status:'completed'},
  ],'2026-10-25');
  expect(allDone.pace).toBe('completed');
  expect(allDone.progressPct).toBe(100);
 });
 it('never treats a material, test, QC or payment as physical work completed',()=>{
  const result=forecastWork([{id:'stage',activities:['Footing']}],[
   {stageId:'stage',kind:'material',index:0,plannedStart:'2026-10-23',plannedFinish:'2026-10-23'},
   {stageId:'stage',kind:'qc',index:0,plannedStart:'2026-10-23',plannedFinish:'2026-10-23'},
  ],[{stage_id:'stage',index:0,status:'passed'}],'2026-10-23');
  expect(result).toMatchObject({completed:0,total:1,progressPct:0,scheduled:0,pace:'not_planned'});
  expect(read('./project-work-forecast.ts')).not.toContain('update ');
 });
});


describe('Visible schedules in every collapsed project stage',()=>{
 const sample=[
  {stageId:'foundation',kind:'work' as const,index:0,title:'Footing layout',
   plannedStart:'2026-10-24',plannedFinish:'2026-10-24',note:'',version:1},
  {stageId:'foundation',kind:'check' as const,index:0,title:'Footing marking check',
   plannedStart:'2026-10-24',plannedFinish:'2026-10-25',note:'',version:1},
  {stageId:'plinth',kind:'work' as const,index:0,title:'Backfilling',
   plannedStart:'2026-10-25',plannedFinish:'2026-10-26',note:'',version:1},
 ];
 it('summarizes inclusive same-day work and another-stage overlap without changing progress',()=>{
  expect(stagePlanPreview(sample,'foundation','2026-10-24')).toMatchObject({
   count:2,start:'2026-10-24',finish:'2026-10-25',
   overlapsAnotherStage:true,hasWorkToday:true,
  });
  expect(stagePlanPreview(sample,'plinth','2026-10-24')).toMatchObject({
   count:1,start:'2026-10-25',finish:'2026-10-26',
   overlapsAnotherStage:true,hasWorkToday:false,
  });
  expect(stagePlanPreview(sample,'unknown','2026-10-24')).toEqual({
   count:0,start:null,finish:null,overlapsAnotherStage:false,hasWorkToday:false,
  });
 });
 it('shows planned range in existing stage summary, including future-stage overlap',()=>{
  expect(view).toContain("const stagePlan=stagePlanPreview(d.itemPlans,stage.id,todayInIndia)");
  expect(view).toContain("className={'pv2-stage-schedule-summary '");
  expect(view).toContain('Scheduled today');
  expect(view).toContain('Overlaps another stage');
  expect(view).toContain('Work dates not planned');
  const css=read('./project-v2.css');
  expect(css).toContain('.pv2-stage-schedule-summary');
 });
});
