'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { uploadProjectSiteMedia } from './actions';

type Result = { saved: boolean; message: string };
const uuid = z.uuid();

/** A named project QC inspector records one on-site review. No project status is
 * manufactured here: database authorization owns every QC transition. */
export async function recordOnsiteStageQcItem(
  projectId: string,
  stageId: string,
  index: number,
  form: FormData,
): Promise<Result> {
  try {
    uuid.parse(projectId);
    uuid.parse(stageId);
    const checkIndex = z.number().int().min(0).max(999).parse(index);
    const decision = z.enum(['passed', 'failed']).parse(form.get('decision'));
    const notes = z
      .string()
      .trim()
      .max(2000)
      .parse(String(form.get('notes') ?? ''));
    if (decision === 'failed' && notes.length < 10)
      throw new Error(
        'Explain the QC failure and corrective work required (at least 10 characters).',
      );
    if (form.get('onsite') !== 'yes')
      throw new Error(
        'Confirm that you visited the project site and inspected this item.',
      );
    const file = form.get('file');
    let photoId = String(form.get('photo_id') ?? '').trim();
    if (photoId) uuid.parse(photoId);
    if (file instanceof File && file.size > 0) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
        throw new Error('Attach a JPEG, PNG or WebP site-inspection photo.');
      const media = new FormData();
      media.set('file', file);
      media.set('category', 'inspection');
      media.set('caption', 'On-site QC ' + decision + ' inspection');
      const uploaded = await uploadProjectSiteMedia(projectId, media);
      if (!uploaded.saved || !uploaded.mediaId)
        throw new Error(uploaded.message || 'Inspection photo upload failed.');
      photoId = uploaded.mediaId;
    }
    if (!photoId)
      throw new Error('QC Pass and Fail both require project photo evidence.');
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const org = await activeOrganization();
    if (!org) throw new Error('Select an active company.');
    const { error } = await services.client.rpc(
      'construction_stage_qc_item_command' as never,
      {
        p_org: org.organizationId,
        p_project: projectId,
        p_stage: stageId,
        p_index: checkIndex,
        p_decision: decision,
        p_notes: notes,
        p_photo: photoId,
        p_visited: true,
      } as never,
    );
    if (error) throw new Error(error.message);
    for (const page of ['', '/timeline', '/checks', '/execution'])
      revalidatePath('/dashboard/projects/' + projectId + page);
    return {
      saved: true,
      message:
        decision === 'failed'
          ? 'QC failed. This single item needs correction and the stage was reopened; all earlier findings are retained.'
          : 'QC passed for this item. Other QC items and final stage certification stay independent.',
    };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error
          ? error.message
          : 'Unable to record on-site QC review.',
    };
  }
}
