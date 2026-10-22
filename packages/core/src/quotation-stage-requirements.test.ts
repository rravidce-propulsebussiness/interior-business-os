import { describe,it,expect } from 'vitest';
import { customerTermSections } from './quotation-terms';
import {
 defaultStageRequirements,encodeStageRequirements,savedStageRequirements,
 mergeStageRequirementOverrides,validateStageRequirements,validateStageRequirementsDraft,
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
