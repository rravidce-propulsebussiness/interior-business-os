import {describe,expect,it} from 'vitest';
import {defaultStageRequirements,type StageRequirementsMap} from './quotation-stage-requirements';
import {encodeMilestoneFlow,savedMilestoneFlow,validateMilestoneFlow,
 remapMilestoneFlow,projectStageFlowFromMilestones} from './quotation-milestone-flow';

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
