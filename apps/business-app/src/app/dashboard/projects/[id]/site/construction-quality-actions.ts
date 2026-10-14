'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

type QualityResult = { saved: boolean; message: string };
const uuid = z.uuid();
const note = z.string().trim().min(12).max(3000);

async function command(projectId: string, action: string, input: Record<string,string>): Promise<QualityResult> {
  try {
    uuid.parse(projectId);
    const service = await serverServices();
    await service.authorization.requireAuthenticatedUser();
    const org = await activeOrganization();
    if (!org) throw new Error('Choose a company first');
    const { error } = await service.client.rpc('construction_quality_command', {
      p_org: org.organizationId,
      p_project: projectId,
      p_action: action,
      p_input: input,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/dashboard/projects/' + projectId + '/site');
    return { saved: true, message: 'Quality record saved to the project audit trail.' };
  } catch (error) {
    return { saved:false, message: error instanceof Error ? error.message.slice(0,240) : 'Operation failed' };
  }
}

export async function linkStageInspection(projectId: string, stageId: string, form: FormData): Promise<QualityResult> {
  try {
    return await command(projectId,'inspection_link',{
      stage_id:uuid.parse(stageId),
      inspection_id:uuid.parse(form.get('inspection_id')),
    });
  } catch (error) {
    return { saved:false,message:error instanceof Error ? error.message:'Invalid inspection reference' };
  }
}
export async function reviewStageInspection(projectId: string,stageId: string,form:FormData): Promise<QualityResult> {
  try {
    return await command(projectId,'review',{
      stage_id:uuid.parse(stageId),
      inspection_id:uuid.parse(form.get('inspection_id')),
      review_kind:z.enum(['quality','structural']).parse(form.get('review_kind')),
      decision:z.enum(['approved','rejected']).parse(form.get('decision')),
      notes:note.parse(form.get('notes')),
    });
  } catch (error) {
    return { saved:false,message:error instanceof Error ? error.message:'Invalid quality review' };
  }
}
export async function certifyConstructionStage(projectId:string,stageId:string,form:FormData):Promise<QualityResult> {
  try {
    return await command(projectId,'stage_clear',{
      stage_id:uuid.parse(stageId),
      notes:note.parse(form.get('notes')),
    });
  } catch (error) {
    return { saved:false,message:error instanceof Error ? error.message:'Cannot certify stage' };
  }
}
