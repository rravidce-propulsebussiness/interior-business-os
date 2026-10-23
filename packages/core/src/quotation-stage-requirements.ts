import { z } from 'zod';
import { guidanceForConstructionStage, milestoneConstructionStages } from './construction-payment-schedule';

/** Per-quotation, per-real-stage overrides. Never change shared company templates. */
const list = z.array(z.string().trim().min(2).max(180)).max(50);
const checkList = z.array(z.string().trim().min(3).max(180)).max(50);
export const stageFlowStepSchema=z.object({
 kind:z.enum(['work','check','test','qc']),
 index:z.number().int().min(0).max(49),
}).strict();
export type StageFlowStep=z.infer<typeof stageFlowStepSchema>;
const requirements = z.object({
  work: list.min(1),
  materials: list,
  checks: checkList,
  reports: list,
  flow:z.array(stageFlowStepSchema).max(150).optional(),
}).strict();
// Legacy issued quotations may already contain two-character inspection labels.
// Keep frozen revisions readable, but do not allow those labels in new writes.
const legacyRequirements=requirements.extend({checks:list});
export type StageRequirements = z.infer<typeof requirements>;
export type StageRequirementsMap = Record<string,StageRequirements>;
const CODE = /^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]*)?$/;
const MARK = /\[STAGE_CUSTOM_REQUIREMENTS\]([\s\S]*?)\[\/STAGE_CUSTOM_REQUIREMENTS\]/g;
export const REQUIREMENTS_MARKER = '[STAGE_CUSTOM_REQUIREMENTS]';
const trimUnique=(values:readonly string[])=>[...new Set(values.map(v=>v.trim()).filter(Boolean))];

export function defaultStageRequirements(instanceCode:string):StageRequirements {
 const code=instanceCode.split('/')[0]??'';
 const stage=milestoneConstructionStages().find(s=>s.code===code);
 const guide=guidanceForConstructionStage(code);
 return {
  work:trimUnique(stage?.activities??['Review quoted work and confirm requirements']),
  materials:trimUnique(guide.materials),
  checks:trimUnique([...stage?.inspectionTopics??[],...guide.checks]),
  reports:trimUnique(guide.reports),
 };
}
function validateRequirements(value:unknown,legacyRead:boolean):StageRequirementsMap {
 const raw=z.record(z.string(),legacyRead?legacyRequirements:requirements).parse(value);
 const entries=Object.entries(raw);
 if(entries.length>35)throw new Error('Too many customized construction stages');
 const result:StageRequirementsMap={};
 for(const [code,input] of entries){
  if(code.length>120||!CODE.test(code))throw new Error('Invalid construction stage');
  for(const field of ['work','materials','checks','reports'] as const){
   if(new Set(input[field].map(x=>x.toLowerCase())).size!==input[field].length)
    throw new Error('Duplicate '+field+' in '+code);
  }
  // The ordered sequence is an execution plan, never an extra inspection or
  // independent progress record. QC refers to a previously placed site check.
  if(input.flow){
   const works=new Set<number>();const checks=new Set<number>();const qcs=new Set<number>();
   for(const item of input.flow){
    if(item.index>=(item.kind==='work'?input.work.length:input.checks.length))
     throw new Error('Execution step refers to a missing stage item in '+code);
    if(item.kind==='work'){
     if(works.has(item.index))throw new Error('Duplicate work in execution order');
     works.add(item.index);
    }else if(item.kind==='qc'){
     if(!checks.has(item.index))throw new Error('Site check/test must precede its QC checkpoint');
     if(qcs.has(item.index))throw new Error('Duplicate QC checkpoint');
     qcs.add(item.index);
    }else{
     if(checks.has(item.index))throw new Error('Duplicate check/test in execution order');
     checks.add(item.index);
    }
   }
   if(works.size!==input.work.length||checks.size!==input.checks.length)
    throw new Error('Execution order must include every selected work and check once');
  }
  // In structural stages, a quote may ADD special tests, but cannot remove
  // engineer-mandated hold-point inspections or rebar/concrete QC checks.
  const template=milestoneConstructionStages().find(s=>s.code===code.split('/')[0]);
  if(template?.holdPoint==='structural'){
   const baseline=defaultStageRequirements(code);
   if(baseline.checks.some(x=>!input.checks.includes(x)))
    throw new Error('Mandatory structural quality checks cannot be disabled');
  }
  result[code]=input;
 }
 return result;
}
export function validateStageRequirements(value:unknown):StageRequirementsMap {
 return validateRequirements(value,false);
}

/** Editing draft may still contain older issued two-character check titles.
 * Enforce count and serialized size so multi-floor changes remain safe,
 * but defer strict minimum check length until save.
 */
export function validateStageRequirementsDraft(value:unknown):StageRequirementsMap {
 const draft=validateRequirements(value,true);
 const body=JSON.stringify({version:1,stages:draft});
 if(body.length>7500)throw new Error('Too many project-specific requirements; reduce long descriptions');
 return draft;
}
export function encodeStageRequirements(overrides:StageRequirementsMap):string {
 const cleaned=validateStageRequirements(overrides);
 if(!Object.keys(cleaned).length)return '';
 const body=JSON.stringify({version:1,stages:cleaned});
 if(body.length>7500)throw new Error('Too many project-specific requirements; reduce long descriptions');
 return REQUIREMENTS_MARKER+body+'[/STAGE_CUSTOM_REQUIREMENTS]';
}
export function savedStageRequirements(terms:string):StageRequirementsMap {
 const matches=[...terms.matchAll(MARK)];
 if(!matches.length)return {};
 if(matches.length!==1)throw new Error('Ambiguous saved construction requirements');
 const raw=JSON.parse(matches[0]![1]??'null') as unknown;
 const record=z.object({version:z.literal(1),stages:z.unknown()}).strict().parse(raw);
 return validateRequirements(record.stages,true);
}
export function stripStageRequirements(terms:string):string {
 return terms.replace(MARK,'').trim();
}
export function mergeStageRequirementOverrides(
  all:StageRequirementsMap,instanceCode:string,changed:StageRequirements,
):StageRequirementsMap {
 const validated=requirements.parse(changed);
 const defaults=defaultStageRequirements(instanceCode);
 const merged={...all};
 if(JSON.stringify(validated)===JSON.stringify(defaults))delete merged[instanceCode];
 else merged[instanceCode]=validated;
 return validateStageRequirementsDraft(merged);
}


/** Legacy stages still use work then checks until the user customizes the flow.
 * A QC checkpoint is a reference to an existing site check, never another check.
 */
export function stageExecutionFlow(stage:StageRequirements):StageFlowStep[]{
 return stage.flow??[
  ...stage.work.map((_,index)=>({kind:'work' as const,index})),
  ...stage.checks.map((_,index)=>({kind:'check' as const,index})),
 ];
}

/** Keep stable item references when an existing checklist name is edited or
 * ticked/unticked. Never silently remove a QC checkpoint for an unrelated item.
 */
export function reconcileStageExecutionFlow(
 before:StageRequirements,after:StageRequirements,
):StageRequirements {
 const original=stageExecutionFlow(before);
 const mapIndex=(field:'work'|'checks',oldIndex:number):number=>{
  const oldList=before[field],nextList=after[field];
  const originalName=oldList[oldIndex];
  if(!originalName)return -1;
  const match=nextList.indexOf(originalName);
  if(match!==-1)return match;
  // A same-length one-item replacement is an inline rename.
  if(oldList.length===nextList.length && nextList[oldIndex] &&
    nextList.filter(label=>!oldList.includes(label)).length===1)return oldIndex;
  return -1;
 };
 const reordered:StageFlowStep[]=original.flatMap(item=>{
  const nextIndex=mapIndex(item.kind==='work'?'work':'checks',item.index);
  return nextIndex===-1?[]:[{...item,index:nextIndex}];
 });
 for(let i=0;i<after.work.length;i++){
  if(!reordered.some(step=>step.kind==='work'&&step.index===i))
   reordered.push({kind:'work',index:i});
 }
 for(let i=0;i<after.checks.length;i++){
  if(!reordered.some(step=>['check','test'].includes(step.kind)&&step.index===i))
   reordered.push({kind:'check',index:i});
 }
 return {...after,flow:reordered};
}
