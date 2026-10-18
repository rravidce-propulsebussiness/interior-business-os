import { notFound,redirect } from 'next/navigation';
import { z } from 'zod';
import { ProjectV2Page,projectPages,type ProjectPageSlug } from '../../project-v2-view';

export const dynamic='force-dynamic';
export default async function ProjectSection({params}:{
 params:Promise<{id:string;section:string}>;
}){
 const {id,section}=await params;
 if(!z.uuid().safeParse(id).success||!projectPages.some(x=>x.slug===section&&section!=='overview'))notFound();
 if(section==='timeline')redirect('/dashboard/projects/'+id+'#project-timeline');
 return <ProjectV2Page id={id} view={section as ProjectPageSlug}/>;
}
