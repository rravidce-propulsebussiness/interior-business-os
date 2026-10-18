import { canAccess } from '@business-os/auth';
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
 const client=validId?list.find(p=>p.customerId===customer):undefined;
 // The canonical directory contains only projects that are authorized for
 // this company; do not introduce a new customer record query or leak others.
 const scoped=validId?list.filter(p=>p.customerId===customer):list;
 const email=user.email??'';
 return <OwnerShell companyName={org.name} accountLabel={email.split('@')[0]||'Company member'}
  accountEmail={email} planLabel="Business workspace" navigation={ownerWorkspaceNavigation(s.context)}
  currentHref="/dashboard/projects" search="" searchPlaceholder="Search projects, client or location…"
  notificationsEnabled={canAccess(s.context,{organizationId:s.org,permission:'notification.view'})}
  dashboardBrand><ProjectsDirectory projects={scoped} clientName={client?.display_name||''} clientId={client?.id||''}/></OwnerShell>;
}
