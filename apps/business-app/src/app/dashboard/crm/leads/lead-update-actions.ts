'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crmServices } from '../service';
import { safeFailure } from '@business-os/shared';

const logSchema = z.object({
  leadId: z.uuid(),
  activityType: z.enum(['phone_call', 'whatsapp_note', 'meeting', 'email_note', 'note']),
  outcome: z.string().trim().min(1).max(200),
  note: z.string().trim().max(3000),
  nextFollowUpAt: z.iso.datetime({ offset: true }).nullable(),
}).strict();

/** One database transaction logs the contact and optionally schedules a callback. */
export async function logLeadUpdate(input: unknown): Promise<{ok: boolean; message: string}> {
  try {
    const value = logSchema.parse(input);
    const s = await crmServices('crm.activity.create');
    const { error } = await s.client.rpc('crm_lead_log_update', {
      p_organization_id: s.org,
      p_lead_id: value.leadId,
      p_activity_type: value.activityType,
      p_outcome: value.outcome,
      p_note: value.note,
      p_follow_up_at: value.nextFollowUpAt,
    });
    if (error) {
      console.error('[crm.lead.update]', error.code, error.message);
      return { ok: false, message: 'Unable to record this update. Check follow-up permissions or retry.' };
    }
    revalidatePath('/dashboard/crm/leads');
    revalidatePath('/dashboard/crm/leads/' + value.leadId);
    return { ok: true, message: 'Update saved to lead history.' };
  } catch (error) {
    console.error('[crm.lead.update.validation]', error);
    return { ok: false, message: safeFailure(error).message };
  }
}

const scheduleSchema = z.object({
  leadId: z.uuid(),
  dueAt: z.iso.datetime({ offset: true }),
  assignedTo: z.uuid().nullable(),
}).strict();

/** Schedule from the main Leads list without navigating away. */
export async function scheduleLeadFollowUp(input: unknown): Promise<{ok: boolean; message: string}> {
  try {
    const value = scheduleSchema.parse(input);
    if (new Date(value.dueAt).getTime() <= Date.now())
      return { ok: false, message: 'Choose a future follow-up time.' };
    const s = await crmServices('crm.followup.manage');
    const user = await s.authorization.requireAuthenticatedUser();
    const { data: lead, error } = await s.client.from('leads')
      .select('id,lifecycle,assigned_to')
      .eq('organization_id', s.org).eq('id', value.leadId).maybeSingle();
    if (error || !lead || lead.lifecycle === 'archived')
      return { ok: false, message: 'Lead not available.' };
    await s.crm.save('lead_followups', {
      lead_id: value.leadId,
      assigned_to: value.assignedTo || lead.assigned_to || user.id,
      due_at: value.dueAt,
      followup_type: 'call',
      note: 'Scheduled from Leads',
    });
    revalidatePath('/dashboard/crm/leads');
    revalidatePath('/dashboard/crm/leads/' + value.leadId);
    return { ok: true, message: 'Follow-up scheduled.' };
  } catch (error) {
    console.error('[crm.lead.schedule]', error);
    return { ok: false, message: safeFailure(error).message };
  }
}
