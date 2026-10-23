import {describe,expect,it} from 'vitest';
import {defaultStageRequirements,type StageRequirementsMap} from './quotation-stage-requirements';
import {encodeMilestoneFlow,savedMilestoneFlow,validateMilestoneFlow,
 remapMilestoneFlow,projectStageFlowFromMilestones,restoreLegacyMilestoneFlow,visibleMilestoneFlow,suggestWorkArea} from './quotation-milestone-flow';

const requirements:StageRequirementsMap={
 DESIGN:{...defaultStageRequirements('DESIGN'),
  work:['Floor plan','Structural drawing'],checks:['Approved plan dimensions'],materials:[],
  flow:[{kind:'work',index:0},{kind:'work',index:1},{kind:'check',index:0}]},
 FOUNDATION:{...defaultStageRequirements('FOUNDATION'),
  work:['Excavation','Footing pit dressing','Bar bending','Footing concrete'],
  checks:defaultStageRequirements('FOUNDATION').checks,
  materials:['PCC cement','Footing reinforcement steel']},
};
const payments=[
 {stageCodes:['DESIGN']},{stageCodes:['FOUNDATION']},
];
describe('a single ordered work list underneath each payment stage',()=>{
 it('saves Advance -> design work and Foundation Fee -> excavation, materials, check, QC and work',()=>{
  const checkIndex=requirements.FOUNDATION!.checks.indexOf('Reinforcement check against structural drawing');
  const check=checkIndex>=0?checkIndex:0;
  const plan={
   '0':[{kind:'work' as const,code:'DESIGN',index:0},
        {kind:'work' as const,code:'DESIGN',index:1}],
   '1':[
    {kind:'work' as const,code:'FOUNDATION',index:0},
    {kind:'material' as const,code:'FOUNDATION',index:0},
    {kind:'work' as const,code:'FOUNDATION',index:1},
    {kind:'work' as const,code:'FOUNDATION',index:2},
    {kind:'check' as const,code:'FOUNDATION',index:check},
    {kind:'qc' as const,code:'FOUNDATION',index:check},
    {kind:'work' as const,code:'FOUNDATION',index:3},
   ],
  };
  expect(validateMilestoneFlow(plan,requirements,payments)).toEqual(plan);
  expect(savedMilestoneFlow(encodeMilestoneFlow(plan))).toEqual(plan);
  const stageFlow=projectStageFlowFromMilestones('FOUNDATION',requirements,plan);
  expect(stageFlow.slice(0,6).map(s=>s.kind))
   .toEqual(['work','material','work','work','check','qc']);
  expect(stageFlow.filter(s=>s.kind==='material')).toHaveLength(1);
 });
 it('rejects QC before its check and cross-payment stage linking',()=>{
  expect(()=>validateMilestoneFlow({'1':[
   {kind:'qc',code:'FOUNDATION',index:0}]},requirements,payments)).toThrow(/precede/);
  expect(()=>validateMilestoneFlow({'0':[
   {kind:'work',code:'FOUNDATION',index:0}]},requirements,payments)).toThrow(/linked/);
 });
 it('keeps stage associations when rearranging payment stages',()=>{
  const flow={'0':[{kind:'work' as const,code:'DESIGN',index:0}]};
  expect(remapMilestoneFlow(flow,old=>old===0?1:old)).toEqual({'1':flow['0']});
  expect(remapMilestoneFlow(flow,()=>null)).toEqual({});
 });
 it('starts with an empty manually created flow, not 13 duplicate template cards',()=>{
  expect(savedMilestoneFlow('Terms without a milestone flow')).toEqual({});
  expect(encodeMilestoneFlow({})).toBe('');
 });
});


describe('retaining old quotation data when the display changes',()=>{
 it('restores old saved work, checks, QC and materials without writing over them',()=>{
  const legacy={
   FOUNDATION:{...requirements.FOUNDATION!,
    flow:[
     {kind:'work' as const,index:1},
     {kind:'work' as const,index:2},
     {kind:'check' as const,index:0},
     {kind:'qc' as const,index:0},
     {kind:'work' as const,index:0},
     {kind:'work' as const,index:3},
    ],
    reports:['Footing check inspection report'],
   },
  };
  const prior=restoreLegacyMilestoneFlow([{stageCodes:['FOUNDATION']}],legacy);
  expect(prior['0']?.map(item=>item.kind).slice(0,4))
   .toEqual(['work','work','check','qc']);
  expect(prior['0']?.filter(item=>item.kind==='material')).toHaveLength(2);
  expect(legacy.FOUNDATION.reports).toEqual(['Footing check inspection report']);
  expect(validateMilestoneFlow(prior,legacy,[{stageCodes:['FOUNDATION']}])).toEqual(prior);
 });
 it('includes old saved items missing from a newer partial plan',()=>{
  const prior=encodeMilestoneFlow({'0':[{kind:'work',code:'DESIGN',index:0}]});
  const combined=visibleMilestoneFlow(prior,[{stageCodes:['DESIGN']}],{DESIGN:requirements.DESIGN!});
  expect(combined['0']?.filter(step=>step.kind==='work')).toHaveLength(2);
  expect(combined['0']?.some(step=>step.kind==='check')).toBe(true);
 });
 it('does not bring default items into an unrelated unsaved quote',()=>{
  const empty=visibleMilestoneFlow('',[{stageCodes:['DESIGN']}],{});
  expect(empty).toEqual({});
 });
 it('infers a stage from typed site work without forcing technical dropdown selection',()=>{
  const available=['PRECONSTRUCTION','DESIGN','SITE_PREP','FOUNDATION','PLINTH','RCC/THIRD_FLOOR'];
  expect(suggestWorkArea('Bar bending for footings','Advance',[...available],available))
   .toBe('FOUNDATION');
  expect(suggestWorkArea('Floor plan approval','Foundation Fee',available,available))
   .toBe('DESIGN');
  expect(suggestWorkArea('Excavation depth and layout check','Foundation Fee',available,available))
   .toBe('SITE_PREP');
  expect(suggestWorkArea('Next activity','Foundation Fee',available,['FOUNDATION']))
   .toBe('FOUNDATION');
 });
});
