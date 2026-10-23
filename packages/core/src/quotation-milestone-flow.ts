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


/**
 * Read-only compatibility projection for quotations saved before the single
 * payment-stage editor existed. Only records actually customized and saved
 * with the quotation are restored; no company-wide template is reset.
 * Nothing is written until the owner explicitly saves the quotation.
 */
export function restoreLegacyMilestoneFlow(
 rows:readonly {stageCodes:readonly string[]}[],
 savedRequirements:StageRequirementsMap,
):QuotationMilestoneFlow {
 const restored:QuotationMilestoneFlow={};
 const seen=new Set<string>();
 for(let paymentIndex=0;paymentIndex<rows.length;paymentIndex++){
  const steps:QuotationMilestoneStep[]=[];
  for(const code of rows[paymentIndex]?.stageCodes??[]){
   const stage=savedRequirements[code];
   if(!stage||seen.has(code))continue;
   seen.add(code);
   const original=stage.flow?.length?stage.flow:[
    ...stage.work.map((_,index)=>({kind:'work' as const,index})),
    ...stage.checks.map((_,index)=>({kind:'check' as const,index})),
   ];
   const covered=new Set<string>();
   for(const item of original){
    if(item.kind==='payment')continue;
    const kind=item.kind;
    const field=kind==='work'?'work':kind==='material'?'materials':'checks';
    if(!stage[field][item.index])continue;
    const key=(kind==='test'?'check':kind)+':'+item.index;
    if(covered.has(key))continue;
    if(kind==='qc'&&!covered.has('check:'+item.index))continue;
    steps.push({kind,code,index:item.index});
    covered.add(key);
   }
   // Older versions kept materials outside the ordered work flow.
   // Restore those choices as movable steps rather than hiding/deleting them.
   stage.materials.forEach((_,index)=>{
    if(!covered.has('material:'+index))steps.push({kind:'material',code,index});
   });
   // Keep any formerly saved work/check not present in a partial legacy flow.
   stage.work.forEach((_,index)=>{
    if(!covered.has('work:'+index))steps.push({kind:'work',code,index});
   });
   stage.checks.forEach((_,index)=>{
    if(!covered.has('check:'+index))steps.push({kind:'check',code,index});
   });
  }
  if(steps.length)restored[String(paymentIndex)]=steps;
 }
 return restored;
}

/** Prefer the exact new format; otherwise show previously saved selections. */
export function visibleMilestoneFlow(
 terms:string,payments:readonly {stageCodes:readonly string[]}[],
 savedRequirements:StageRequirementsMap,
):QuotationMilestoneFlow {
 const explicit=savedMilestoneFlow(terms);
 const legacy=restoreLegacyMilestoneFlow(payments,savedRequirements);
 if(!Object.keys(explicit).length)return legacy;
 // A saved newer sequence may have been created before all old work and
 // materials were migrated into it. Reconcile by reference, never by title,
 // preserving every explicit step's chosen order.
 const merged:QuotationMilestoneFlow={...explicit};
 const seen=new Set(Object.values(explicit).flat().map(step=>
  step.code+':'+(step.kind==='test'?'check':step.kind)+':'+step.index));
 for(const [row,steps] of Object.entries(legacy)){
  const missing=steps.filter(step=>{
   const key=step.code+':'+(step.kind==='test'?'check':step.kind)+':'+step.index;
   if(seen.has(key))return false;
   seen.add(key);return true;
  });
  if(missing.length)merged[row]=[...(merged[row]??[]),...missing];
 }
 return merged;
}

/** A typing-first convenience hint. The stored stage code is unchanged and
 * can be corrected in Advanced options before the item is saved. */
export function suggestWorkArea(
 text:string,paymentName:string,available:readonly string[],linked:readonly string[],
 lastCode?:string,
):string {
 const options=[...new Set([...linked,...available])];
 if(!options.length)return '';
 const query=(text+' '+paymentName).toLowerCase();
 const named=(code:string)=>options.find(option=>
  option===code||option.startsWith(code+'/'))??'';
 const hints:[RegExp,string][]=[
  [/\b(floor\s*plan|architecture|architectural|structural\s*(design|drawing)|drawing\s*revision)\b/,'DESIGN'],
  [/\b(site\s*(mark\w*|survey|clearing)|excavat\w*|setting\s*out|layout\s*mark\w*|levelling)\b/,'SITE_PREP'],
  [/\b(footing|pcc|pit\s*dress|bar\s*bend|reinforc|rebar|column\s*base|foundation)\b/,'FOUNDATION'],
  [/\b(plinth|basement)\b/,'PLINTH'],
  [/\b(slab|rcc|beam\s*casting)\b/,'RCC'],
  [/\b(brickwork|masonry|door\s*frame)\b/,'MASONRY'],
  [/\b(plaster)\b/,'INTERNAL_PLASTER'],
  [/\b(tile|flooring)\b/,'TILES'],
  [/\b(plumb|paint)\b/,'PLUMBING_PAINT'],
  [/\b(handover|warranty)\b/,'HANDOVER'],
 ];
 // The entered work description is more specific than a general milestone name.
 for(const [test,code] of hints)if(test.test(text.toLowerCase())&&named(code))return named(code);
 if(lastCode&&options.includes(lastCode))return lastCode;
 for(const [test,code] of hints)if(test.test(query)&&named(code))return named(code);
 return linked[0]??options[0]??'';
}
