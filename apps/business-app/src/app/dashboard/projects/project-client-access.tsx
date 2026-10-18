import 'server-only';

import { activeOrganization,pageServices } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { ClientAccess } from '../customers/[id]/client-access';

/** Client App grants belong to the existing project, not a second Clients page.
 * The backend enforces project-specific agreement, advance and email gates.
 */
export async function ProjectClientAccess({
 projectId,customerId,
}:{projectId:string;customerId:string|null}){
 if(!customerId)return null;
 const context=await activeOrganization();
 if(!context)return null;
 const authorized=(permission:string,moduleKey:string)=>
  canAccess(context,{organizationId:context.organizationId,permission,moduleKey});
 if(!authorized('project.view','projects')||
   !(authorized('customer.manage','crm')||authorized('customer.manage','quotation')))
  return null;
 const {client}=await pageServices();
 const scope=await client.from('projects').select('id,name,customer_id')
  .eq('organization_id',context.organizationId).eq('id',projectId)
  .eq('customer_id',customerId).eq('removed_from_workspace',false)
  .eq('is_sales_prospect',false).maybeSingle();
 const project=scope.data;
 if(scope.error||!project)return null;
 const [customer,grantable,access]=await Promise.all([
  client.from('customers').select('id,email').eq('organization_id',context.organizationId)
    .eq('id',customerId).maybeSingle(),
  client.rpc('client_portal_grantable_projects',{
   p_organization_id:context.organizationId,p_customer_id:customerId,
  }),
  client.rpc('client_portal_access_list',{
   p_organization_id:context.organizationId,p_customer_id:customerId,
  }),
 ]);
 const canShare=!grantable.error&&Array.isArray(grantable.data)&&grantable.data.some(value=>
  value&&typeof value==='object'&&'id' in value&&value.id===projectId);
 const rows=(!access.error&&Array.isArray(access.data)?access.data:[]).flatMap(value=>{
  if(!value||typeof value!=='object')return [];
  const item=value as Record<string,unknown>;
  if(item.project_id!==projectId||typeof item.email!=='string')return [];
  return [{
   project_id:projectId,project_name:project.name,
   email:item.email,active:item.active===true,
   created_at:typeof item.created_at==='string'?item.created_at:'',
  }];
 });
 return <ClientAccess customerId={customerId} customerEmail={customer.data?.email??''}
  projects={canShare?[{id:projectId,name:project.name}]:[]} existing={rows}/>;
}
