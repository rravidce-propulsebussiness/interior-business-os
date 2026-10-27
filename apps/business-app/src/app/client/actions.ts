'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerDatabase } from '@business-os/database/server';

const schema = z.object({
  project: z.uuid(),
  decision: z.enum(['approved', 'changes_requested']),
  kind: z.string().max(100).optional(),
  note: z.string().trim().max(1000),
});

export async function clientDesignDecision(form: FormData): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const fields = schema.parse({
      project: form.get('project'),
      decision: form.get('decision'),
      kind: String(form.get('kind') ?? ''),
      note: String(form.get('note') ?? ''),
    });
    if (fields.decision === 'approved' && form.get('acknowledged') !== 'on')
      return {
        ok: false,
        message: 'Confirm that you have reviewed the final drawings.',
      };
    if (fields.decision === 'changes_requested' && fields.note.length < 10)
      return {
        ok: false,
        message: 'Describe what you would like the designer to change.',
      };

    const db = await createServerDatabase();
    const { data } = await db.auth.getUser();
    if (!data.user)
      return { ok: false, message: 'Please sign in as the invited client.' };
    const rpc = db.rpc.bind(db) as unknown as (
      name: string,
      args: Record<string, string>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc('client_portal_design_decide', {
      p_project_id: fields.project,
      p_decision: fields.decision,
      p_kind: fields.kind ?? '',
      p_note: fields.note,
    });
    if (error) return { ok: false, message: error.message.slice(0, 220) };
    revalidatePath('/client');
    revalidatePath('/client/projects/' + fields.project);
    return {
      ok: true,
      message:
        fields.decision === 'approved'
          ? 'Your approval has been recorded and shared with the project team.'
          : 'Your requested changes have been recorded for the designer.',
    };
  } catch {
    return {
      ok: false,
      message:
        'Could not record your response. Check your details and try again.',
    };
  }
}

/** Client requests are separate from signed design approvals.
 * The SQL RPC checks the invite and verified email on every submission. */
const requestSchema = z.object({
  project: z.uuid(),
  kind: z.enum(['question', 'issue', 'delay', 'pooja']),
  details: z.string().trim().min(10).max(2000),
  requestedDate: z.string().optional(),
});
export async function submitClientProjectRequest(
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const input = requestSchema.parse({
      project: form.get('project'),
      kind: form.get('kind'),
      details: form.get('details'),
      requestedDate: String(form.get('requestedDate') ?? ''),
    });
    const date = input.requestedDate
      ? z.iso.date().parse(input.requestedDate)
      : null;
    if (input.kind === 'pooja' && !date)
      return { ok: false, message: 'Select the requested pooja date.' };
    if (date && input.kind !== 'pooja' && input.kind !== 'delay')
      return {
        ok: false,
        message: 'A date is only available for pooja or delay requests.',
      };
    const db = await createServerDatabase();
    const { data } = await db.auth.getUser();
    if (!data.user)
      return {
        ok: false,
        message: 'Sign in with your invited client account.',
      };
    const rpc = db.rpc.bind(db) as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc('project_client_request_create', {
      p_project_id: input.project,
      p_kind: input.kind,
      p_details: input.details,
      p_requested_date: date,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/client/projects/' + input.project);
    revalidatePath('/dashboard/projects/' + input.project);
    return { ok: true, message: 'Request sent to the project team.' };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message.slice(0, 220)
          : 'Unable to send request.',
    };
  }
}
