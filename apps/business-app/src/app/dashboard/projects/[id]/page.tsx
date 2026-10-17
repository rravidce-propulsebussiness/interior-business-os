import { z } from 'zod';
import { notFound } from 'next/navigation';
import { ProjectV2Page } from '../project-v2-view';
export const dynamic='force-dynamic';
export default async function ProjectOverview({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!z.uuid().safeParse(id).success)notFound();
 return <ProjectV2Page id={id} view="overview"/>;
}
