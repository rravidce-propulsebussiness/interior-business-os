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
 const customerResult=mayCreate&&mayReadCustomers
  ?await (await pageServices()).client.from('customers').select('id,display_name')
    .eq('organization_id',s.org).eq('status','active').eq('is_sales_prospect',false)
    .order('display_name').limit(250):null;
 const customers=(customerResult&&!customerResult.error?customerResult.data??[]:[])
  .map(c=>({id:c.id,name:c.display_name||'Customer'}));
 const selected=validId?customers.find(c=>c.id===customer):undefined;
 const client=validId?list.find(p=>p.customerId===customer):undefined;
 const scoped=validId?list.filter(p=>p.customerId===customer):list;
 const email=user.email??'';
 return <OwnerShell companyName={org.name} accountLabel={email.split('@')[0]||'Company member'}
  accountEmail={email} planLabel="Business workspace" navigation={ownerWorkspaceNavigation(s.context)}
  currentHref="/dashboard/projects" search="" searchPlaceholder="Search projects, client or location…"
  notificationsEnabled={canAccess(s.context,{organizationId:s.org,permission:'notification.view'})}
  dashboardBrand><ProjectsDirectory projects={scoped} customers={customers} canCreateProject={mayCreate}
    clientName={selected?.name||client?.client||'Client'} clientId={validId?customer:''}/></OwnerShell>;
}
