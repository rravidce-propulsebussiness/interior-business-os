import {z} from 'zod';
import {defaultStageRequirements,type StageRequirementsMap} from './quotation-stage-requirements';

/** One visible ordered list inside each customer-facing payment milestone.
 * Stage codes preserve real construction/project ownership. No duplicate QC,
 * material order, or payment ledger is created by these display references. */
export const quotationMilestoneStep=z.object({
 kind:z.enum(['work','material','check','test','qc']),
 code:z.string().regex(/^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]*)?$/).max(120),
 index:z.number().int().min(0).max(49),
}).strict();
export type QuotationMilestoneStep=z.infer<typeof quotationMilestoneStep>;
export type QuotationMilestoneFlow=Record<string,QuotationMilestoneStep[]>;
const MAX_SERIALIZED=7000;
const MARK=/\[QUOTATION_MILESTONE_FLOW\]([\s\S]*?)\[\/QUOTATION_MILESTONE_FLOW\]/g;
const data=z.object({
 version:z.literal(1),
 rows:z.record(z.string().regex(/^(0|[1-9]\d?)$/),
  z.array(quotationMilestoneStep).max(100)),
}).strict();

export function validateMilestoneFlow(
 raw:unknown,stages:StageRequirementsMap,payments:readonly {stageCodes:readonly string[]}[],
):QuotationMilestoneFlow {
 const parsed=data.parse({version:1,rows:raw});
 const entries=Object.entries(parsed.rows);
 if(entries.length>40)throw new Error('Too many milestone execution plans');
 const used=new Set<string>();
 let total=0;
 for(const [position,steps] of entries){
  const row=payments[Number(position)];
  if(!row)throw new Error('Execution plan belongs to a removed payment milestone');
  const passedChecks=new Set<string>();
  for(const step of steps){
   total++;
   if(total>150)throw new Error('Too many execution steps; simplify the sequence');
   if(!row.stageCodes.includes(step.code))
    throw new Error('Choose a construction stage linked to this payment');
   const stage=stages[step.code]??defaultStageRequirements(step.code);
   const field=step.kind==='work'?'work':step.kind==='material'?'materials':'checks';
   if(!stage[field][step.index])
    throw new Error('Execution item no longer exists in '+step.code);
   const key=step.code+':'+step.kind+':'+step.index;
   if(step.kind==='qc'){
    const checkKey=step.code+':check:'+step.index;
    if(!passedChecks.has(checkKey))
     throw new Error('Site check or test must precede company QC');
    if(used.has(key))throw new Error('Duplicate company QC in execution order');
   }else if(step.kind==='check'||step.kind==='test'){
    const checkKey=step.code+':check:'+step.index;
    if(used.has(checkKey))throw new Error('Site check or test is already in the sequence');
    passedChecks.add(checkKey);
    used.add(checkKey);
   }else if(used.has(key))throw new Error('Work or material is already in the execution order');
   used.add(key);
  }
 }
 return parsed.rows;
}
export function savedMilestoneFlow(terms:string):QuotationMilestoneFlow {
 const found=[...terms.matchAll(MARK)];
 if(!found.length)return {};
 if(found.length!==1)throw new Error('Duplicate saved milestone sequences');
 const raw=JSON.parse(found[0]![1]??'null') as unknown;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid saved milestone flow');
 return data.parse(raw).rows;
}
export function encodeMilestoneFlow(raw:QuotationMilestoneFlow):string {
 if(!Object.values(raw).some(steps=>steps.length))return '';
 const parsed=data.parse({version:1,rows:raw});
 const json=JSON.stringify(parsed);
 if(json.length>MAX_SERIALIZED)
  throw new Error('Milestone workflow exceeds the quotation limit');
 return '[QUOTATION_MILESTONE_FLOW]'+json+'[/QUOTATION_MILESTONE_FLOW]';
}
export function remapMilestoneFlow(
 flow:QuotationMilestoneFlow,remap:(oldIndex:number)=>number|null,
):QuotationMilestoneFlow {
 const next:QuotationMilestoneFlow={};
 for(const [old,steps] of Object.entries(flow)){
  const index=remap(Number(old));
  if(index===null||index<0||index>=40)continue;
  const key=String(index);
  next[key]=[...(next[key]??[]),...steps];
 }
 return next;
}

/** The original site stage records are canonical; this computes their flow
 * projections while retaining mandatory structural checks for certification.
 * The visible UI must not create extra independent QC tasks. */
export function projectStageFlowFromMilestones(
 code:string,stages:StageRequirementsMap,plan:QuotationMilestoneFlow,
):{kind:'work'|'check'|'test'|'qc'|'material';index:number}[] {
 const stage=stages[code]??defaultStageRequirements(code);
 const steps=Object.keys(plan).sort((a,b)=>Number(a)-Number(b))
  .flatMap(key=>plan[key]??[]).filter(item=>item.code===code)
  .map(({kind,index})=>({kind,index}));
 const known=new Set(steps.filter(item=>item.kind!=='qc').map(item=>
  (item.kind==='test'?'check':item.kind)+':'+item.index));
 for(let index=0;index<stage.work.length;index++){
  if(!known.has('work:'+index))steps.push({kind:'work',index});
 }
 for(let index=0;index<stage.checks.length;index++){
  if(!known.has('check:'+index))steps.push({kind:'check',index});
 }
 return steps;
}
