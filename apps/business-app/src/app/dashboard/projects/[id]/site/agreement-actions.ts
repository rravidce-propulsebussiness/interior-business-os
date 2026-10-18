'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

type Result = { saved: boolean; message: string };
const id = z.uuid();
const messageFor = (error: unknown): Result => ({
  saved: false,
  message:
    error instanceof Error
      ? error.message.slice(0, 240)
      : 'Agreement operation failed.',
});
async function call(
  projectId: string,
  contractId: string,
  action: string,
  input: {
    [key: string]: string;
  },
): Promise<Result> {
  try {
    id.parse(projectId);
    id.parse(contractId);
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const org = await activeOrganization();
    if (!org) throw new Error('Choose an active company');
    const { error } = await services.client.rpc('project_agreement_command', {
      p_organization_id: org.organizationId,
      p_project_id: projectId,
      p_contract_id: contractId,
      p_action: action,
      p_input: input,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/dashboard/projects/' + projectId + '/site');
    return {
      saved: true,
      message: 'Agreement record saved. The contract history is preserved.',
    };
  } catch (error) {
    return messageFor(error);
  }
}
export async function recordSignedAgreement(
  projectId: string,
  contractId: string,
  form: FormData,
): Promise<Result> {
  try {
    const mediaId = id.parse(form.get('media_id'));
    const note = z.string().trim().min(12).max(3000).parse(form.get('note'));
    return await call(projectId, contractId, 'record_signed_pdf', {
      media_id: mediaId,
      note,
    });
  } catch (error) {
    return messageFor(error);
  }
}
export async function createAgreementException(
  projectId: string,
  contractId: string,
  form: FormData,
): Promise<Result> {
  try {
    const reason = z
      .string()
      .trim()
      .min(30)
      .max(3000)
      .parse(form.get('reason'));
    const reference = z
      .string()
      .trim()
      .min(8)
      .max(1000)
      .parse(form.get('reference'));
    return await call(projectId, contractId, 'owner_exception', {
      reason,
      reference,
    });
  } catch (error) {
    return messageFor(error);
  }
}
export async function revokeAgreementClearance(
  projectId: string,
  contractId: string,
  previousEventId: string,
  reason: string,
): Promise<Result> {
  try {
    id.parse(previousEventId);
    const validReason = z.string().trim().min(10).max(3000).parse(reason);
    return await call(projectId, contractId, 'revoke', {
      previous_event_id: previousEventId,
      reason: validReason,
    });
  } catch (error) {
    return messageFor(error);
  }
}


/**
 * Single owner operation: upload the signed PDF if necessary, then register it
 * against the exact project contract. Existing uploaded PDFs can be selected
 * without uploading them again.
 *
 * The canonical RPCs enforce project scope, company/finance permissions and
 * signed-evidence validation. A failed second RPC leaves the PDF available for
 * retry via the existing-file choice; never report signing as recorded unless
 * project_agreement_command succeeds.
 */
export async function saveSignedAgreement(
  projectId: string,
  contractId: string,
  form: FormData,
): Promise<Result & { uploaded?: boolean }> {
  let uploaded = false;
  try {
    id.parse(projectId);
    id.parse(contractId);
    const note = z.string().trim().min(12).max(3000).parse(form.get('note'));
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const active = await activeOrganization();
    if (!active) throw new Error('Choose an active company');
    const org = active.organizationId;
    const file = form.get('file');
    const hasFile = file instanceof File && file.size > 0;
    const selected = String(form.get('media_id') ?? '').trim();
    if (hasFile && selected)
      throw new Error('Choose either a new signed PDF or an existing signed PDF.');
    if (!hasFile && !selected)
      throw new Error('Choose a signed PDF to upload, or select one already uploaded.');

    let mediaId: string;
    if (hasFile) {
      if (!(file instanceof File) || file.type !== 'application/pdf'
          || file.size > 8 * 1024 * 1024)
        throw new Error('Signed agreement must be a PDF up to 8 MB.');
      const filename = file.name.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 180);
      if (!filename) throw new Error('The agreement needs a filename.');
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length < 4 || bytes.subarray(0, 4).toString('ascii') !== '%PDF')
        throw new Error('The selected file is not a valid PDF.');
      const { data, error } = await services.client.rpc('project_site_media_put', {
        p_organization_id: org,
        p_project_id: projectId,
        p_category: 'agreement',
        p_filename: filename,
        p_mime: 'application/pdf',
        p_base64: bytes.toString('base64'),
        p_caption: note.slice(0, 500),
      });
      if (error) throw new Error(error.code === '42501'
        ? 'Only an authorized project manager can upload this agreement.'
        : error.message.slice(0, 220));
      mediaId = id.parse(data);
      uploaded = true;
    } else {
      mediaId = id.parse(selected);
    }
    const { error } = await services.client.rpc('project_agreement_command', {
      p_organization_id: org,
      p_project_id: projectId,
      p_contract_id: contractId,
      p_action: 'record_signed_pdf',
      p_input: { media_id: mediaId, note },
    });
    if (error) throw new Error(error.code === '42501'
      ? 'Signed agreement confirmation requires authorized project and finance access.'
      : error.message.slice(0, 220));

    for (const path of [
      '/dashboard/projects/' + projectId,
      '/dashboard/projects/' + projectId + '/documents',
      '/dashboard/projects/' + projectId + '/site',
      '/dashboard/projects/' + projectId + '/timeline',
    ]) revalidatePath(path);
    return { saved: true, message: 'Signed agreement uploaded and recorded successfully.' };
  } catch (error) {
    if (uploaded) {
      revalidatePath('/dashboard/projects/' + projectId + '/documents');
      return {
        saved: false, uploaded: true,
        message: 'The PDF was uploaded, but signing was not recorded: ' +
          (error instanceof Error ? error.message.slice(0, 180) : 'Please retry') +
          '. Select the existing PDF to finish without uploading it again.',
      };
    }
    return messageFor(error);
  }
}
