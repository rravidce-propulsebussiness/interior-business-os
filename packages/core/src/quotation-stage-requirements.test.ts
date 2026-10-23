import { describe,it,expect } from 'vitest';
import { customerTermSections } from './quotation-terms';
import {
 defaultStageRequirements,encodeStageRequirements,savedStageRequirements,
 mergeStageRequirementOverrides,validateStageRequirements,validateStageRequirementsDraft,
 stageExecutionFlow,reconcileStageExecutionFlow,deleteStageExecutionStep,remapStageFlowPayments,
} from './quotation-stage-requirements';

describe('project-specific construction stage requirements',()=>{
 it('preserves default guidance and allows additional tar-coat requirements only on one stage',()=>{
  const foundation=defaultStageRequirements('FOUNDATION');
  const changed={...foundation,
    work:[...foundation.work,'Tar coating on specified foundation surfaces'],
    materials:[...foundation.materials,'Approved bituminous tar coating'],
    checks:[...foundation.checks,'Verify foundation tar coat application and coverage'],
    reports:[...foundation.reports,'Tar coat application photos and inspection note'],
  };
  const plan=mergeStageRequirementOverrides({},'FOUNDATION',changed);
  const encoded=encodeStageRequirements(plan);
  const restored=savedStageRequirements(encoded);
  expect(restored.FOUNDATION?.work).toContain('Tar coating on specified foundation surfaces');
  expect(restored.FOUNDATION?.checks).toContain('Verify foundation tar coat application and coverage');
  expect(restored['RCC/GROUND_FLOOR']).toBeUndefined();
  expect(customerTermSections('Warranty:\nTwo years\n'+encoded))
   .toEqual([{title:'Warranty',text:'Two years'}]);
 });
 it('keeps changes floor-specific when two slabs are present',()=>{
  const ground=defaultStageRequirements('RCC/GROUND_FLOOR');
  const custom={...ground,reports:[...ground.reports,'Ground slab additional cube test report']};
  const saved=mergeStageRequirementOverrides({},'RCC/GROUND_FLOOR',custom);
  expect(saved['RCC/FIRST_FLOOR']).toBeUndefined();
  expect(savedStageRequirements(encodeStageRequirements(saved))['RCC/GROUND_FLOOR']?.reports)
   .toContain('Ground slab additional cube test report');
 });
 it('will not remove mandatory structural inspection topics',()=>{
  const foundation=defaultStageRequirements('FOUNDATION');
  expect(()=>encodeStageRequirements({
   FOUNDATION:{...foundation,checks:foundation.checks.slice(1)},
  })).toThrow(/Mandatory structural/);
 });
 it('saves only changes and never changes the shared default',()=>{
  const foundation=defaultStageRequirements('FOUNDATION');
  expect(mergeStageRequirementOverrides({},'FOUNDATION',foundation)).toEqual({});
 });
});

it('requires check titles long enough for the site inspection API',()=>{
 const foundation=defaultStageRequirements('FOUNDATION');
 expect(()=>validateStageRequirements({FOUNDATION:{
  ...foundation,checks:[...foundation.checks,'pH'],
 }})).toThrow();
});

it('reads previously issued two-character checks but will not persist them in a new revision',()=>{
 const base=defaultStageRequirements('FOUNDATION');
 const previous={...base,checks:[...base.checks,'pH']};
 const terms='[STAGE_CUSTOM_REQUIREMENTS]'+JSON.stringify({
  version:1,stages:{FOUNDATION:previous},
 })+'[/STAGE_CUSTOM_REQUIREMENTS]';
 expect(savedStageRequirements(terms).FOUNDATION?.checks).toContain('pH');
 expect(()=>encodeStageRequirements({FOUNDATION:previous})).toThrow();
});

it('repairs legacy short QC checks one stage at a time without crashing the editor',()=>{
 const base=defaultStageRequirements('FOUNDATION');
 const older={...base,checks:[...base.checks,'pH']};
 const prior={FOUNDATION:older,'RCC/GROUND_FLOOR':{
  ...defaultStageRequirements('RCC/GROUND_FLOOR'),
  checks:[...defaultStageRequirements('RCC/GROUND_FLOOR').checks,'pH'],
 }};
 const savedText='[STAGE_CUSTOM_REQUIREMENTS]'+JSON.stringify({version:1,stages:prior})+
  '[/STAGE_CUSTOM_REQUIREMENTS]';
 const loaded=savedStageRequirements(savedText);
 const foundationClean=mergeStageRequirementOverrides(loaded,'FOUNDATION',{
  ...base,checks:[...base.checks,'pH inspection'],
 });
 expect(foundationClean.FOUNDATION?.checks).toContain('pH inspection');
 expect(foundationClean['RCC/GROUND_FLOOR']?.checks).toContain('pH');
 expect(validateStageRequirementsDraft(foundationClean)).toEqual(foundationClean);
 expect(()=>encodeStageRequirements(foundationClean)).toThrow();
 const rcc=foundationClean['RCC/GROUND_FLOOR']!;
 const bothClean=mergeStageRequirementOverrides(foundationClean,'RCC/GROUND_FLOOR',{
  ...rcc,checks:rcc.checks.filter(x=>x!=='pH').concat('Concrete pH inspection'),
 });
 expect(encodeStageRequirements(bothClean)).toContain('Concrete pH inspection');
});


it('saves renamed preconstruction work and materials without changing shared stage defaults', () => {
 const defaults=defaultStageRequirements('PRECONSTRUCTION');
 const renamedWork='Signed agreement accepted and archived';
 const renamedMaterial='Survey instruments and site markers';
 const customized={
  ...defaults,
  work:[renamedWork,...defaults.work.slice(1)],
  materials:defaults.materials.length
   ? [renamedMaterial,...defaults.materials.slice(1)]
   : [renamedMaterial],
 };
 const overrides=mergeStageRequirementOverrides({},'PRECONSTRUCTION',customized);
 const restored=savedStageRequirements(encodeStageRequirements(overrides));
 expect(restored.PRECONSTRUCTION?.work[0]).toBe(renamedWork);
 expect(restored.PRECONSTRUCTION?.materials[0]).toBe(renamedMaterial);
 expect(defaultStageRequirements('PRECONSTRUCTION').work).toEqual(defaults.work);
});

it('does not allow renaming mandatory structural QC checks', () => {
 const defaults=defaultStageRequirements('FOUNDATION');
 expect(()=>encodeStageRequirements({
  FOUNDATION:{...defaults,checks:[
   'Changed mandatory structural inspection',...defaults.checks.slice(1),
  ]},
 })).toThrow(/Mandatory structural/);
});


describe('quotation-driven alternating construction work, site checks, tests and QC',()=>{
 it('defaults to work followed by site checks until explicitly reordered',()=>{
  const initial=defaultStageRequirements('SITE_PREP');
  const plan=stageExecutionFlow(initial);
  expect(plan[0]).toEqual({kind:'work',index:0});
  expect(plan[initial.work.length]).toEqual({kind:'check',index:0});
 });

 it('saves excavation then dimensions test then QC then the next work',()=>{
  const base=defaultStageRequirements('SITE_PREP');
  const updated={
   ...base,
   flow:[
    {kind:'work' as const,index:0},
    {kind:'test' as const,index:0},
    {kind:'qc' as const,index:0},
    ...base.work.slice(1).map((_,i)=>({kind:'work' as const,index:i+1})),
    ...base.checks.slice(1).map((_,i)=>({kind:'check' as const,index:i+1})),
   ],
  };
  const changes=mergeStageRequirementOverrides({},'SITE_PREP',updated);
  expect(savedStageRequirements(encodeStageRequirements(changes)).SITE_PREP?.flow?.slice(0,3))
   .toEqual([{kind:'work',index:0},{kind:'test',index:0},{kind:'qc',index:0}]);
  expect(defaultStageRequirements('SITE_PREP').flow).toBeUndefined();
 });

 it('rejects QC before its check, duplicate checks and missing stage work',()=>{
  const base=defaultStageRequirements('FOUNDATION');
  const full=stageExecutionFlow(base);
  expect(()=>validateStageRequirements({FOUNDATION:{
   ...base,flow:[{kind:'qc',index:0},...full],
  }})).toThrow(/precede/);
  expect(()=>validateStageRequirements({FOUNDATION:{
   ...base,flow:[...full,{kind:'check',index:0}],
  }})).toThrow(/Duplicate check/);
  expect(()=>validateStageRequirements({FOUNDATION:{
   ...base,flow:full.slice(1),
  }})).toThrow(/include every selected/);
 });

 it('keeps a QC reference when its work or check label is renamed',()=>{
  const base=defaultStageRequirements('SITE_PREP');
  const old={
   ...base,flow:[
    ...stageExecutionFlow(base),
    {kind:'qc' as const,index:0},
   ],
  };
  const renamed=reconcileStageExecutionFlow(old,{
   ...old,checks:['Verify excavation width and depth on site',...old.checks.slice(1)],
  });
  expect(renamed.flow?.filter(step=>step.kind==='qc')).toEqual([{kind:'qc',index:0}]);
  expect(()=>validateStageRequirements({SITE_PREP:renamed})).not.toThrow();
 });

 it('appends a newly selected test after existing ordered steps without changing QC',()=>{
  const base=defaultStageRequirements('SITE_PREP');
  const previous={
   ...base,flow:[...stageExecutionFlow(base),{kind:'qc' as const,index:0}],
  };
  const next=reconcileStageExecutionFlow(previous,{
   ...previous,checks:[...base.checks,'Verify dewatering test result'],
  });
  expect(next.flow?.at(-1)).toEqual({kind:'check',index:base.checks.length});
  expect(next.flow?.filter(step=>step.kind==='qc')).toEqual([{kind:'qc',index:0}]);
 });
});


describe('payment references and safe editing of ordered execution items',()=>{
 it('persists a payment milestone reference without creating a second work or check',()=>{
  const base=defaultStageRequirements('SITE_PREP');
  const flow=[...stageExecutionFlow(base),{kind:'payment' as const,index:2}];
  const changed={...base,flow};
  const serialized=encodeStageRequirements(mergeStageRequirementOverrides({},'SITE_PREP',changed));
  const read=savedStageRequirements(serialized).SITE_PREP!;
  expect(read.flow?.at(-1)).toEqual({kind:'payment',index:2});
  expect(read.work).toEqual(base.work);
  expect(read.checks).toEqual(base.checks);
  expect(()=>validateStageRequirements({SITE_PREP:{...base,flow:[...flow,{kind:'payment',index:2}]}}))
   .toThrow(/Duplicate payment/);
 });

 it('removes payment display step only, retaining quotation stage work and site checks',()=>{
  const base=defaultStageRequirements('SITE_PREP');
  const plan={...base,flow:[...stageExecutionFlow(base),{kind:'payment' as const,index:0}]};
  const after=deleteStageExecutionStep(plan,plan.flow.length-1,'SITE_PREP');
  expect(after.work).toEqual(base.work);
  expect(after.checks).toEqual(base.checks);
  expect(after.flow?.some(s=>s.kind==='payment')).toBe(false);
 });

 it('deleting a check also deletes its linked QC and renumbers following checks',()=>{
  const base=defaultStageRequirements('SITE_PREP');
  const ordered=[
   ...stageExecutionFlow(base).filter(s=>s.kind==='work'),
   {kind:'check' as const,index:0},{kind:'qc' as const,index:0},
   ...base.checks.slice(1).map((_,i)=>({kind:'test' as const,index:i+1})),
  ];
  const result=deleteStageExecutionStep({...base,flow:ordered},base.work.length,'SITE_PREP');
  expect(result.checks).toEqual(base.checks.slice(1));
  expect(result.flow?.some(s=>s.kind==='qc')).toBe(false);
  expect(result.flow?.filter(s=>s.kind==='test')[0]).toEqual({kind:'test',index:0});
  expect(()=>validateStageRequirements({SITE_PREP:result})).not.toThrow();
 });

 it('does not remove mandatory structural checks or the last work item',()=>{
  const foundation=defaultStageRequirements('FOUNDATION');
  const sequence=stageExecutionFlow(foundation);
  const firstCheck=sequence.findIndex(s=>s.kind==='check');
  expect(()=>deleteStageExecutionStep({...foundation,flow:sequence},firstCheck,'FOUNDATION'))
   .toThrow(/Mandatory structural/);
  const onlyWork={...foundation,work:[foundation.work[0]!],flow:[
   {kind:'work' as const,index:0},...foundation.checks.map((_,index)=>({kind:'check' as const,index})),
  ]};
  expect(()=>deleteStageExecutionStep(onlyWork,0,'FOUNDATION')).toThrow(/At least one/);
 });

 it('remaps payment references when the payment schedule changes without duplication',()=>{
  const base=defaultStageRequirements('PRECONSTRUCTION');
  const requirements={PRECONSTRUCTION:{...base,flow:[
   ...stageExecutionFlow(base),{kind:'payment' as const,index:3},
  ]}};
  const shifted=remapStageFlowPayments(requirements,old=>old===3?1:old);
  expect(shifted.PRECONSTRUCTION?.flow?.at(-1)).toEqual({kind:'payment',index:1});
  const removed=remapStageFlowPayments(shifted,()=>null);
  expect(removed.PRECONSTRUCTION?.flow?.some(s=>s.kind==='payment')).toBe(false);
 });
});
