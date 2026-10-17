import { describe,expect,it } from 'vitest';
import { activityFeed,linkedStageCounts,moduleCounts,textValue } from './project-command-data';

const projectId='00000000-0000-4000-8000-000000000001';
const site={
 reports:[
  {id:'r1',report_date:'2026-10-17',completed_work:'Curing completed'},
  {id:'r2',report_date:'2026-10-16',completed_work:'PCC bed finished'},
 ],
 materials:[
  {id:'m1',item:'TMT steel',status:'requested',quantity:5,unit:'ton'},
  {id:'m2',item:'Cement',status:'received',quantity:150,unit:'bags'},
  {id:'m3',item:'Sand',status:'approved',quantity:7,unit:'unit'},
 ],
 checks:[
  {id:'c1',title:'Column cover',status:'passed',due_date:'2026-10-14'},
  {id:'c2',title:'Curing',status:'recheck',due_date:'2026-10-17'},
 ],
 media:[],designs:[],team:[],gate:[],
};
const linked={
 links:[
  {stage_id:'stage-a',kind:'material',record_id:'m1'},
  {stage_id:'stage-a',kind:'material',record_id:'m2'},
  {stage_id:'stage-a',kind:'check',record_id:'c1'},
  {stage_id:'stage-a',kind:'report',record_id:'r1'},
 ],
 payments:[
  {stage_id:'stage-a',item_id:'pay-a',contract_id:'contract-1',label:'Foundation',
   amount:'250000.00',due_date:'2026-10-17',currency:'INR',contract_number:'C-001',
   request_number:'RQ-001',request_status:'issued'},
  {stage_id:'stage-a',item_id:'pay-b',contract_id:'contract-1',label:'PCC',
   amount:'150000.00',due_date:'2026-10-20',currency:'INR',contract_number:'C-001',
   request_number:null,request_status:null},
 ],
 options:[],
};
describe('Project Command Centre reuses recurring project records',()=>{
 it('does not collapse separate procurement or quality entries into a single phase',()=>{
  const result=activityFeed({projectId,site,stageRecord:linked,showFinance:true});
  expect(result.filter(x=>x.kind==='procurement')).toHaveLength(3);
  expect(result.filter(x=>x.kind==='execution')).toHaveLength(2);
  expect(result.filter(x=>x.kind==='quality')).toHaveLength(2);
  expect(result.filter(x=>x.kind==='payment')).toHaveLength(2);
  expect(new Set(result.map(x=>x.id)).size).toBe(result.length);
 });
 it('does not reveal finance when the actor lacks contract-view permission',()=>{
  const result=activityFeed({projectId,site,stageRecord:linked,showFinance:false});
  expect(result.some(x=>x.kind==='payment')).toBe(false);
  expect(result.some(x=>x.description.includes('250000'))).toBe(false);
 });
 it('never conflates a request with an actual customer receipt',()=>{
  const result=activityFeed({projectId,site,stageRecord:linked,showFinance:true});
  expect(result.find(x=>x.id==='payment-pay-a-stage-a')?.description).toBe('Payment request RQ-001');
  expect(result.find(x=>x.id==='payment-pay-b-stage-a')?.description).toBe('Payment request not issued');
  expect(result.filter(x=>x.kind==='payment').map(x=>x.status)).toEqual(['not_requested','issued']);
 });
 it('keeps unlinked evidence out of stage work totals',()=>{
  expect(linkedStageCounts('stage-a',linked)).toEqual({
   materials:2,reports:1,checks:1,photos:0,payments:2,
  });
  expect(linkedStageCounts('stage-b',linked).materials).toBe(0);
 });
 it('computes warning counts from real site records, not sample amounts',()=>{
  expect(moduleCounts(site)).toMatchObject({
   reports:2,materials:3,checks:2,pendingMaterials:2,pendingChecks:1,
  });
  expect(moduleCounts(null)).toBe(null);
  expect(textValue({quantity:150},'quantity')).toBe('150');
 });
});