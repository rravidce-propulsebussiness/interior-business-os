import 'server-only';
import { notFound } from 'next/navigation';
import { canAccess } from '@business-os/auth';
import { commercialServices } from '../commercial/service';
import { activeOrganization,pageServices } from '@business-os/auth/server';
import { workCompletionByProject } from './work-progress';
import { createMarketplaceRepository, type MarketplaceProduct } from '@business-os/database/marketplace';
import type { ProjectEntry } from './project-v2-types';
import { savedStagePaymentPlan,savedStagePaymentLinks } from '@business-os/core/quotation-payment-plan';
import { savedMilestoneFlow,projectStageFlowFromMilestones } from '@business-os/core/quotation-milestone-flow';
import { savedStageRequirements,defaultStageRequirements } from '@business-os/core/quotation-stage-requirements';
import { stageFlowStepSchema,type StageFlowStep } from '@business-os/core/quotation-stage-requirements';
export type { ProjectEntry } from './project-v2-types';

export type SiteRow = Record<string,unknown> & {id:string};
export type Stage = {id:string;title:string;status:string;phase:string;floor_code:string|null;
 explanation:string;activities:string[];task_count:number;
 instance_code:string;template_code:string;dependencies:string[];inspectionTopics:string[]};
export type StageLink = {stage_id:string;kind:string;record_id:string};
export type StageItemPlan={
 stageId:string;kind:'work'|'check'|'test'|'qc'|'material';index:number;title:string;
 plannedStart:string;plannedFinish:string;note:string;version:number;
};
function parseStageItemPlans(value:unknown):StageItemPlan[]{
 return Array.isArray(value)?value.flatMap(raw=>{
  const v=obj(raw);
  if(typeof v.stage_id!=='string'||typeof v.kind!=='string'||
    !['work','check','test','qc','material'].includes(v.kind)||
    typeof v.index!=='number')return [];
  return [{stageId:v.stage_id,kind:v.kind as StageItemPlan['kind'],index:v.index,
   title:stringValue(v.title),plannedStart:stringValue(v.planned_start),
   plannedFinish:stringValue(v.planned_finish),note:stringValue(v.note),
   version:Number(v.version)||0}];
 }):[];
}
export type StageGuidance={stageId:string;materials:string[];reports:string[];flow:StageFlowStep[]};
function stageGuidanceRows(raw:unknown):StageGuidance[]{
 if(!Array.isArray(raw))return [];
 return raw.map(row=>{
  const x=obj(row);const strings=(value:unknown)=>Array.isArray(value)?
   value.map(stringValue).filter(Boolean):[];
  return {stageId:stringValue(x.stage_id),materials:strings(x.materials),reports:strings(x.reports),
   flow:Array.isArray(x.flow)?x.flow.flatMap(item=>{
    const parsed=stageFlowStepSchema.safeParse(item);
    return parsed.success?[parsed.data]:[];
   }):[]};
 }).filter(row=>row.stageId);
}
export type StageExecution={stageId:string;status:string;blockers:string[];startedAt:string|null;fieldFinishedAt:string|null};
function executionRows(input:unknown):StageExecution[]{
 if(!Array.isArray(input))return [];
 return input.map(row=>{
  const v=obj(row);return {stageId:stringValue(v.stage_id),status:stringValue(v.status)||'not_started',
    blockers:Array.isArray(v.blockers)?v.blockers.map(stringValue).filter(Boolean):[],
    startedAt:stringValue(v.started_at)||null,
    fieldFinishedAt:stringValue(v.field_finished_at)||null};
 }).filter(x=>x.stageId);
}
export type StageItemRecord=Record<string,unknown>;
export type StageQcItem = {
 id:string;stage_id:string;index:number;title:string;decision:string;
 notes:string;photo_id:string;reviewed_by:string;reviewed_at:string;self_review:boolean;
};
export type StageQcReview={canReview:boolean;isOwner:boolean;inspectorAssigned:boolean;records:StageQcItem[]};
function stageQcReview(value:unknown):StageQcReview {
 const input=obj(value);
 const data=Array.isArray(input.reviews)?input.reviews:[];
 return {canReview:input.can_review===true,isOwner:input.is_owner===true,inspectorAssigned:input.has_inspector===true,
  records:data.map(raw=>{
   const x=obj(raw);
   return {id:stringValue(x.id),stage_id:stringValue(x.stage_id),
    index:Number(x.index)||0,title:stringValue(x.title),decision:stringValue(x.decision),
    notes:stringValue(x.notes),photo_id:stringValue(x.photo_id),
    reviewed_by:stringValue(x.reviewed_by),reviewed_at:stringValue(x.reviewed_at),self_review:x.self_review===true};
  }).filter(x=>x.id&&x.stage_id)};
}

export type StageProgress={work:StageItemRecord[];checks:StageItemRecord[];qualityStages:StageItemRecord[]};
export type MaterialAccess={canOrder:boolean;canApprove:boolean;grants:{userId:string;canOrder:boolean}[]};
function materialAccess(data:unknown):MaterialAccess{
 const r=obj(data);
 return {canOrder:r.can_order===true,canApprove:r.can_approve===true,
  grants:Array.isArray(r.grants)?r.grants.map(row=>{
   const a=obj(row);return {userId:stringValue(a.user_id),canOrder:a.can_order===true};
  }).filter(row=>row.userId):[]};
}
function mergeMaterialLogistics(materials:SiteRow[],value:unknown):SiteRow[]{
 const r=obj(value);
 const rowsById=new Map((Array.isArray(r.delivery)?r.delivery:[])
  .map(v=>obj(v)).filter(v=>typeof v.id==='string').map(v=>[String(v.id),v]));
 return materials.map(item=>({...item,...(rowsById.get(item.id)??{})}));
}
export type StageMarketplaceProduct=Pick<MarketplaceProduct,'id'|'name'|'unit'|'minQuantity'|'price'|'currency'|'seller'|'sku'>;
export type PaymentMilestone={id:string;label:string;amount:string;currency:string;contract_number:string;
 contract_id:string};
export type ProjectQuotation={id:string;number:string;revisionId:string;status:string;createdAt:string};
export type ClientRequestRow={
 id:string;kind:string;details:string;status:string;
 requested_date:string|null;response:string;created_at:string;responded_at:string|null;
};
export type WorkspaceData = {
 project:ProjectEntry;org:string;company:string;email:string;
 permissions:{manage:boolean;finance:boolean;contractManage:boolean;payments:boolean;purchases:boolean;purchaseManage:boolean;team:boolean;quotation:boolean};
 marketplaceOffers:StageMarketplaceProduct[];materialAccess:MaterialAccess;
 site:null|{stage:string;role:string;canManage:boolean;reports:SiteRow[];materials:SiteRow[];
 checks:SiteRow[];media:SiteRow[];designs:SiteRow[];team:SiteRow[];gate:SiteRow[];
 memberOptions:{id:string;label:string}[]};
 stages:Stage[];links:StageLink[];itemPlans:StageItemPlan[];stageGuidance:StageGuidance[];stageExecution:StageExecution[];stageProgress:StageProgress;stageQc:StageQcReview;milestones:PaymentMilestone[];quotations:ProjectQuotation[];
 quotePaymentTriggers:{name:string;percent:number;stageCodes:string[]}[];
 transactions: {id:string;number:string;date:string;amount:number;status:string}[]|null;
 stageRequests?: {id:string;number:string;amount:number;status:string;date:string}[];
 purchaseOrders:{id:string;number:string;status:string;date:string}[]|null;
 tasks:{id:string;title:string;planned_start:string|null;status:string}[];
 contractValue:number|null;expenditure:number|null;requests:ClientRequestRow[]|null;
 projectRaw:Record<string,unknown>|null;
 agreement:{contractId:string;contractNumber:string;status:string;authorized:boolean;revisionId:string|null;clearanceType:string|null;version:number|null}|null;
 preflight:{inspectionDone:boolean;measurementsDone:boolean;inspectionDetails:string;measurementDetails:string;signedReady:boolean}|null;
 advance:{invoiceId:string|null;invoiceNumber:string|null;invoiceStatus:string|null;invoiceTotal:number;percent:number|null;received:number;scheduleActive:boolean}|null;
};
export function stringValue(v:unknown):string{return typeof v==='string'||typeof v==='number'?String(v):'';}
export function formatMoney(value:number|null){return value===null?'—':new Intl.NumberFormat('en-IN',{
 style:'currency',currency:'INR',maximumFractionDigits:0,
}).format(value);}
export function shortDate(value:unknown){const text=stringValue(value);if(!text)return 'Not scheduled';
 const time=new Date(text);return Number.isNaN(time.getTime())?'Not scheduled':new Intl.DateTimeFormat('en-IN',{
 day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kolkata',
 }).format(time);
}
export function pretty(value:unknown){return stringValue(value).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}
export function projectAddress(value:unknown) {
 if(typeof value!=='object'||!value||Array.isArray(value))return 'Location not recorded';
 const row=value as Record<string,unknown>;
 return [row.city,row.region].map(stringValue).filter(Boolean).join(', ')||
 stringValue(row.line1)||'Location not recorded';
}
function rows(value:unknown):SiteRow[]{
 return Array.isArray(value)?value.filter((row):row is SiteRow=>Boolean(row)&&typeof row==='object'
  &&typeof (row as SiteRow).id==='string'):[];
}
function stageProgress(value:unknown):StageProgress{
 const r=obj(value);
 const list=(v:unknown):StageItemRecord[]=>Array.isArray(v)?
  v.filter((x):x is StageItemRecord=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x)):[];
 return {work:list(r.work),checks:list(r.checks),qualityStages:list(r.qualityStages)};
}
function obj(value:unknown):Record<string,unknown>{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function decimals(value:unknown):number|null{
 const n=Number(value);return value===null||value===undefined||value===''||!Number.isFinite(n)?null:n;
}
export async function projectIndex(){
 const s=await commercialServices('project.view','projects',true).catch(()=>null);
 if(!s)return assignedProjectIndex();
 const [org,user,projectResult,industryResult]=await Promise.all([
  s.repository.organization(s.org),s.authorization.requireAuthenticatedUser(),
  s.client.from('projects').select('id,name,code,status,project_type,site_address,created_at,customer_id,industry_id')
   .eq('organization_id',s.org).eq('is_sales_prospect',false).eq('removed_from_workspace',false)
   .order('created_at',{ascending:false}).limit(250),
  s.repository.industries(),
 ]);
 if(!org||projectResult.error)throw new Error('Projects are unavailable.');
 const projects=projectResult.data??[];
 const ids=projects.map(p=>p.id);
 const customerIds=[...new Set(projects.map(p=>p.customer_id).filter((id):id is string=>Boolean(id)))];
 const [customerResult,taskResult]=await Promise.all([
  customerIds.length?s.client.from('customers').select('id,display_name').eq('organization_id',s.org)
   .in('id',customerIds).limit(250):Promise.resolve({data:[],error:null}),
  ids.length?s.client.from('project_tasks')
   .select('project_id,status,completion_percentage,weight').eq('organization_id',s.org)
   .in('project_id',ids).limit(2500):Promise.resolve({data:[],error:null}),
 ]);
 const names=new Map((customerResult.data??[]).map(p=>[p.id,p.display_name]));
 const industries=new Map(industryResult.map(p=>[p.id,p.name]));
 const progress=workCompletionByProject(ids,taskResult.error||((taskResult.data??[]).length>=2500)
  ?null:taskResult.data??[]);
 const list:ProjectEntry[]=projects.map(p=>({
  id:p.id,name:p.name,code:p.code??'',status:p.status??'active',
  projectType:p.project_type??'',address:projectAddress(p.site_address),
  createdAt:p.created_at,customerId:p.customer_id,
  client:p.customer_id?names.get(p.customer_id)??'Linked client':'No client',
  industry:(p.industry_id?industries.get(p.industry_id):null)??'Project',
  progress:progress.get(p.id)??null,
 }));
 return {s,list,org, user};
}
export async function projectWorkspace(id:string):Promise<WorkspaceData>{
 const s=await commercialServices('project.view','projects',true).catch(()=>null);
 if(!s)return assignedProjectWorkspace(id);
 const {data:project,error}=await s.client.from('projects')
 .select('*')
 .eq('organization_id',s.org).eq('id',id)
 .eq('is_sales_prospect',false).eq('removed_from_workspace',false).maybeSingle();
 if(error||!project)notFound();
 const has=(permission:string,moduleKey?:string)=>canAccess(s.context,{
  organizationId:s.org,permission,...(moduleKey?{moduleKey}:{})
 });
 const permissions={
  manage:has('project.manage','projects'),finance:has('contract.view','billing'),
   contractManage:has('contract.manage','billing'),
  payments:has('payment.view'),purchases:has('purchase.view'),purchaseManage:has('purchase.manage'),
  team:has('team.manage')||has('team.view'),quotation:has('quotation.view','quotation'),
 };
 const [org,user,industries,customer,taskResult,siteResult,stageResult,stageLinkResult,stageGuidanceResult,stageProgressResult,qcItemResult,qualityResult,stageExecutionResult,materialAccessResult,receipts,orders,contract,agreementResult,preflightResult,advanceResult,scheduleResult]=await Promise.all([
  s.repository.organization(s.org),s.authorization.requireAuthenticatedUser(),
  s.repository.industries(),
  project.customer_id?s.client.from('customers').select('id,display_name').eq('organization_id',s.org)
    .eq('id',project.customer_id).maybeSingle():Promise.resolve({data:null,error:null}),
  s.client.from('project_tasks').select('id,project_id,title,status,planned_start,completion_percentage,weight')
    .eq('organization_id',s.org).eq('project_id',id).limit(1200),
  s.client.rpc('project_site_read',{p_organization_id:s.org,p_project_id:id}),
  s.client.rpc('construction_project_read',{p_organization_id:s.org,p_project_id:id}),
  s.client.rpc('construction_stage_record_read',{p_organization_id:s.org,p_project_id:id}),
  s.client.rpc('project_stage_guidance_read' as never,{p_org:s.org,p_project:id} as never),
  s.client.rpc('project_stage_checklist_read' as never,{p_org:s.org,p_project:id} as never),
  s.client.rpc('construction_stage_qc_item_read' as never,{p_org:s.org,p_project:id} as never),
  s.client.rpc('construction_quality_read',{p_org:s.org,p_project:id}),
  s.client.rpc('construction_stage_execution_read' as never,{p_org:s.org,p_project:id} as never),
  s.client.rpc('project_material_access_read' as never,{p_org:s.org,p_project:id} as never),
  permissions.payments?s.client.from('payments').select('id,payment_number,payment_date,amount,status')
    .eq('organization_id',s.org).eq('project_id',id).order('payment_date',{ascending:false})
    .limit(250):Promise.resolve({data:null,error:null}),
  permissions.purchases?s.client.from('purchase_orders').select('id,po_number,status,order_date')
    .eq('organization_id',s.org).eq('project_id',id).order('order_date',{ascending:false})
    .limit(200):Promise.resolve({data:null,error:null}),
  permissions.finance?s.client.from('contracts').select('id,contract_number,original_contract_value,status,revision_id,version')
    .eq('organization_id',s.org).eq('project_id',id).order('created_at',{ascending:false})
    .limit(1):Promise.resolve({data:null,error:null}),
  permissions.manage&&permissions.finance?s.client.rpc('project_agreement_read',{
    p_organization_id:s.org,p_project_id:id,
  }):Promise.resolve({data:null,error:null}),
  s.client.rpc('project_preflight_read',{p_org:s.org,p_project:id}),
  permissions.finance?s.client.rpc('project_advance_read',{p_org:s.org,p_project:id}):
    Promise.resolve({data:null,error:null}),
  s.client.rpc('project_stage_item_schedule_read' as never,{p_org:s.org,p_project:id} as never),
 ]);
 if(!org)notFound();
 const rawSite=siteResult.error?null:obj(siteResult.data);
 const rawStages=stageResult.error?{}:obj(stageResult.data);
 const rawLinks=stageLinkResult.error?{}:obj(stageLinkResult.data);
 const site=rawSite?{
  stage:stringValue(rawSite.stage)||'not_started',role:stringValue(rawSite.role),
  canManage:rawSite.can_manage===true,
  reports:rows(rawSite.reports),materials:mergeMaterialLogistics(rows(rawSite.materials),materialAccessResult.data),checks:rows(rawSite.checks),
  media:rows(rawSite.media),designs:rows(rawSite.designs),team:rows(rawSite.team),
  gate:rows(rawSite.gate),
  memberOptions:Array.isArray(rawSite.member_options)?rawSite.member_options.filter((v):v is {id:string;label:string}=>{
   const o=obj(v);return typeof o.id==='string'&&typeof o.label==='string';
  }):[],
 }:null;
 const tasks=taskResult.data??[];
 const progress=workCompletionByProject([id],taskResult.error||tasks.length>=1200?null:tasks).get(id)??null;
 const industriesById=new Map(industries.map(x=>[x.id,x.name]));
 const stageList:Array<Stage>=Array.isArray(rawStages.stages)?rawStages.stages.map(x=>{
  const a=obj(x);
  return {id:stringValue(a.id),title:stringValue(a.title),status:stringValue(a.status),phase:stringValue(a.phase),
   floor_code:stringValue(a.floor_code)||null,explanation:stringValue(a.explanation),
    instance_code:stringValue(a.instance_code),template_code:stringValue(a.template_code),
    dependencies:Array.isArray(a.dependencies)?a.dependencies.map(stringValue).filter(Boolean):[],
    inspectionTopics:Array.isArray(a.inspection_topics)?a.inspection_topics.map(stringValue).filter(Boolean):[],
   activities:Array.isArray(a.activities)?a.activities.map(stringValue).filter(Boolean):[],
   task_count:Number(a.task_count)||0};
 }):[];
 const linkList:Array<StageLink>=Array.isArray(rawLinks.links)?rawLinks.links.map(x=>{
  const a=obj(x);return {stage_id:stringValue(a.stage_id),kind:stringValue(a.kind),record_id:stringValue(a.record_id)};
 }):[];
 const milestones:Array<PaymentMilestone>=permissions.finance&&Array.isArray(rawLinks.options)?rawLinks.options.map(x=>{
  const a=obj(x);return {id:stringValue(a.id),label:stringValue(a.label),amount:stringValue(a.amount),
   currency:stringValue(a.currency),contract_number:stringValue(a.contract_number),
   contract_id:stringValue(a.contract_id)};
 }):[];
 const marketplaceOffers:StageMarketplaceProduct[]=permissions.purchaseManage?
   await createMarketplaceRepository(s.client).catalog(s.org).then(products=>
     products.filter(x=>x.currency===org.default_currency).slice(0,100)
       .map(({id,name,unit,minQuantity,price,currency,seller,sku})=>
       ({id,name,unit,minQuantity,price,currency,seller,sku}))
   ).catch(()=>[]):[];
 const trans=permissions.payments&&!receipts.error&&receipts.data?receipts.data.map(x=>({
  id:x.id,number:x.payment_number,date:x.payment_date,amount:Number(x.amount)||0,status:x.status
 })):null;
 const po=permissions.purchases&&!orders.error&&orders.data?orders.data.map(x=>({
  id:x.id,number:x.po_number,date:x.order_date,status:x.status
 })):null;
 const contractValue=permissions.finance&&!contract.error?decimals(contract.data?.[0]?.original_contract_value):null;
 const agreement=agreementResult.error?{}:obj(agreementResult.data);
 const preflightRaw=preflightResult.error?{}:obj(preflightResult.data);
 const advanceRaw=advanceResult.error?{}:obj(advanceResult.data);
 const preflight=preflightResult.error?null:{
  inspectionDone:preflightRaw.inspection_done===true,
  measurementsDone:preflightRaw.measurements_done===true,
  inspectionDetails:stringValue(preflightRaw.inspection_details),
  measurementDetails:stringValue(preflightRaw.measurement_details),
  signedReady:preflightRaw.signed_ready===true,
 };
 const advance=advanceResult.error?null:{
  invoiceId:typeof advanceRaw.invoice_id==='string'?advanceRaw.invoice_id:null,
  invoiceNumber:typeof advanceRaw.invoice_number==='string'?advanceRaw.invoice_number:null,
  invoiceStatus:typeof advanceRaw.invoice_status==='string'?advanceRaw.invoice_status:null,
  invoiceTotal:Number(advanceRaw.invoice_total)||0,
  percent:typeof advanceRaw.advance_percent==='number'?advanceRaw.advance_percent:null,
  received:Number(advanceRaw.received)||0,
  scheduleActive:advanceRaw.schedule_active===true,
 };
 // An issued quote remains attached to its original sales-prospect project.
 // The converted Won lead supplies the secure, non-destructive association.
 const directQuotes=permissions.quotation?await s.client.from('quotations')
   .select('id,quotation_number,current_revision_id,status,created_at,project_id,customer_id')
   .eq('organization_id',s.org).eq('project_id',id).neq('status','cancelled')
   .order('created_at',{ascending:false}).limit(25):null;
 let leadQuoteIds:string[]=[];
 if(permissions.quotation&&has('lead.view')){
   const leadRows=await s.client.from('leads').select('id')
     .eq('organization_id',s.org).eq('converted_project_id',id).limit(4);
   if(!leadRows.error&&leadRows.data?.length===1){
     const linked=await s.client.rpc('lead_quotation_list',{
       p_organization_id:s.org,p_lead_id:leadRows.data[0]!.id,
     });
     if(!linked.error&&Array.isArray(linked.data)){
       leadQuoteIds=[...new Set(linked.data.map((row:unknown)=>stringValue(obj(row).quotation_id))
         .filter(Boolean))].slice(0,100);
     }
   }
 }
 const historical=leadQuoteIds.length?await s.client.from('quotations')
   .select('id,quotation_number,current_revision_id,status,created_at,project_id,customer_id')
   .eq('organization_id',s.org).eq('customer_id',project.customer_id)
   .in('id',leadQuoteIds).neq('status','cancelled').limit(100):null;
 type QuoteRoot={id:string;quotation_number:string|null;current_revision_id:string|null;
   status:string;created_at:string;project_id:string;customer_id:string};
 const byQuote=new Map<string,QuoteRoot>();
 for(const q of [...(directQuotes?.error?[]:directQuotes?.data??[]),
   ...(historical?.error?[]:historical?.data??[])]){
   if(q.customer_id===project.customer_id)byQuote.set(q.id,q);
 }
 const quoteRoots=[...byQuote.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at));
 const revisionIds=[...new Set(quoteRoots.map(q=>q.current_revision_id)
   .filter((v):v is string=>typeof v==='string'))];
 const quoteRevisions=revisionIds.length?await s.client.from('quotation_revisions')
   .select('id,status').eq('organization_id',s.org).in('id',revisionIds):null;
 const revisionsById=new Map((quoteRevisions?.error?[]:quoteRevisions?.data??[])
   .map(r=>[r.id,r.status]));
 // Reuse the same customer-level Final choice as the Quotations workspace.
 // A lead may have quote alternatives stored under retired prospect project IDs;
 // display only a Final quote that belongs to this verified project/lead set.
 const choice=permissions.quotation&&quoteRoots.length
   ?await s.client.rpc('quotation_final_choices',{
      p_org:s.org,p_customer_ids:[project.customer_id],
    }):null;
 const choiceObject=choice&&!choice.error?obj(choice.data):{};
 const finalQuoteId=typeof choiceObject[project.customer_id]==='string'
   ?choiceObject[project.customer_id] as string:null;
 // The recorded signed agreement binds the project to its quoted scope.
 // A newer unsent or alternative quote cannot reopen completed project work.
 const contractedRevision=permissions.finance&&!contract.error?contract.data?.[0]?.revision_id:null;
 const signedContractSource=agreement.clearance_type==='signed_copy_recorded'
   &&agreement.current_scope===true&&typeof contractedRevision==='string';
 // A signed contract freezes one specific quotation revision. Even after
 // another quotation becomes Final or the same quote gets a new revision,
 // the project document must not silently replace the legally agreed version.
 const signedRevision=signedContractSource&&contractedRevision
   ?await s.client.from('quotation_revisions')
    .select('id,quotation_id,status').eq('organization_id',s.org)
    .eq('id',contractedRevision).maybeSingle():null;
 const signedQuoteId=!signedRevision?.error?signedRevision?.data?.quotation_id:null;
 const signedRoot=quoteRoots.find(q=>q.id===signedQuoteId);
 const contractedQuote=(signedContractSource&&signedRoot&&contractedRevision&&signedRevision?.data)
   ?{id:signedRoot.id,number:signedRoot.quotation_number??'Quotation',
      revisionId:contractedRevision,status:signedRevision.data.status,
      createdAt:signedRoot.created_at}:null;
 const finalRoot=quoteRoots.find(q=>q.id===finalQuoteId
     &&q.current_revision_id&&revisionsById.has(q.current_revision_id))
   ??quoteRoots.find(q=>q.current_revision_id&&revisionsById.has(q.current_revision_id));
 const currentQuote=finalRoot&&finalRoot.current_revision_id
   ?{id:finalRoot.id,number:finalRoot.quotation_number??'Quotation',
      revisionId:finalRoot.current_revision_id,
      status:revisionsById.get(finalRoot.current_revision_id)??'',
      createdAt:finalRoot.created_at}:null;
 const quotations:ProjectQuotation[]=contractedQuote?[contractedQuote]:
   // If signed scope is not resolvable, do not substitute a new Final quote.
   signedContractSource?[]:currentQuote?[currentQuote]:[];
 // Read only a saved planning proposal before the agreement exists.
 // This never activates milestones or invents payment receipts.
 const paymentRevision=contractedRevision??quotations[0]?.revisionId??null;
 const quoteResult=paymentRevision
  ?await s.client.from('quotation_revisions').select('terms').eq('organization_id',s.org)
    .eq('id',paymentRevision).maybeSingle():null;
 const savedTerms=quoteResult&&!quoteResult.error?quoteResult.data?.terms:null;
 const proposal=typeof savedTerms==='string'?savedStagePaymentPlan(savedTerms):null;
 const bindings=typeof savedTerms==='string'?savedStagePaymentLinks(savedTerms):null;
 const requestResult=permissions.manage
  ?await s.client.rpc('project_client_request_list',{p_project_id:id}):null;
 const requests:ClientRequestRow[]|null=requestResult&&Array.isArray(requestResult.data)&&!requestResult.error
  ?requestResult.data.map((raw:unknown)=>{
    const x=obj(raw);return {
      id:stringValue(x.id),kind:stringValue(x.kind),details:stringValue(x.details),
      status:stringValue(x.status),requested_date:stringValue(x.requested_date)||null,
      response:stringValue(x.response),created_at:stringValue(x.created_at),
      responded_at:stringValue(x.responded_at)||null,
    };
   }):null;
 const contractId=contract.data?.[0]?.id;
 const reqs=contractId&&has('payment_request.view')
  ?await s.client.from('payment_requests')
   .select('id,request_number,amount,status,issued_at')
   .eq('organization_id',s.org).eq('contract_id',contractId)
   .order('issued_at',{ascending:false}).limit(120):null;
 const stageRequests=reqs&&!reqs.error?reqs.data?.map(r=>({
  id:r.id,number:r.request_number,amount:Number(r.amount),
  status:r.status,date:r.issued_at,
 }))??[]:[];
 // The frozen signed quotation remains the execution source. If its ordered
 // steps are not repeated in stage-guidance metadata, project them onto the
 // existing canonical stage records without creating a duplicate checklist.
 const importedGuidance=stageGuidanceRows(stageGuidanceResult.data);
 const frozenMilestones=contractedRevision&&typeof savedTerms==='string'
  ?savedMilestoneFlow(savedTerms):{};
 const frozenStageRequirements=contractedRevision&&typeof savedTerms==='string'
  ?savedStageRequirements(savedTerms):{};
 const stageGuidance=stageList.map(stage=>{
  const imported=importedGuidance.find(row=>row.stageId===stage.id);
  if(imported?.flow.length)return imported;
  const ordered=projectStageFlowFromMilestones(stage.instance_code,frozenStageRequirements,frozenMilestones);
  if(!Object.values(frozenMilestones).some(list=>list.some(item=>item.code===stage.instance_code)))
   return imported??null;
  const base=frozenStageRequirements[stage.instance_code]??defaultStageRequirements(stage.instance_code);
  return {stageId:stage.id,materials:imported?.materials??base.materials,
   reports:imported?.reports??base.reports,flow:ordered};
 }).filter((item):item is StageGuidance=>item!==null);
  const quotePaymentTriggers=(proposal??[]).map((row,index)=>({
  name:row.name,percent:row.percent,stageCodes:bindings?.[index]??[],
 }));
 return {
  org:s.org,company:org.name,email:user.email??'',permissions,
  project:{
   id:project.id,name:project.name,code:project.code??'',status:project.status??'active',
   projectType:project.project_type??'',address:projectAddress(project.site_address),
   createdAt:project.created_at,customerId:project.customer_id,
   client:customer.data?.display_name??'Not linked',
   industry:(project.industry_id?industriesById.get(project.industry_id):null)??'Project',progress
  },
  site,stages:stageList,links:linkList,itemPlans:parseStageItemPlans(scheduleResult.error?null:scheduleResult.data),stageGuidance,stageExecution:executionRows(stageExecutionResult.data),marketplaceOffers,materialAccess:materialAccess(materialAccessResult.data),stageProgress:{...stageProgress(stageProgressResult.error?null:stageProgressResult.data),
    qualityStages:Array.isArray(obj(qualityResult.error?null:qualityResult.data).stages)?
     (obj(qualityResult.data).stages as StageItemRecord[]):[]},stageQc:stageQcReview(qcItemResult.error?null:qcItemResult.data),milestones,quotations,quotePaymentTriggers,stageRequests,
  preflight,advance,requests,
  transactions:trans,purchaseOrders:po,
  tasks:tasks.map(t=>({id:t.id,title:t.title,planned_start:t.planned_start,status:t.status})),
  contractValue,projectRaw:permissions.manage?project:null,
  agreement:typeof agreement.contract_id==='string'?{
   contractId:agreement.contract_id,contractNumber:stringValue(agreement.contract_number),
   status:stringValue(agreement.contract_status),authorized:agreement.execution_authorized===true,
   clearanceType:stringValue(agreement.clearance_type)||null,
   revisionId:contract.data?.find(c=>c.id===agreement.contract_id)?.revision_id??null,
   version:contract.data?.find(c=>c.id===agreement.contract_id)?.version??null,
  }:null,
  // There is no canonical all-in site cash-expense ledger yet.
  // A purchase order is only a commitment; labour entries cover just part of spend.
  expenditure:null,
 };
}

/**
 * Staff with an explicit site role are not automatically granted company-wide
 * project.view. Reuse the original database-scoped site permissions instead of
 * broadening project RLS or showing another duplicate "My Sites" module.
 */
async function assignedProjectIndex(){
 const {client,repository,authorization,user}=await pageServices();
 const context=await activeOrganization();
 if(!context||!context.entitlements.includes('projects'))notFound();
 await authorization.requireAuthenticatedUser();
 const result=await client.rpc('project_site_my_projects',{p_organization_id:context.organizationId});
 if(result.error)notFound();
 const list:ProjectEntry[]=Array.isArray(result.data)?result.data.map(raw=>{
  const p=obj(raw);return {
   id:stringValue(p.id),name:stringValue(p.name),code:stringValue(p.code),
   status:stringValue(p.stage)||'active',projectType:'',address:'Project site',
   createdAt:stringValue(p.created_at),customerId:null,client:'Project team',
   industry:prettyRole(stringValue(p.role)),progress:null,
  };
 }):[];
 const org=await repository.organization(context.organizationId);
 if(!org)notFound();
 return {s:{context,org:context.organizationId},list,org,user};
}
function prettyRole(role:string){return role?role.replaceAll('_',' ').replace(/\\b\\w/g,c=>c.toUpperCase()):'Assigned site';}
async function assignedProjectWorkspace(id:string):Promise<WorkspaceData>{
 const {client,repository,authorization,user}=await pageServices();
 const context=await activeOrganization();
 if(!context||!context.entitlements.includes('projects'))notFound();
 await authorization.requireAuthenticatedUser();
 // This RPC rejects callers without explicit access to this exact project.
 const read=await client.rpc('project_site_read',{
  p_organization_id:context.organizationId,p_project_id:id,
 });
 if(read.error||!read.data)notFound();
 const raw=obj(read.data),p=obj(raw.project);
 if(stringValue(p.id)!==id)notFound();
 const [org,stagesResult,tasksResult,stageProgressResult,qcItemResult,qualityResult,stageExecutionResult,materialAccessResult,stageLinkResult,stageGuidanceResult,scheduleResult]=await Promise.all([
  repository.organization(context.organizationId),
  client.rpc('construction_project_read',{p_organization_id:context.organizationId,p_project_id:id}),
  client.from('project_tasks').select('id,project_id,title,status,planned_start,completion_percentage,weight')
   .eq('organization_id',context.organizationId).eq('project_id',id).limit(1200),
  client.rpc('project_stage_checklist_read' as never,{p_org:context.organizationId,p_project:id} as never),
  client.rpc('construction_stage_qc_item_read' as never,{p_org:context.organizationId,p_project:id} as never),
  client.rpc('construction_quality_read',{p_org:context.organizationId,p_project:id}),
  client.rpc('construction_stage_execution_read' as never,{p_org:context.organizationId,p_project:id} as never),
  client.rpc('project_material_access_read' as never,{p_org:context.organizationId,p_project:id} as never),
  client.rpc('construction_stage_record_read',{p_organization_id:context.organizationId,p_project_id:id}),
  client.rpc('project_stage_guidance_read' as never,{p_org:context.organizationId,p_project:id} as never),
  client.rpc('project_stage_item_schedule_read' as never,{p_org:context.organizationId,p_project:id} as never),
 ]);
 if(!org)notFound();
 const stagesRaw=obj(stagesResult.error?null:stagesResult.data);
 const stages:Stage[]=Array.isArray(stagesRaw.stages)?stagesRaw.stages.map(x=>{
  const a=obj(x);return {id:stringValue(a.id),title:stringValue(a.title),
   status:stringValue(a.status),phase:stringValue(a.phase),floor_code:stringValue(a.floor_code)||null,
   instance_code:stringValue(a.instance_code),template_code:stringValue(a.template_code),
   dependencies:Array.isArray(a.dependencies)?a.dependencies.map(stringValue).filter(Boolean):[],
   inspectionTopics:Array.isArray(a.inspection_topics)?a.inspection_topics.map(stringValue).filter(Boolean):[],
   explanation:stringValue(a.explanation),
   activities:Array.isArray(a.activities)?a.activities.map(stringValue).filter(Boolean):[],
   task_count:Number(a.task_count)||0};
 }):[];
 const tasks=tasksResult.error?null:tasksResult.data??[];
 const canPurchase=canAccess(context,{organizationId:context.organizationId,permission:'purchase.manage'});
 const offers:StageMarketplaceProduct[]=canPurchase?
  await createMarketplaceRepository(client).catalog(context.organizationId).then(products=>
   products.slice(0,100).map(({id,name,unit,minQuantity,price,currency,seller,sku})=>
    ({id,name,unit,minQuantity,price,currency,seller,sku}))).catch(()=>[]):[];
 const site={
  stage:stringValue(raw.stage)||'not_started',role:stringValue(raw.role),
  canManage:raw.can_manage===true,
  reports:rows(raw.reports),materials:mergeMaterialLogistics(rows(raw.materials),materialAccessResult.data),checks:rows(raw.checks),
  media:rows(raw.media),designs:rows(raw.designs),team:rows(raw.team),
  gate:rows(raw.gate),
  memberOptions:Array.isArray(raw.member_options)?raw.member_options.filter((v):v is {id:string;label:string}=>{
   const t=obj(v);return typeof t.id==='string'&&typeof t.label==='string';
  }):[],
 };
 return {
  org:context.organizationId,company:org.name,email:user.email??'',
  permissions:{manage:site.canManage,finance:false,contractManage:false,payments:false,purchases:canPurchase,purchaseManage:canPurchase,team:site.canManage,quotation:false},
  project:{id,name:stringValue(p.name),code:stringValue(p.code),status:stringValue(p.status)||'active',
   projectType:'',address:'Project site',createdAt:'',client:'Project team',customerId:null,
   industry:'Site Delivery',
   progress:workCompletionByProject([id],tasks&&tasks.length<1200?tasks:null).get(id)??null},
  site,stages,links:Array.isArray(obj(stageLinkResult.data).links)?
   (obj(stageLinkResult.data).links as Record<string,unknown>[]).map(x=>({
    stage_id:stringValue(x.stage_id),kind:stringValue(x.kind),record_id:stringValue(x.record_id),
   })):[],itemPlans:parseStageItemPlans(scheduleResult.error?null:scheduleResult.data),stageGuidance:stageGuidanceRows(stageGuidanceResult.data),stageExecution:executionRows(stageExecutionResult.data),marketplaceOffers:offers,materialAccess:materialAccess(materialAccessResult.data),stageProgress:{...stageProgress(stageProgressResult.error?null:stageProgressResult.data),
    qualityStages:Array.isArray(obj(qualityResult.error?null:qualityResult.data).stages)?
     (obj(qualityResult.data).stages as StageItemRecord[]):[]},stageQc:stageQcReview(qcItemResult.error?null:qcItemResult.data),milestones:[],quotations:[],quotePaymentTriggers:[],transactions:null,purchaseOrders:null,tasks:(tasks??[]).map(t=>({
   id:t.id,title:t.title,planned_start:t.planned_start,status:t.status,
  })),
  contractValue:null,expenditure:null,requests:null,agreement:null,projectRaw:null,
  preflight:null,advance:null,
 };
}
