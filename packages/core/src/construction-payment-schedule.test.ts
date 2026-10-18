import {describe,expect,it} from 'vitest';
import { expandConstructionStages } from './construction-workflow';
import { proposedConstructionPayments,milestoneConstructionStages,
 guidanceForConstructionStage } from './construction-payment-schedule';
import { constructionPlanFromQuotedDescriptions } from './quote-construction-handoff';
import { calculateSftEstimate,encodeSftEstimate } from './sft-quotation';

describe('quoted construction milestone payments',()=>{
 it('creates independent slab/brickwork milestones for each quoted floor, totaling 100%',()=>{
  const stages=proposedConstructionPayments(['Ground Floor','1st Floor','2nd Floor']);
  expect(stages.filter(s=>s.name.includes('slab payment'))).toHaveLength(3);
  expect(stages.filter(s=>s.name.includes('brickwork'))).toHaveLength(3);
  expect(stages.reduce((sum,r)=>sum+Number(r.percent),0)).toBeCloseTo(100,8);
  expect(stages[0]!.stageCodes).toContain('SITE_PREP');
  expect(stages.find(s=>s.name.startsWith('Foundation'))!.stageCodes).toEqual(['FOUNDATION','PLINTH']);
  expect(stages.find(s=>s.name.includes('1st Floor slab'))!.stageCodes).toContain('RCC/F_1ST_FLOOR');
  expect(stages.find(s=>s.name.includes('2nd Floor brickwork'))!.stageCodes).toContain('MASONRY/F_2ND_FLOOR');
 });
 it('groups brickwork automatically only when very tall quotes exceed 40 lines',()=>{
  const floors=Array.from({length:18},(_,i)=>'Level '+(i+1));
  const plan=proposedConstructionPayments(floors);
  expect(plan.length).toBeLessThanOrEqual(40);
  expect(plan.filter(p=>p.name.includes('slab payment'))).toHaveLength(18);
  expect(plan.filter(p=>p.name.includes('brickwork'))).toHaveLength(9);
  expect(plan.reduce((sum,r)=>sum+Number(r.percent),0)).toBeCloseTo(100,8);
 });
 it('allows first-floor brickwork while third-floor slab continues',()=>{
  const floorNames=['Ground','First','Second','Third'];
  const floors=floorNames.map(name=>({code:name.toUpperCase(),name}));
  const template={industry:'construction' as const,version:'1.1.0',stages:milestoneConstructionStages()};
  const stages=expandConstructionStages(template,floors);
  const masonry=stages.find(s=>s.instanceCode==='MASONRY/FIRST')!;
  const rcc3=stages.find(s=>s.instanceCode==='RCC/THIRD')!;
  expect(masonry.dependsOn).toContain('RCC/FIRST');
  expect(masonry.dependsOn).not.toContain('RCC/THIRD');
  expect(rcc3.dependsOn).toContain('RCC/SECOND');
  expect(stages.find(s=>s.instanceCode==='INTERNAL_PLASTER/FIRST')?.dependsOn).toEqual(['MASONRY/FIRST']);
  expect(stages.find(s=>s.instanceCode==='DOORS/FIRST')?.dependsOn).toContain('TILES/FIRST');
  expect(masonry.activities).not.toContain('Electrical conduits and plumbing concealed runs');
  expect(stages.find(s=>s.instanceCode==='INTERNAL_PLASTER/FIRST')?.activities.join(' '))
    .toMatch(/electrical conduit and plumbing provision/i);
 });
 it('adds suggested QC tests, materials and report lists but no artificial results or material quantities',()=>{
  const foundation=guidanceForConstructionStage('FOUNDATION');
  expect(foundation.checks.join(' ')).toMatch(/concrete|footing/i);
  expect(guidanceForConstructionStage('PLINTH').checks.join(' ')).toMatch(/compaction/i);
  expect(guidanceForConstructionStage('INTERNAL_PLASTER').checks.join(' ')).toMatch(/pressure/i);
  expect(guidanceForConstructionStage('TILES').checks.join(' ')).toMatch(/tile/i);
  expect('passed' in foundation).toBe(false);
  expect('quantity' in foundation).toBe(false);
 });
 it('uses accepted quoted floors without introducing unquoted floors',()=>{
  const scope=calculateSftEstimate({rows:[
    {name:'Ground',kind:'floor',lengthFeet:'30',widthFeet:'40',ratePerSqft:'1750'},
    {name:'First',kind:'floor',lengthFeet:'30',widthFeet:'40',ratePerSqft:'1750'},
  ],materialIds:[]});
  const plan=constructionPlanFromQuotedDescriptions([encodeSftEstimate(scope)])!;
  expect(plan.stages.filter(s=>s.templateCode==='INTERNAL_PLASTER')).toHaveLength(2);
  expect(plan.stages.filter(s=>s.templateCode==='RCC')).toHaveLength(2);
  expect(plan.stages.filter(s=>s.templateCode==='FINISHES')).toHaveLength(0);
 });
});
