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

export async function clientDesignDecision(form: FormData): Promise<void> {
  const fields = schema.safeParse({
    project: form.get('project'),
    decision: form.get('decision'),
    kind: String(form.get('kind') ?? ''),
    note: String(form.get('note') ?? ''),
  });
  if (!fields.success) throw new Error('Invalid design response.');
  const db = await createServerDatabase();
  const { data } = await db.auth.getUser();
  if (!data.user) throw new Error('Please sign in as the invited client.');
  const rpc = db.rpc.bind(db) as unknown as (
    name: string, args: Record<string, string>,
  ) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc('client_portal_design_decide', {
    p_project_id: fields.data.project,
    p_decision: fields.data.decision,
    p_kind: fields.data.kind ?? '',
    p_note: fields.data.note,
  });
  if (error) throw new Error(error.message.slice(0, 220));
  revalidatePath('/client');
  revalidatePath('/client/projects/' + fields.data.project);
}
