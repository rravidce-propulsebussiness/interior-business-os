import { redirect } from 'next/navigation';
import { publicAuthOrigin } from '@business-os/auth/origin';
import { resolveLoginDestination } from '@business-os/auth/login-destination';
import { z } from 'zod';
import { createServerDatabase,isSupabaseConfigured } from '@business-os/database/server';
import { signIn } from '@business-os/auth/actions';
import { ClientAuthShell } from '../client-auth-shell';
import { ClientAuthForm } from '../client-auth-form';

export const dynamic='force-dynamic';

export default async function ClientLoginPage({searchParams}:{
 searchParams:Promise<{project?:string;provider_error?:string}>;
}){
 const query=await searchParams;
 // A project ID is only a navigation hint: portal authorization checks the
 // authenticated email's project-specific invitation on every server request.
 const projectId=z.uuid().safeParse(query.project).success?query.project:undefined;
 if(isSupabaseConfigured()){
  const db=await createServerDatabase();
  const {data}=await db.auth.getUser();
  if(data.user){
   const destination=await resolveLoginDestination(db,{preferClient:true});
   const path=destination==='/client'&&projectId?'/client/projects/'+projectId:destination;
   redirect(new URL(path,publicAuthOrigin('http://localhost:3000/client/login')).toString());
  }
 }
 return <ClientAuthShell mode="login" {...(projectId?{projectId}:{})}
  {...(query.provider_error?{providerError:query.provider_error}:{})}>
  <ClientAuthForm mode="login" action={signIn} {...(projectId?{projectId}:{})}/>
 </ClientAuthShell>;
}
