import { redirect } from 'next/navigation';

/** Legacy CRM configuration links are kept as safe redirects.
 * No Sources, Pipeline, or Lost Reasons configuration screens are rendered.
 * Historical leads and their source/outcome records are untouched.
 */
export default async function LegacyCrmSettings({
 searchParams,
}:{
 searchParams:Promise<{entity?:string}>;
}) {
 const {entity}=await searchParams;
 if(entity==='crm_requirement_fields'||!entity)
  redirect('/dashboard/settings?tab=lead-fields');
 redirect('/dashboard/crm/leads');
}
