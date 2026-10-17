import { notFound } from 'next/navigation';
import { z } from 'zod';
import { canAccess } from '@business-os/auth';
import { commercialServices } from '../../commercial/service';
import { OwnerShell } from '../../owner-shell';
import { ownerWorkspaceNavigation } from '../../owner-workspace-navigation';
import { workCompletionByProject } from '../work-progress';
import { ProjectCommandCentre } from './project-command-centre';
import '../../owner-dashboard.css';
import '../../command-centre.css';
import './project-command-centre.css';

export const dynamic='force-dynamic';
const row=z.object({id:z.uuid()}).passthrough();
const siteSchema=z.object({
 stage:z.string(),role:z.string().nullable(),can_manage:z.boolean(),
 team:z.array(row),member_options:z.array(z.object({id:z.uuid(),label:z.string()})),
 designs:z.array(row),reports:z.array(row),checks:z.array(row),
 materials:z.array(row),media:z.array(row),gate:z.array(row),
});
const constructionSchema=z.object({
 stages:z.array(z.object({
  id:z.uuid(),instance_code:z.string(),phase:z.string(),floor_code:z.string().nullable(),
  title:z.string(),explanation:z.string(),status:z.string(),
  task_count:z.number(),activities:z.array(z.string()),
 })),
});
const stageRecordsSchema=z.object({
 links:z.array(z.object({stage_id:z.uuid(),kind:z.string(),record_id:z.uuid()})),
 payments:z.array(z.object({
  stage_id:z.uuid(),item_id:z.uuid(),contract_id:z.uuid(),label:z.string(),
  amount:z.string(),due_date:z.string().nullable(),currency:z.string(),
  contract_number:z.string(),request_number:z.string().nullable(),
  request_status:z.string().nullable(),
 })),
 options:z.array(z.object({
  id:z.uuid(),contract_id:z.uuid(),label:z.string(),amount:z.string(),
  currency:z.string(),contract_number:z.string(),
 })),
});
const agreementSchema=z.object({
 contract_number:z.string().nullable(),contract_status:z.string().nullable(),
 contract_value:z.string().nullable(),currency:z.string().nullable(),
 active_schedule:z.boolean(),advance_required:z.boolean(),
 advance_received:z.boolean(),execution_authorized:z.boolean(),
});
const clientAccessSchema=z.array(z.object({
 project_id:z.uuid(),email:z.string(),active:z.boolean(),created_at:z.string(),
}));
export default async function Project({params,searchParams}:{
 params:Promise<{id:string}>;searchParams:Promise<{view?:string}>;
}){
 const {id}=await params;
 const {view}=await searchParams;
 if(!z.uuid().safeParse(id).success)notFound();
 const s=await commercialServices('project.view','projects',true);
 const {data:project,error:projectError}=await s.client.from('projects')
  .select('*').eq('organization_id',s.org).eq('id',id).eq('is_sales_prospect',false)
  .maybeSingle();
 if(projectError||!project)notFound();
 const has=(permission:string,moduleKey?:string)=>canAccess(s.context,{
  organizationId:s.org,permission,...(moduleKey?{moduleKey}:{}),
 });
 const canManage=has('project.manage','projects');
 const canSeeCustomer=has('customer.view','crm')||has('customer.view','quotation');
 const canManageCustomer=has('customer.manage','crm')||has('customer.manage','quotation');
 const canFinance=has('contract.view','billing');
 const canPurchase=has('purchase.view');
 const canSeeQuotes=has('quotation.view','quotation');

 const [organization,user,industries,siteResponse,areaResult,taskResult,branches]=await Promise.all([
  s.repository.organization(s.org),
  s.authorization.requireAuthenticatedUser(),
  s.repository.industries(),
  s.client.rpc('project_site_read',{p_organization_id:s.org,p_project_id:id}),
  s.client.from('project_areas').select('id').eq('organization_id',s.org).eq('project_id',id).limit(500),
  s.client.from('project_tasks').select('project_id,status,completion_percentage,weight,title,planned_start')
   .eq('organization_id',s.org).eq('project_id',id).limit(1000),
  canManage?s.repository.branches(s.org):Promise.resolve([]),
 ]);
 if(!organization)notFound();
 const siteParsed=siteResponse.error?null:siteSchema.safeParse(siteResponse.data);
 const site=siteParsed?.success?siteParsed.data:null;
 const constructionResponse=site?await s.client.rpc('construction_project_read',{
  p_organization_id:s.org,p_project_id:id,
 }):null;
 const constructionResult=constructionResponse&&!constructionResponse.error
  ?constructionSchema.safeParse(constructionResponse.data):null;
 const stages=constructionResult?.success?constructionResult.data.stages:[];
 // Stage record read is an existing guarded RPC. Financial lines are rendered
 // only to users holding the independent contract-view permission.
 const stageResponse=site&&stages.length?await s.client.rpc('construction_stage_record_read',{
  p_organization_id:s.org,p_project_id:id,
 }):null;
 const stageResult=stageResponse&&!stageResponse.error
  ?stageRecordsSchema.safeParse(stageResponse.data):null;
 const stageRecords=stageResult?.success?stageResult.data:null;
 const agreementResponse=site?.can_manage?await s.client.rpc('project_agreement_read',{
  p_organization_id:s.org,p_project_id:id,
 }):null;
 const agreementResult=agreementResponse&&!agreementResponse.error
  ?agreementSchema.safeParse(agreementResponse.data):null;
 const agreement=agreementResult?.success?agreementResult.data:null;
 const customerResponse=canSeeCustomer&&project.customer_id
  ?await s.client.from('customers').select('id,display_name')
   .eq('organization_id',s.org).eq('id',project.customer_id).maybeSingle()
  :null;
 const customer=customerResponse&&!customerResponse.error&&customerResponse.data
  ?{id:customerResponse.data.id,name:customerResponse.data.display_name}:null;
 const accessResponse=customer&&canSeeCustomer?await s.client.rpc('client_portal_access_list',{
  p_organization_id:s.org,p_customer_id:customer.id,
 }):null;
 const accessParsed=accessResponse&&!accessResponse.error
  ?clientAccessSchema.safeParse(accessResponse.data):null;
 const access=accessParsed?.success?
  accessParsed.data.filter(a=>a.project_id===id).map(a=>({
   email:a.email,active:a.active,created_at:a.created_at,
  })):null;
 const safeTasks=taskResult.error||taskResult.data.length>=1000?null:taskResult.data;
 const progress=workCompletionByProject([id],safeTasks).get(id)??null;
 const upcoming=(safeTasks??[]).filter(t=>t.status!=='done'&&t.status!=='cancelled'&&t.planned_start)
  .sort((a,b)=>(a.planned_start??'').localeCompare(b.planned_start??''))[0]??null;
 const industry=industries.find(x=>x.id===project.industry_id)?.name??'';
 const email=user.email??'';
 return <OwnerShell companyName={organization.name}
  accountLabel={email.split('@')[0]?.replaceAll(/[._-]/g,' ')||'Company member'}
  accountEmail={email} planLabel="Business workspace"
  navigation={ownerWorkspaceNavigation(s.context)} currentHref="/dashboard/projects" search=""
  notificationsEnabled={has('notification.view')} dashboardBrand>
  <ProjectCommandCentre view={view??'overview'}
   project={{
    id:project.id,name:project.name,code:project.code??'',status:project.status??'active',
    projectType:project.project_type??'',siteAddress:project.site_address,notes:project.notes??null,
   }}
   industry={industry} customer={customer} site={site} stages={stages}
   stageRecords={stageRecords} agreement={agreement} access={access}
   progress={progress} canManage={canManage} canFinance={canFinance}
   canPurchase={canPurchase} canSeeCustomer={canSeeCustomer} canManageCustomer={canManageCustomer}
   canSeeQuotes={canSeeQuotes} areaCount={areaResult.error?0:areaResult.data.length}
   settingsInitial={project} branches={branches.map(b=>({id:b.id,name:b.name}))}
   upcomingTask={upcoming?{title:upcoming.title,planned_start:upcoming.planned_start}:null}
  />
 </OwnerShell>;
}
