import { describe,it,expect } from 'vitest';
import { customerTermSections } from './quotation-terms';
import {
 defaultStageRequirements,encodeStageRequirements,savedStageRequirements,
 mergeStageRequirementOverrides,renameStageRequirement,validateStageRequirements,validateStageRequirementsDraft,
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

describe('editing a quotation stage requirement without duplicating records',()=>{
 it('renames a main material order item but does not alter default company guidance',()=>{
  const standard=defaultStageRequirements('FOUNDATION');
  const first=standard.materials[0]!;
  const next=renameStageRequirement(standard,'materials',first,'TMT steel Fe 500D, 12 mm');
  expect(next.materials).toContain('TMT steel Fe 500D, 12 mm');
  expect(next.materials).not.toContain(first);
  expect(next.materials.length).toBe(standard.materials.length);
  expect(defaultStageRequirements('FOUNDATION').materials).toContain(first);
  const result=mergeStageRequirementOverrides({},'FOUNDATION',next);
  expect(savedStageRequirements(encodeStageRequirements(result)).FOUNDATION?.materials)
   .toContain('TMT steel Fe 500D, 12 mm');
 });
 it('edits a work item and a report, preserving count and order',()=>{
  const base=defaultStageRequirements('PLINTH');
  const item=base.work[1]!;
  const work=renameStageRequirement(base,'work',item,'Compaction and checked soil filling');
  const report=renameStageRequirement(work,'reports',work.reports[0]!,'Soil compaction test certificate');
  expect(report.work[1]).toBe('Compaction and checked soil filling');
  expect(report.reports[0]).toBe('Soil compaction test certificate');
 });
 it('rejects empty, duplicate and invalid check title updates',()=>{
  const base=defaultStageRequirements('FOUNDATION');
  expect(()=>renameStageRequirement(base,'materials',base.materials[0]!,base.materials[1]!.toUpperCase()))
   .toThrow('already exists');
  expect(()=>renameStageRequirement(base,'checks',base.checks[0]!,'pH')).toThrow('3 to 180');
  expect(()=>renameStageRequirement(base,'work',base.work[0]!,' ')).toThrow('2 to 180');
  expect(()=>renameStageRequirement(base,'work','missing item','new')).toThrow('Select an existing');
 });
 it('keeps mandated structural checks protected when changing the quote',()=>{
  const base=defaultStageRequirements('FOUNDATION');
  const mandatory=base.checks[0]!;
  expect(()=>renameStageRequirement(base,'checks',mandatory,'Renamed mandatory inspection',true))
   .toThrow(/Required structural/);
  const bypass=renameStageRequirement(base,'checks',mandatory,'Renamed mandatory inspection');
  expect(()=>mergeStageRequirementOverrides({},'FOUNDATION',bypass))
   .toThrow(/Mandatory structural/);
 });
});
