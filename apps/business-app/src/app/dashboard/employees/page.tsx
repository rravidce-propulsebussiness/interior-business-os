import { notFound } from 'next/navigation';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { OwnerShell, type OwnerNavItem } from '../owner-shell';
import { EmployeeWorkspace } from './employee-workspace';
import { employeeRepository } from './service';
import '../owner-dashboard.css';
import '../command-centre.css';

export const dynamic='force-dynamic';
function indiaMonth() {
 const parts=new Intl.DateTimeFormat('en-US',{
  month:'2-digit',year:'numeric',timeZone:'Asia/Kolkata',
 }).formatToParts(new Date());
 const value=(key:string)=>parts.find(x=>x.type===key)?.value??'01';
 return value('year')+'-'+value('month');
}
export default async function EmployeesPage({
 searchParams,
}:{
 searchParams:Promise<{month?:string}>;
}) {
 const {client,authorization,user}=await pageServices();
 const context=await activeOrganization();
 if(!context)notFound();
 const org=context.organizationId;
 await authorization.requirePermission(org,'team.manage');
 const has=(permission:string,moduleKey?:string)=>canAccess(context,{
  organizationId:org,permission,...(moduleKey?{moduleKey}:{}),
 });
 const navigation:OwnerNavItem[]=[
  {label:'Dashboard',href:'/dashboard',icon:'dashboard'},
  ...(has('lead.view','crm')?[{label:'Leads',href:'/dashboard/crm/leads',icon:'leads' as const}]:[]),
  ...(has('project.view','projects')?[{label:'Projects',href:'/dashboard/projects',icon:'projects' as const}]:[]),
  ...(has('customer.view','crm')?[{label:'Clients',href:'/dashboard/customers',icon:'clients' as const}]:[]),
  ...(has('quotation.view','quotation')?[{label:'Quotations',href:'/dashboard/quotations',icon:'quotations' as const}]:[]),
  ...(has('invoice.view','billing')?[{label:'Finance',href:'/dashboard/finance',icon:'billing' as const}]:[]),
  {label:'Employees',href:'/dashboard/employees',icon:'team'},
  ...(has('role.view')||has('team.view')?[{label:'Team & Roles',href:'/dashboard/company/team',icon:'team' as const}]:[]),
  ...(has('report.view')?[{label:'Reports',href:'/dashboard/reports',icon:'reports' as const}]:[]),
  ...(has('organization.view')?[{label:'Settings',href:'/dashboard/settings',icon:'settings' as const}]:[]),
 ];
 const info=await client.from('organizations').select('name').eq('id',org).single();
 const monthParam=(await searchParams).month;
 const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam??'')?monthParam!:indiaMonth();
 const repo=employeeRepository(client);
 const [employees,attendance]=await Promise.all([
  repo.list(org),repo.attendance(org,month),
 ]);
 return <OwnerShell companyName={info.data?.name??'Business OS'}
   accountLabel={(user.email??'Account').split('@')[0]??'Account'}
   accountEmail={user.email??''}
   planLabel="Business workspace"
   navigation={navigation} search="" currentHref="/dashboard/employees"
   notificationsEnabled={has('notification.view')} dashboardBrand>
   <EmployeeWorkspace employees={employees} attendance={attendance}
    payrollMonth={month} canViewSalary={has('payment.view')}
    canRecordSalary={has('payment.record')}/>
 </OwnerShell>;
}
