'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

type Result = { saved: boolean; message: string };
const id = z.uuid();
const messageFor = (error: unknown): Result => ({
  saved: false,
  message:
    error instanceof Error ? error.message.slice(0, 240) : 'Agreement operation failed.',
});
async function call(projectId: string, contractId: string, action: string, input: {
  [key: string]: string;
}): Promise<Result> {
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
    return { saved: true, message: 'Agreement record saved. The contract history is preserved.' };
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
    const reason = z.string().trim().min(30).max(3000).parse(form.get('reason'));
    const reference = z.string().trim().min(8).max(1000).parse(form.get('reference'));
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
