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
