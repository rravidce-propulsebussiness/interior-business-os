import 'server-only';
import { notFound } from 'next/navigation';
import { canAccess } from '@business-os/auth';
import { commercialServices } from '../commercial/service';
import { activeOrganization,pageServices } from '@business-os/auth/server';
import { workCompletionByProject } from './work-progress';
import type { ProjectEntry } from './project-v2-types';
export type { ProjectEntry } from './project-v2-types';

export type SiteRow = Record<string,unknown> & {id:string};
export type Stage = {id:string;title:string;status:string;phase:string;floor_code:string|null;
 explanation:string;activities:string[];task_count:number};
export type StageLink = {stage_id:string;kind:string;record_id:string};
export type PaymentMilestone={id:string;label:string;amount:string;currency:string;contract_number:string;
 contract_id:string};
export type WorkspaceData = {
 project:ProjectEntry;org:string;company:string;email:string;
 permissions:{manage:boolean;finance:boolean;payments:boolean;purchases:boolean;team:boolean};
 site:null|{stage:string;role:string;canManage:boolean;reports:SiteRow[];materials:SiteRow[];
 checks:SiteRow[];media:SiteRow[];designs:SiteRow[];team:SiteRow[];gate:SiteRow[];
 memberOptions:{id:string;label:string}[]};
 stages:Stage[];links:StageLink[];milestones:PaymentMilestone[];
 transactions: {id:string;number:string;date:string;amount:number;status:string}[]|null;
 purchaseOrders:{id:string;number:string;status:string;date:string}[]|null;
 tasks:{id:string;title:string;planned_start:string|null;status:string}[];
 contractValue:number|null;expenditure:number|null;
 projectRaw:Record<string,unknown>|null;
 agreement:{contractId:string;contractNumber:string;status:string;authorized:boolean}|null;
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
  payments:has('payment.view'),purchases:has('purchase.view'),
  team:has('team.manage')||has('team.view'),
 };
 const [org,user,industries,customer,taskResult,siteResult,stageResult,stageLinkResult,receipts,orders,contract,agreementResult]=await Promise.all([
  s.repository.organization(s.org),s.authorization.requireAuthenticatedUser(),
  s.repository.industries(),
  project.customer_id?s.client.from('customers').select('id,display_name').eq('organization_id',s.org)
    .eq('id',project.customer_id).maybeSingle():Promise.resolve({data:null,error:null}),
  s.client.from('project_tasks').select('id,project_id,title,status,planned_start,completion_percentage,weight')
    .eq('organization_id',s.org).eq('project_id',id).limit(1200),
  s.client.rpc('project_site_read',{p_organization_id:s.org,p_project_id:id}),
  s.client.rpc('construction_project_read',{p_organization_id:s.org,p_project_id:id}),
  s.client.rpc('construction_stage_record_read',{p_organization_id:s.org,p_project_id:id}),
  permissions.payments?s.client.from('payments').select('id,payment_number,payment_date,amount,status')
    .eq('organization_id',s.org).eq('project_id',id).order('payment_date',{ascending:false})
    .limit(250):Promise.resolve({data:null,error:null}),
  permissions.purchases?s.client.from('purchase_orders').select('id,po_number,status,order_date')
    .eq('organization_id',s.org).eq('project_id',id).order('order_date',{ascending:false})
    .limit(200):Promise.resolve({data:null,error:null}),
  permissions.finance?s.client.from('contracts').select('original_contract_value,status')
    .eq('organization_id',s.org).eq('project_id',id).order('created_at',{ascending:false})
    .limit(1):Promise.resolve({data:null,error:null}),
  permissions.manage&&permissions.finance?s.client.rpc('project_agreement_read',{
    p_organization_id:s.org,p_project_id:id,
  }):Promise.resolve({data:null,error:null}),
 ]);
 if(!org)notFound();
 const rawSite=siteResult.error?null:obj(siteResult.data);
 const rawStages=stageResult.error?{}:obj(stageResult.data);
 const rawLinks=stageLinkResult.error?{}:obj(stageLinkResult.data);
 const site=rawSite?{
  stage:stringValue(rawSite.stage)||'not_started',role:stringValue(rawSite.role),
  canManage:rawSite.can_manage===true,
  reports:rows(rawSite.reports),materials:rows(rawSite.materials),checks:rows(rawSite.checks),
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
 const trans=permissions.payments&&!receipts.error&&receipts.data?receipts.data.map(x=>({
  id:x.id,number:x.payment_number,date:x.payment_date,amount:Number(x.amount)||0,status:x.status
 })):null;
 const po=permissions.purchases&&!orders.error&&orders.data?orders.data.map(x=>({
  id:x.id,number:x.po_number,date:x.order_date,status:x.status
 })):null;
 const contractValue=permissions.finance&&!contract.error?decimals(contract.data?.[0]?.original_contract_value):null;
 const agreement=agreementResult.error?{}:obj(agreementResult.data);
 return {
  org:s.org,company:org.name,email:user.email??'',permissions,
  project:{
   id:project.id,name:project.name,code:project.code??'',status:project.status??'active',
   projectType:project.project_type??'',address:projectAddress(project.site_address),
   createdAt:project.created_at,customerId:project.customer_id,
   client:customer.data?.display_name??'Not linked',
   industry:(project.industry_id?industriesById.get(project.industry_id):null)??'Project',progress
  },
  site,stages:stageList,links:linkList,milestones,
  transactions:trans,purchaseOrders:po,
  tasks:tasks.map(t=>({id:t.id,title:t.title,planned_start:t.planned_start,status:t.status})),
  contractValue,projectRaw:permissions.manage?project:null,
  agreement:typeof agreement.contract_id==='string'?{
   contractId:agreement.contract_id,contractNumber:stringValue(agreement.contract_number),
   status:stringValue(agreement.contract_status),authorized:agreement.execution_authorized===true,
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
 const [org,stagesResult,tasksResult]=await Promise.all([
  repository.organization(context.organizationId),
  client.rpc('construction_project_read',{p_organization_id:context.organizationId,p_project_id:id}),
  client.from('project_tasks').select('id,project_id,title,status,planned_start,completion_percentage,weight')
   .eq('organization_id',context.organizationId).eq('project_id',id).limit(1200),
 ]);
 if(!org)notFound();
 const stagesRaw=obj(stagesResult.error?null:stagesResult.data);
 const stages:Stage[]=Array.isArray(stagesRaw.stages)?stagesRaw.stages.map(x=>{
  const a=obj(x);return {id:stringValue(a.id),title:stringValue(a.title),
   status:stringValue(a.status),phase:stringValue(a.phase),floor_code:stringValue(a.floor_code)||null,
   explanation:stringValue(a.explanation),
   activities:Array.isArray(a.activities)?a.activities.map(stringValue).filter(Boolean):[],
   task_count:Number(a.task_count)||0};
 }):[];
 const tasks=tasksResult.error?null:tasksResult.data??[];
 const site={
  stage:stringValue(raw.stage)||'not_started',role:stringValue(raw.role),
  canManage:raw.can_manage===true,
  reports:rows(raw.reports),materials:rows(raw.materials),checks:rows(raw.checks),
  media:rows(raw.media),designs:rows(raw.designs),team:rows(raw.team),
  gate:rows(raw.gate),
  memberOptions:Array.isArray(raw.member_options)?raw.member_options.filter((v):v is {id:string;label:string}=>{
   const t=obj(v);return typeof t.id==='string'&&typeof t.label==='string';
  }):[],
 };
 return {
  org:context.organizationId,company:org.name,email:user.email??'',
  permissions:{manage:site.canManage,finance:false,payments:false,purchases:false,team:site.canManage},
  project:{id,name:stringValue(p.name),code:stringValue(p.code),status:stringValue(p.status)||'active',
   projectType:'',address:'Project site',createdAt:'',client:'Project team',customerId:null,
   industry:'Site Delivery',
   progress:workCompletionByProject([id],tasks&&tasks.length<1200?tasks:null).get(id)??null},
  site,stages,links:[],milestones:[],transactions:null,purchaseOrders:null,tasks:(tasks??[]).map(t=>({
   id:t.id,title:t.title,planned_start:t.planned_start,status:t.status,
  })),
  contractValue:null,expenditure:null,agreement:null,projectRaw:null,
 };
}
