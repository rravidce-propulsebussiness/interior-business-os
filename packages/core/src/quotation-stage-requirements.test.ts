import { describe,it,expect } from 'vitest';
import { customerTermSections } from './quotation-terms';
import { projectTimelineFromQuote } from './quote-project-timeline';
import { calculateSftEstimate,encodeSftEstimate } from './sft-quotation';
import {
 defaultStageRequirements,encodeStageRequirements,savedStageRequirements,
 mergeStageRequirementOverrides,
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
 it('transfers a quoted foundation tar coat without changing another slab',()=>{
  const estimate=calculateSftEstimate({rows:[
   {name:'Ground',kind:'floor',lengthFeet:'30',widthFeet:'40',ratePerSqft:'1750'},
   {name:'First',kind:'floor',lengthFeet:'30',widthFeet:'40',ratePerSqft:'1750'},
  ],materialIds:[]});
  const scope=[{id:'00000000-0000-4000-8000-000000000001',
   name:'Construction',description:encodeSftEstimate(estimate)}];
  const initial=projectTimelineFromQuote('construction',scope);
  const foundation=initial?.stages.find(x=>x.templateCode==='FOUNDATION');
  expect(foundation).toBeDefined();
  const baseline=defaultStageRequirements(foundation!.instanceCode);
  const extras={
   ...baseline,work:[...baseline.work,'Apply foundation tar coating'],
   checks:[...baseline.checks,'Check tar-coat coverage'],
  };
  const customized=projectTimelineFromQuote('construction',scope,{
   [foundation!.instanceCode]:extras,
  });
  expect(customized?.stages.find(x=>x.instanceCode===foundation!.instanceCode)?.activities)
   .toContain('Apply foundation tar coating');
  expect(customized?.stages.find(x=>x.instanceCode===foundation!.instanceCode)?.inspectionTopics)
   .toContain('Check tar-coat coverage');
  expect(customized?.stages.find(x=>x.templateCode==='RCC')?.activities)
   .not.toContain('Apply foundation tar coating');
 });

});
