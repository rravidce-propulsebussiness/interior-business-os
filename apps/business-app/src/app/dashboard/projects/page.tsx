import { canAccess } from '@business-os/auth';
import { pageServices } from '@business-os/auth/server';
import { OwnerShell } from '../owner-shell';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { projectIndex } from './project-v2-data';
import { ProjectsDirectory } from './project-v2-list';
import '../owner-dashboard.css';
import './project-v2.css';
export const dynamic='force-dynamic';
export default async function ProjectsPage({searchParams}:{
 searchParams:Promise<{customer?:string}>;
}){
 const {s,list,org,user}=await projectIndex();
 const {customer}=await searchParams;
 const validId=typeof customer==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customer);
 const mayCreate=canAccess(s.context,{organizationId:s.org,permission:'project.create',moduleKey:'projects'});
 const mayReadCustomers=canAccess(s.context,{organizationId:s.org,permission:'customer.view',moduleKey:'crm'})||
  canAccess(s.context,{organizationId:s.org,permission:'customer.view',moduleKey:'quotation'});
 const services=mayCreate&&mayReadCustomers?await pageServices():null;
 const customerResult=services
  ?await services.client.from('customers').select('id,display_name')
    .eq('organization_id',s.org).eq('status','active').eq('is_sales_prospect',false)
    .order('display_name').limit(250):null;
 const customers=(customerResult&&!customerResult.error?customerResult.data??[]:[])
  .map(c=>({id:c.id,name:c.display_name||'Customer'}));
 const mayCreateQuote=canAccess(s.context,{organizationId:s.org,permission:'quotation.create',moduleKey:'quotation'});
 const mayReadQuotes=canAccess(s.context,{organizationId:s.org,permission:'quotation.view',moduleKey:'quotation'});
 const quoteResult=services&&mayReadQuotes&&customers.length
  ?await services.client.from('quotations').select('id,quotation_number,customer_id,current_revision_id')
    .eq('organization_id',s.org).in('customer_id',customers.map(c=>c.id))
    .in('status',['draft','issued']).order('created_at',{ascending:false}).limit(500):null;
 const quoteRows=quoteResult&&!quoteResult.error?quoteResult.data??[]:[];
 const revisionIds=[...new Set(quoteRows.map(q=>q.current_revision_id).filter((id):id is string=>Boolean(id)))];
 const revisionResult=revisionIds.length
  ?await services!.client.from('quotation_revisions').select('id,status').eq('organization_id',s.org).in('id',revisionIds)
  :null;
 const revisionStatus=new Map((revisionResult&&!revisionResult.error?revisionResult.data??[]:[]).map(r=>[r.id,r.status]));
 const quotesByCustomer:Record<string,{revisionId:string;number:string;status:string}[]>={};
 for(const q of quoteRows){
  if(!q.customer_id||!q.current_revision_id)continue;
  const status=revisionStatus.get(q.current_revision_id)||'';
  if(!['draft','issued'].includes(status))continue;
  (quotesByCustomer[q.customer_id]??=[]).push({revisionId:q.current_revision_id,number:q.quotation_number||'Quotation',status});
 }
 const selected=validId?customers.find(c=>c.id===customer):undefined;
 const client=validId?list.find(p=>p.customerId===customer):undefined;
 const scoped=validId?list.filter(p=>p.customerId===customer):list;
 const email=user.email??'';
 return <OwnerShell companyName={org.name} accountLabel={email.split('@')[0]||'Company member'}
  accountEmail={email} planLabel="Business workspace" navigation={ownerWorkspaceNavigation(s.context)}
  currentHref="/dashboard/projects" search="" searchPlaceholder="Search projects, client or location…"
  notificationsEnabled={canAccess(s.context,{organizationId:s.org,permission:'notification.view'})}
  dashboardBrand><ProjectsDirectory projects={scoped} customers={customers} quotesByCustomer={quotesByCustomer}
    canCreateProject={mayCreate} canCreateQuote={mayCreateQuote}
    clientName={selected?.name||client?.client||'Client'} clientId={validId?customer:''}/></OwnerShell>;
}
