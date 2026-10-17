import { canAccess } from '@business-os/auth';
import { OwnerShell } from '../owner-shell';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { projectIndex } from './project-v2-data';
import { ProjectsDirectory } from './project-v2-list';
import '../owner-dashboard.css';
import './project-v2.css';
export const dynamic='force-dynamic';
export default async function ProjectsPage(){
 const {s,list,org,user}=await projectIndex();
 const email=user.email??'';
 return <OwnerShell companyName={org.name} accountLabel={email.split('@')[0]||'Company member'}
  accountEmail={email} planLabel="Business workspace" navigation={ownerWorkspaceNavigation(s.context)}
  currentHref="/dashboard/projects" search="" searchPlaceholder="Search projects, client or location…"
  notificationsEnabled={canAccess(s.context,{organizationId:s.org,permission:'notification.view'})}
  dashboardBrand><ProjectsDirectory projects={list}/></OwnerShell>;
}
