import { z } from 'zod';
import { ClientAuthShell } from '../client-auth-shell';
import { ClientAuthForm } from '../client-auth-form';
import { clientSignUp } from '../client-auth-actions';

export const dynamic='force-dynamic';

export default async function ClientRegistration({searchParams}:{
 searchParams:Promise<{project?:string;provider_error?:string}>;
}){
 const query=await searchParams;
 const projectId=z.uuid().safeParse(query.project).success?query.project:undefined;
 return <ClientAuthShell mode="register" {...(projectId?{projectId}:{})}
  {...(query.provider_error?{providerError:query.provider_error}:{})}>
  <ClientAuthForm mode="register" action={clientSignUp} {...(projectId?{projectId}:{})}/>
 </ClientAuthShell>;
}
