import { redirect } from 'next/navigation';
import { z } from 'zod';
import { notFound } from 'next/navigation';
export default async function LegacyProjectSiteLink({params}:{
 params:Promise<{id:string}>;
}){
 const {id}=await params;
 if(!z.uuid().safeParse(id).success)notFound();
 redirect('/dashboard/projects/'+id+'/timeline');
}
