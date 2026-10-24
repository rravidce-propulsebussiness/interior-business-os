import {z} from 'zod';
import {defaultStageRequirements,type StageRequirementsMap,validateStageRequirementsDraft,encodeStageRequirements} from './quotation-stage-requirements';
import {standardMilestoneWorkflow,validateMilestoneFlow,encodeMilestoneFlow,
 type QuotationMilestoneFlow,type QuotationMilestoneStep} from './quotation-milestone-flow';
import {milestoneConstructionStages} from './construction-payment-schedule';

const validAreas=new Set(milestoneConstructionStages().map(x=>x.code));
export const companyWorkStep=z.object({
 kind:z.enum(['work','material','check','test','qc']),
 name:z.string().trim().min(2).max(180),
 area:z.string().regex(/^[A-Z][A-Z_]*$/).max(45),
 // Presentation grouping only; real project mapping remains the area code.
 substage:z.string().trim().min(2).max(90).optional(),
 optional:z.boolean().optional(),
}).strict().superRefine((item,ctx)=>{
 if(!validAreas.has(item.area))ctx.addIssue({code:'custom',message:'Unknown construction work area'});
});
export type CompanyWorkStep=z.infer<typeof companyWorkStep>;
const row=z.object({
 name:z.string().trim().min(2).max(100),
 percent:z.union([z.number(),z.string()]).transform(value=>Number(value))
  .pipe(z.number().finite().positive().max(100)),
 areas:z.array(z.string().max(45)).max(15).optional(),
 // A custom human-readable label is separate from the stable project stage
 // identifier so changing its text never breaks quotation/project mapping.
 areaLabels:z.record(z.string().max(45),z.string().trim().min(2).max(80)).optional(),
 steps:z.array(companyWorkStep).max(100).optional(),
}).strict();
export const companyConstructionPaymentRows=z.array(row).min(1).max(40).superRefine((rows,ctx)=>{
 if(Math.abs(rows.reduce((sum,item)=>sum+item.percent,0)-100)>0.001)
  ctx.addIssue({code:'custom',message:'Total payment percentage must be exactly 100%'});
 let total=0;
 for(const [position,item] of rows.entries()){
  total+=(item.steps?.length??0);
  const seen=new Set<string>();
  const checked=new Set<string>();
  for(const [code] of Object.entries(item.areaLabels??{})){
   if(!validAreas.has(code)||!(item.areas??[]).includes(code))
    ctx.addIssue({code:'custom',message:'Area label must belong to a linked construction area',path:[position,'areaLabels',code]});
  }
  for(const step of item.steps??[]){
   if(item.areas?.length&&!item.areas.includes(step.area))
    ctx.addIssue({code:'custom',message:'Item must belong to this milestone work area',path:[position,'steps']});
   const key=step.area+':'+step.kind+':'+step.name.toLowerCase();
   if(seen.has(key))ctx.addIssue({code:'custom',message:'Duplicate item',path:[position,'steps']});
   seen.add(key);
   const check=step.area+':'+step.name.toLowerCase();
   if(step.kind==='check'||step.kind==='test')checked.add(check);
   if(step.kind==='qc'&&!checked.has(check))
    ctx.addIssue({code:'custom',message:'Company QC must follow the matching site check or test',path:[position,'steps']});
  }
 }
 if(total>650)ctx.addIssue({code:'custom',message:'A company template supports up to 650 steps'});
});
export type CompanyConstructionPaymentRow=z.infer<typeof companyConstructionPaymentRows>[number];


const areaHints:[RegExp,string][]=[
 [/(agreement|advance|pre.?construction|survey|permit|site\s*inspection)/i,'PRECONSTRUCTION'],
 [/(design|drawing|floor\s*plan|architecture)/i,'DESIGN'],
 [/(site\s*prep|marking|excavat|setting.?out|site\s*clearing)/i,'SITE_PREP'],
 [/(foundation|footing|bar.?bend|reinforcement|pcc\b|pit.?dress)/i,'FOUNDATION'],
 [/(plinth|basement)/i,'PLINTH'],
 [/(rcc|slab|beam|column\s*casting)/i,'RCC'],
 [/(brick|masonry|block\s*work)/i,'MASONRY'],
 [/(external\s*plaster|outer\s*plaster|elevation)/i,'EXTERNAL_PLASTER'],
 [/(internal\s*plaster|inside\s*plaster)/i,'INTERNAL_PLASTER'],
 [/(plumb|paint|sanitary)/i,'PLUMBING_PAINT'],
 [/(tile|flooring)/i,'TILES'],
 [/(door|window)/i,'DOORS'],
 [/(handover|warranty|final\s*inspection)/i,'HANDOVER'],
];
/** Text labels are editable. Code is retained internally for valid project mapping.
 * Avoid guessing a wrong stage for a name that cannot be resolved. */
export function inferCompanyWorkAreaCode(name:string):string|null {
 const normal=name.trim();
 if(!normal)return null;
 const direct=normal.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
 if(validAreas.has(direct))return direct;
 for(const [pattern,code] of areaHints)if(pattern.test(normal)&&validAreas.has(code))return code;
 return null;
}
export function companyWorkAreaLabel(
 row:CompanyConstructionPaymentRow,code:string,
):string {
 return row.areaLabels?.[code]??code.replaceAll('_',' ');
}
export function applyCompanyPaymentDefaults(
 suggested:readonly {name:string;percent:string;stageCodes:string[]}[],
 defaults:readonly CompanyConstructionPaymentRow[],
):{name:string;percent:string;stageCodes:string[]}[] {
 if(!defaults.length||defaults.length!==suggested.length)return suggested.map(x=>({
  ...x,stageCodes:[...x.stageCodes],
 }));
 return suggested.map((row,i)=>({
  ...row,name:defaults[i]!.name,percent:String(defaults[i]!.percent),
  stageCodes:[...row.stageCodes],
 }));
}
const family=(code:string)=>code.split('/')[0]??code;
function matches(row:{stageCodes:readonly string[]},template:CompanyConstructionPaymentRow){
 const families=new Set(row.stageCodes.map(family));
 const areas=template.areas?.length?template.areas:(template.steps??[]).map(step=>step.area);
 return areas.some(area=>families.has(area));
}
/** Clone the editable company work-order template into a NEW quotation only.
 * Per-floor stage identifiers are derived from the actual quotation, never
 * copied from a company-level floor template.
 */
export function applyCompanyWorkDefaults(
 payments:readonly {stageCodes:string[]}[],
 defaults:readonly CompanyConstructionPaymentRow[],
 original:StageRequirementsMap={},
):{requirements:StageRequirementsMap;flow:QuotationMilestoneFlow} {
 const requirements:StageRequirementsMap={...original};
 const planned:QuotationMilestoneFlow={};
 const fallback=standardMilestoneWorkflow(payments,requirements);
 const seenCodes=new Set<string>();
 for(let i=0;i<payments.length;i++){
  const payment=payments[i]!;
  const chosen=defaults.length===payments.length?defaults[i]:
   defaults.find(item=>matches(payment,item));
  const template=(chosen?.steps??[]).filter(item=>!item.optional);
  if(!template.length){planned[String(i)]=fallback[String(i)]??[];continue;}
  const steps:QuotationMilestoneStep[]=[];
  const activeCodes=new Set<string>();
  // Combined brickwork payment: apply the exact same company checklist to
  // EACH linked floor, in floor order, without sharing inspection records.
  const masonryCodes=payment.stageCodes.filter(code=>family(code)==='MASONRY');
  const repeatMasonry=masonryCodes.length>1&&template.every(item=>item.area==='MASONRY');
  const assignments=repeatMasonry
   ?masonryCodes.flatMap(code=>template.map(item=>({item,code})))
   :template.map(item=>({item,code:payment.stageCodes.find(x=>family(x)===item.area)}));
  for(const {item,code} of assignments){
   if(!code||seenCodes.has(code))continue;
   if(!activeCodes.has(code)){
    activeCodes.add(code);
    const baseline=defaultStageRequirements(code);
    const structural=milestoneConstructionStages().find(x=>x.code===item.area)?.holdPoint==='structural';
    requirements[code]={work:[],materials:[],checks:structural?[...baseline.checks]:[],
      reports:[...baseline.reports]};
   }
   const scope=requirements[code]!;
   const field=item.kind==='work'?'work':item.kind==='material'?'materials':'checks';
   let index=scope[field].indexOf(item.name);
   if(index===-1){
    if(item.kind==='qc')continue;
    index=scope[field].length;
    scope[field].push(item.name);
   }
   const value:QuotationMilestoneStep={kind:item.kind,code,index,
    ...(item.substage?{substage:item.substage}:{})};
   if(steps.some(x=>x.code===value.code&&x.index===value.index&&
      (x.kind===value.kind||(value.kind==='test'&&x.kind==='check')||
        (value.kind==='check'&&x.kind==='test'))))continue;
   steps.push(value);
  }
  for(const code of activeCodes){
   seenCodes.add(code);
   const scope=requirements[code]!;
   const base=defaultStageRequirements(code);
   if(!scope.work.length)scope.work.push(base.work[0]??'Review scope and approved drawings');
   // Structural hold points cannot be removed: place any missing ones after
   // company steps, keeping their QC independent.
   for(let j=0;j<scope.work.length;j++)if(!steps.some(s=>s.code===code&&s.kind==='work'&&s.index===j))
    steps.push({kind:'work',code,index:j});
   for(let j=0;j<scope.checks.length;j++)if(!steps.some(s=>s.code===code&&['check','test'].includes(s.kind)&&s.index===j))
    steps.push({kind:'check',code,index:j});
   scope.flow=steps.filter(x=>x.code===code).map(({kind,index})=>({kind,index}));
  }
  planned[String(i)]=steps.length?steps:(fallback[String(i)]??[]);
 }
 // Preserve as many full milestones as can fit the bounded quotation terms.
 // In particular, a large floor-wise company template must not discard the
 // short Planning sequence and silently restore 31 older default checklist
 // items. Other stages still retain their canonical default guidance.
 const valid=(stages:StageRequirementsMap,plan:QuotationMilestoneFlow)=>{
  validateStageRequirementsDraft(stages);
  validateMilestoneFlow(plan,stages,payments);
  encodeStageRequirements(stages);
  encodeMilestoneFlow(plan);
 };
 try{
  valid(requirements,planned);
  return {requirements,flow:planned};
 }catch{
  const keptRequirements:StageRequirementsMap={...original};
  const keptFlow:QuotationMilestoneFlow={};
  for(let index=0;index<payments.length;index++){
   const payment=payments[index]!;
   const own=Object.fromEntries(payment.stageCodes.flatMap(code=>
    requirements[code]&&!keptRequirements[code]?[[code,requirements[code]!]]:[])
   ) as StageRequirementsMap;
   const trialRequirements={...keptRequirements,...own};
   const trialFlow={...keptFlow};
   if(planned[String(index)]?.length)trialFlow[String(index)]=planned[String(index)]!;
   try{
    valid(trialRequirements,trialFlow);
    Object.assign(keptRequirements,own);
    Object.assign(keptFlow,trialFlow);
   }catch{
    // Do not persist a partly copied stage. Built-in stage templates remain
    // available to the quotation until individual work is customized.
    const builtin=fallback[String(index)];
    if(!builtin?.length)continue;
    const fallbackTrial={...keptFlow,[String(index)]:builtin};
    try{valid(keptRequirements,fallbackTrial);Object.assign(keptFlow,fallbackTrial);}
    catch{ /* This stage still uses canonical stage guidance at execution. */ }
   }
  }
  return {requirements:keptRequirements,flow:keptFlow};
 }
}

/** The first priced Planning milestone. Payment is already represented by
 * the milestone amount in Finance; do not duplicate it as a work task. */
export const planningWorkDefaults:readonly CompanyWorkStep[]=[
 {kind:'work',name:'Price Freeze',area:'PRECONSTRUCTION'},
 {kind:'work',name:'Agreement',area:'PRECONSTRUCTION'},
 {kind:'work',name:'Floor Plan',area:'DESIGN'},
 {kind:'work',name:'Structural Design',area:'DESIGN'},
 {kind:'work',name:'MEP Plans',area:'DESIGN'},
 {kind:'check',name:'Site Inspection',area:'PRECONSTRUCTION'},
];

/** Seven ordered sub-stages under the ONE existing 18% Foundation payment.
 * Review-only company defaults: no completion, concrete QC approval, daily
 * curing notification, purchase order or payment is generated by this list.
 * Optional masonry/sump/termite items are visible in Settings but excluded
 * from new quotations until specifically made required by the company.
 */
export const foundationSubstageNames = [
 'Excavation and PCC',
 'Footings',
 'Foundation columns',
 'Backfilling and basement masonry',
 'Plinth beam',
 'Soil filling and termite treatment',
 'Ground PCC and completion'
] as const;
export const foundationWorkDefaults:readonly CompanyWorkStep[]=[
 {kind:'work',name:'Site marking and reference benchmarks',area:'SITE_PREP',substage:'Excavation and PCC'},
 {kind:'work',name:'Excavation',area:'SITE_PREP',substage:'Excavation and PCC'},
 {kind:'work',name:'Foundation pit dressing and dewatering where required',area:'SITE_PREP',substage:'Excavation and PCC'},
 {kind:'check',name:'Foundation size, pit depth and grid lines against structural design',area:'SITE_PREP',substage:'Excavation and PCC'},
 {kind:'check',name:'Founding level and bearing strata engineer clearance',area:'SITE_PREP',substage:'Excavation and PCC'},
 {kind:'check',name:'Pit cleaning and safety before PCC',area:'SITE_PREP',substage:'Excavation and PCC'},
 {kind:'material',name:'40 mm aggregate for foundation PCC (if specified)',area:'FOUNDATION',substage:'Excavation and PCC'},
 {kind:'material',name:'Sand and cement for foundation PCC',area:'FOUNDATION',substage:'Excavation and PCC'},
 {kind:'work',name:'PCC bed beneath footings',area:'FOUNDATION',substage:'Excavation and PCC'},
 {kind:'check',name:'PCC grade, thickness, level and mix proportion',area:'FOUNDATION',substage:'Excavation and PCC'},
 {kind:'check',name:'PCC compaction and curing record',area:'FOUNDATION',substage:'Excavation and PCC'},
 {kind:'work',name:'Footing and column centre marking',area:'FOUNDATION',substage:'Footings'},
 {kind:'material',name:'TMT steel for footing reinforcement',area:'FOUNDATION',substage:'Footings'},
 {kind:'material',name:'Binding wire and cover blocks for footings',area:'FOUNDATION',substage:'Footings'},
 {kind:'work',name:'Bar bending and ties for footings',area:'FOUNDATION',substage:'Footings'},
 {kind:'work',name:'Footing reinforcement and column starter placement',area:'FOUNDATION',substage:'Footings'},
 {kind:'check',name:'Footing rebar diameter, quantity, bending and anchorage per structural design',area:'FOUNDATION',substage:'Footings'},
 {kind:'check',name:'Footing bar spacing, tie spacing, laps and cover blocks',area:'FOUNDATION',substage:'Footings'},
 {kind:'check',name:'Column starter position and alignment before footing concrete',area:'FOUNDATION',substage:'Footings'},
 {kind:'work',name:'Footing shuttering and pre-pour preparation',area:'FOUNDATION',substage:'Footings'},
 {kind:'check',name:'Footing formwork size, stability and reinforcement pre-pour approval',area:'FOUNDATION',substage:'Footings'},
 {kind:'material',name:'Sand, cement and 20 mm aggregate for footing concrete',area:'FOUNDATION',substage:'Footings'},
 {kind:'work',name:'Footing concreting and vibration',area:'FOUNDATION',substage:'Footings'},
 {kind:'test',name:'Footing concrete slump and cube sampling as per QA plan',area:'FOUNDATION',substage:'Footings'},
 {kind:'check',name:'Footing mix grade, compaction and vibrator use',area:'FOUNDATION',substage:'Footings'},
 {kind:'work',name:'Footing curing and concrete protection',area:'FOUNDATION',substage:'Footings'},
 {kind:'work',name:'Column starter, grid and position verification',area:'PLINTH',substage:'Foundation columns'},
 {kind:'material',name:'TMT steel, ties and cover blocks for foundation columns',area:'PLINTH',substage:'Foundation columns'},
 {kind:'work',name:'Foundation column reinforcement and shuttering',area:'PLINTH',substage:'Foundation columns'},
 {kind:'check',name:'Column position, dimensions, cover, bar laps and ties per structural design',area:'PLINTH',substage:'Foundation columns'},
 {kind:'check',name:'Column plumb, shuttering and junction pre-pour approval',area:'PLINTH',substage:'Foundation columns'},
 {kind:'material',name:'Sand, cement and 20 mm aggregate for foundation columns',area:'PLINTH',substage:'Foundation columns'},
 {kind:'work',name:'Foundation column concreting and vibration',area:'PLINTH',substage:'Foundation columns'},
 {kind:'test',name:'Column concrete slump and cube sampling as per QA plan',area:'PLINTH',substage:'Foundation columns'},
 {kind:'check',name:'Column concrete grade and vibration; honeycombing review',area:'PLINTH',substage:'Foundation columns'},
 {kind:'work',name:'Foundation column deshuttering and curing',area:'PLINTH',substage:'Foundation columns'},
 {kind:'check',name:'Foundation protection and approval before backfilling',area:'PLINTH',substage:'Backfilling and basement masonry'},
 {kind:'work',name:'Approved soil backfilling in controlled layers',area:'PLINTH',substage:'Backfilling and basement masonry'},
 {kind:'check',name:'Backfill material quality and layer compaction',area:'PLINTH',substage:'Backfilling and basement masonry'},
 {kind:'work',name:'Granite or stone foundation masonry marking (if in design)',area:'PLINTH',substage:'Backfilling and basement masonry',optional:true},
 {kind:'material',name:'Granite, cement and sand for foundation masonry (if in design)',area:'PLINTH',substage:'Backfilling and basement masonry',optional:true},
 {kind:'work',name:'Foundation masonry or basement work per approved design',area:'PLINTH',substage:'Backfilling and basement masonry',optional:true},
 {kind:'check',name:'Masonry levels, alignment and mortar per approved design',area:'PLINTH',substage:'Backfilling and basement masonry',optional:true},
 {kind:'work',name:'Sump foundation and waterproofing works (if in scope)',area:'PLINTH',substage:'Backfilling and basement masonry',optional:true},
 {kind:'check',name:'Sump waterproofing and water-tightness testing (if in scope)',area:'PLINTH',substage:'Backfilling and basement masonry',optional:true},
 {kind:'work',name:'Plinth beam setting out and bar bending schedule',area:'PLINTH',substage:'Plinth beam'},
 {kind:'material',name:'TMT bars, binding wire and cover blocks for plinth beam',area:'PLINTH',substage:'Plinth beam'},
 {kind:'work',name:'Plinth beam reinforcement, ties and shuttering',area:'PLINTH',substage:'Plinth beam'},
 {kind:'check',name:'Plinth beam steel, stirrup spacing, anchorage and cover per structural drawings',area:'PLINTH',substage:'Plinth beam'},
 {kind:'check',name:'Plinth beam dimensions, levels and shuttering pre-pour approval',area:'PLINTH',substage:'Plinth beam'},
 {kind:'material',name:'Sand, cement and 20 mm aggregate for plinth beam',area:'PLINTH',substage:'Plinth beam'},
 {kind:'work',name:'Plinth beam concreting and vibration',area:'PLINTH',substage:'Plinth beam'},
 {kind:'test',name:'Plinth beam concrete slump and cube sampling as per QA plan',area:'PLINTH',substage:'Plinth beam'},
 {kind:'check',name:'Plinth beam concrete grade, mix and vibrator compaction',area:'PLINTH',substage:'Plinth beam'},
 {kind:'work',name:'Plinth beam deshuttering and curing',area:'PLINTH',substage:'Plinth beam'},
 {kind:'work',name:'Ground fill and soil levelling',area:'PLINTH',substage:'Soil filling and termite treatment'},
 {kind:'material',name:'Approved compactable soil or murram for ground filling',area:'PLINTH',substage:'Soil filling and termite treatment'},
 {kind:'work',name:'Soil compaction in approved layers',area:'PLINTH',substage:'Soil filling and termite treatment'},
 {kind:'test',name:'Field density and compaction testing where specified',area:'PLINTH',substage:'Soil filling and termite treatment'},
 {kind:'check',name:'Backfill and ground fill levels, moisture and layer thickness',area:'PLINTH',substage:'Soil filling and termite treatment'},
 {kind:'work',name:'Install and inspect concealed plumbing sleeves and conduits',area:'PLINTH',substage:'Soil filling and termite treatment'},
 {kind:'check',name:'Concealed services positions before ground PCC',area:'PLINTH',substage:'Soil filling and termite treatment'},
 {kind:'material',name:'Approved anti-termite treatment materials where specified',area:'PLINTH',substage:'Soil filling and termite treatment',optional:true},
 {kind:'work',name:'Anti-termite treatment per approved method and locations',area:'PLINTH',substage:'Soil filling and termite treatment',optional:true},
 {kind:'check',name:'Anti-termite application and coverage record where specified',area:'PLINTH',substage:'Soil filling and termite treatment',optional:true},
 {kind:'check',name:'Final sub-base, compaction and service clearance',area:'PLINTH',substage:'Ground PCC and completion'},
 {kind:'material',name:'Sand, cement and specified aggregate for ground PCC',area:'PLINTH',substage:'Ground PCC and completion'},
 {kind:'work',name:'Ground PCC bed laying, levelling and finishing',area:'PLINTH',substage:'Ground PCC and completion'},
 {kind:'check',name:'Ground PCC grade, thickness, levels and finished slope',area:'PLINTH',substage:'Ground PCC and completion'},
 {kind:'work',name:'Ground PCC curing and protection',area:'PLINTH',substage:'Ground PCC and completion'},
 {kind:'check',name:'Foundation completion photos and engineer review',area:'PLINTH',substage:'Ground PCC and completion'},
];

/** Repeat this one approved RCC sequence against the actual floor codes
 * RCC/GROUND, RCC/FIRST, etc. Five slabs = five existing payment milestones,
 * never five copies of the template definition. Per-project edits stay local.
 * Concrete/testing values and hold points follow approved engineer QA plans. */
export const rccSlabSubstageNames = ['Columns and starters','Staircase','Beams and slab'] as const;
export const rccSlabWorkDefaults:readonly CompanyWorkStep[]=[
 {kind:'work',name:'Column marking, position and starters as per structural plan',area:'RCC',substage:'Columns and starters'},
 {kind:'material',name:'TMT steel for columns, binding wire and cover blocks',area:'RCC',substage:'Columns and starters'},
 {kind:'work',name:'Column bar bending, reinforcement and ties',area:'RCC',substage:'Columns and starters'},
 {kind:'check',name:'Column bar bending, lap zones, ring spacing and cover as per design',area:'RCC',substage:'Columns and starters'},
 {kind:'work',name:'Column shuttering and reinforcement supports',area:'RCC',substage:'Columns and starters'},
 {kind:'check',name:'Column and staircase-column heights, levels, dimensions and alignment',area:'RCC',substage:'Columns and starters'},
 {kind:'check',name:'Column reinforcement and shuttering pre-pour structural clearance',area:'RCC',substage:'Columns and starters'},
 {kind:'material',name:'Sand, cement and 20 mm aggregate for column concrete',area:'RCC',substage:'Columns and starters'},
 {kind:'work',name:'Column concreting with proper vibration',area:'RCC',substage:'Columns and starters'},
 {kind:'check',name:'Column concrete mix grade, compaction and vibrator checks',area:'RCC',substage:'Columns and starters'},
 {kind:'test',name:'Column concrete slump and cube sampling per approved QA plan',area:'RCC',substage:'Columns and starters'},
 {kind:'work',name:'Column deshuttering, plumb verification and daily curing',area:'RCC',substage:'Columns and starters'},
 {kind:'work',name:'Staircase and landing shuttering with supports',area:'RCC',substage:'Staircase'},
 {kind:'material',name:'TMT bars, ties and cover blocks for staircase',area:'RCC',substage:'Staircase'},
 {kind:'work',name:'Staircase reinforcement cutting, bending and fixing',area:'RCC',substage:'Staircase'},
 {kind:'check',name:'Stair flight width, riser height, tread depth and landing level as per design',area:'RCC',substage:'Staircase'},
 {kind:'check',name:'Stair reinforcement anchorage, cover and shuttering stability',area:'RCC',substage:'Staircase'},
 {kind:'work',name:'Staircase concreting with slab or separate approved pour',area:'RCC',substage:'Staircase'},
 {kind:'work',name:'Staircase curing and concrete protection',area:'RCC',substage:'Staircase'},
 {kind:'work',name:'Beam and slab shuttering, centering and propping',area:'RCC',substage:'Beams and slab'},
 {kind:'material',name:'TMT bars, binding wire and cover blocks for beams and slab',area:'RCC',substage:'Beams and slab'},
 {kind:'work',name:'Beam and slab bar bending and reinforcement placing',area:'RCC',substage:'Beams and slab'},
 {kind:'work',name:'Electrical conduit, fan-box and embedded-service layout',area:'RCC',substage:'Beams and slab'},
 {kind:'check',name:'Beam and slab rebar size, spacing, bends, laps, anchorage and cover per design',area:'RCC',substage:'Beams and slab'},
 {kind:'check',name:'Beam/slab shuttering dimensions, levels, supports and stability',area:'RCC',substage:'Beams and slab'},
 {kind:'check',name:'Electrical layout, conduits, sleeves and embedments match approved MEP design',area:'RCC',substage:'Beams and slab'},
 {kind:'check',name:'Structural engineer pre-pour reinforcement and shuttering clearance',area:'RCC',substage:'Beams and slab'},
 {kind:'material',name:'Sand, cement and 20 mm aggregate for beams and slab concrete',area:'RCC',substage:'Beams and slab'},
 {kind:'work',name:'Beam and slab concreting, level control and vibrator compaction',area:'RCC',substage:'Beams and slab'},
 {kind:'test',name:'Slab concrete slump/workability and cube samples per QA plan',area:'RCC',substage:'Beams and slab'},
 {kind:'check',name:'Slab mix grade/ratio, vibration, levels and finish',area:'RCC',substage:'Beams and slab'},
 {kind:'work',name:'Daily slab curing and concrete protection',area:'RCC',substage:'Beams and slab'},
 {kind:'check',name:'Deshuttering and reshoring only after engineer clearance',area:'RCC',substage:'Beams and slab'},
];

/** The brickwork payment may combine two adjacent floors. This company template
 * is authored once and applied to each actual MASONRY/FLOOR stage independently.
 * A reinforced sill band is *not* damp-proof course (DPC). A nominal 3-ft
 * sill height is never assumed: the approved floor and structural drawings
 * control elevations, steel and concrete requirements.
 * Electrical work here means masonry-stage provisions, not final wiring or
 * the later internal-plaster concealed-service pressure / closure checks.
 */
export const masonrySubstageNames = ['Floor plan and wall marking','Brickwork and alignment','Sill band and lintels','Electrical provisions and handover'] as const;
export const masonryWorkDefaults:readonly CompanyWorkStep[]=[
 {kind:'work',name:'Review the approved floor plan and room wall schedule',area:'MASONRY',substage:'Floor plan and wall marking'},
 {kind:'work',name:'Mark brick walls, partitions and wall thicknesses on slab',area:'MASONRY',substage:'Floor plan and wall marking'},
 {kind:'check',name:'Verify brickwall grid, wall marking, room dimensions and thickness against floor plan',area:'MASONRY',substage:'Floor plan and wall marking'},
 {kind:'check',name:'Check positions, widths and heights of doors, windows and ventilators',area:'MASONRY',substage:'Floor plan and wall marking'},
 {kind:'check',name:'Check masonry start condition, supporting slab and reference levels',area:'MASONRY',substage:'Floor plan and wall marking'},
 {kind:'material',name:'Approved bricks or blocks for this floor',area:'MASONRY',substage:'Brickwork and alignment'},
 {kind:'material',name:'Sand and cement for masonry mortar',area:'MASONRY',substage:'Brickwork and alignment'},
 {kind:'work',name:'Prepare brick/block units and approved mortar mix',area:'MASONRY',substage:'Brickwork and alignment'},
 {kind:'work',name:'Build brickwalls and partitions with required bonding and joints',area:'MASONRY',substage:'Brickwork and alignment'},
 {kind:'check',name:'Verify brick quality, mortar mix, bond, joint thickness and workmanship',area:'MASONRY',substage:'Brickwork and alignment'},
 {kind:'check',name:'Check wall line, level, plumb, verticality and opening clearances',area:'MASONRY',substage:'Brickwork and alignment'},
 {kind:'work',name:'Cure and protect new brickwork per approved specifications',area:'MASONRY',substage:'Brickwork and alignment'},
 {kind:'material',name:'TMT steel, binding wire, cover blocks and formwork for reinforced sill band where specified',area:'MASONRY',substage:'Sill band and lintels',optional:true},
 {kind:'work',name:'Construct reinforced sill-level band at drawing-approved elevation where specified',area:'MASONRY',substage:'Sill band and lintels',optional:true},
 {kind:'check',name:'Verify sill-band height, steel, cover, anchorage and pre-pour clearance per structural design',area:'MASONRY',substage:'Sill band and lintels',optional:true},
 {kind:'material',name:'Lintel steel, formwork, cement, sand and specified concrete aggregate where required',area:'MASONRY',substage:'Sill band and lintels'},
 {kind:'work',name:'Mark door, window and ventilator lintel levels and bearing locations',area:'MASONRY',substage:'Sill band and lintels'},
 {kind:'check',name:'Check lintel elevation, width, depth, end bearing and reinforcement against approved design',area:'MASONRY',substage:'Sill band and lintels'},
 {kind:'work',name:'Install or cast lintels over openings according to structural drawings',area:'MASONRY',substage:'Sill band and lintels'},
 {kind:'check',name:'Check lintel shuttering, reinforcement, cover blocks, supports and pour quality',area:'MASONRY',substage:'Sill band and lintels'},
 {kind:'work',name:'Cure masonry lintels and reinforced bands where cast',area:'MASONRY',substage:'Sill band and lintels'},
 {kind:'material',name:'Electrical conduit pipes, bends, junction boxes and wall boxes for this floor',area:'MASONRY',substage:'Electrical provisions and handover'},
 {kind:'work',name:'Mark electrical switchboards, sockets, outlets and conduit routes from approved MEP layout',area:'MASONRY',substage:'Electrical provisions and handover'},
 {kind:'check',name:'Confirm electrical outlet, box and conduit positions against approved electrical drawings',area:'MASONRY',substage:'Electrical provisions and handover'},
 {kind:'work',name:'Install masonry-stage electrical wall boxes, sleeves and conduit provisions before plaster',area:'MASONRY',substage:'Electrical provisions and handover'},
 {kind:'check',name:'Check electrical provisions, box levels, routes, safe chases and completeness',area:'MASONRY',substage:'Electrical provisions and handover'},
 {kind:'check',name:'Verify no unauthorized cutting of structural columns, beams or reinforcement',area:'MASONRY',substage:'Electrical provisions and handover'},
 {kind:'work',name:'Record photos of concealed electrical provisions and completed brickwork',area:'MASONRY',substage:'Electrical provisions and handover'},
 {kind:'check',name:'Final floor wall alignment, openings and rough-in provisions inspection',area:'MASONRY',substage:'Electrical provisions and handover'},
];

export function defaultCompanyWorkRows(
 payments:readonly {name:string;percent:string;stageCodes:string[]}[],
):CompanyConstructionPaymentRow[] {
 const result:CompanyConstructionPaymentRow[]=payments.map((payment,index)=>{
  const areas=[...new Set(payment.stageCodes.map(family))];
  // Only the standard Planning stage receives this sequence. Company-owned
  // customized payment templates and all other milestone defaults are retained.
  if(index===0&&payment.name==='Planning'&&
    areas.includes('PRECONSTRUCTION')&&areas.includes('DESIGN')){
   return {name:payment.name,percent:Number(payment.percent),areas,
    steps:planningWorkDefaults.map(step=>({...step}))};
  }
  // Fixed reference for the Foundation payment, not a new/parallel workflow.
  // Project-specific changes still belong to the quotation's own snapshot.
  if(index===1&&areas.includes('SITE_PREP')&&
    areas.includes('FOUNDATION')&&areas.includes('PLINTH')){
   return {name:payment.name,percent:Number(payment.percent),areas,
    steps:foundationWorkDefaults.map(step=>({...step}))};
  }
  // Generate the same editable RCC work, inspection and material scope for
  // every floor supplied by its real quotation, not a hardcoded G+4 count.
  if(areas.length===1&&areas[0]==='RCC'&&
    payment.stageCodes.length===1&&payment.stageCodes[0]?.startsWith('RCC/')){
   return {name:payment.name,percent:Number(payment.percent),areas,
    steps:rccSlabWorkDefaults.map(step=>({...step}))};
  }
  // Preserve the existing one- or two-floor brickwork payment; never create
  // a second duplicate payment just because two floors share this milestone.
  if(areas.length===1&&areas[0]==='MASONRY'&&
    payment.stageCodes.length>0&&payment.stageCodes.every(code=>code.startsWith('MASONRY/'))){
   return {name:payment.name,percent:Number(payment.percent),areas,
    steps:masonryWorkDefaults.map(step=>({...step}))};
  }
  const steps:CompanyWorkStep[]=[];
  for(const area of areas){
   const base=defaultStageRequirements(area);
   for(const name of base.work)steps.push({kind:'work',name,area});
   for(const name of base.materials.slice(0,2))steps.push({kind:'material',name,area});
   for(const name of base.checks.slice(0,2))steps.push({kind:'check',name,area});
  }
  return {name:payment.name,percent:Number(payment.percent),areas,steps};
 });
 return result;
}

/** Adds default editable steps to legacy name+percentage-only Settings rows.
 * Never replaces the owner's existing names, percentages, or custom steps.
 */
export function hydrateCompanyWorkDefaults(
 saved:readonly CompanyConstructionPaymentRow[],
 standard:readonly CompanyConstructionPaymentRow[],
):CompanyConstructionPaymentRow[] {
 return saved.map((row,index)=>{
  if(row.steps!==undefined)return {...row,areaLabels:{...(row.areaLabels??{})},steps:[...row.steps]};
  const example=saved.length===standard.length?standard[index]:undefined;
  return {...row,areaLabels:{...(row.areaLabels??{})},areas:[...(row.areas??example?.areas??[])],
   steps:[...(example?.steps??[])]};
 });
}
