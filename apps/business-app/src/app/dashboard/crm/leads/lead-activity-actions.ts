'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crmServices } from '../service';
import { safeFailure } from '@business-os/shared';

const scheduleSchema = z.object({
  leadId: z.uuid(),
  kind: z.enum(['call', 'office_visit', 'site_visit']),
  dueAt: z.iso.datetime({ offset: true }),
  assignedTo: z.uuid().nullable(),
  location: z.string().trim().max(500),
  notes: z.string().trim().max(2400),
}).strict();

type Result = { ok: boolean; message: string };

/** Schedule in the existing tenant-owned CRM tables, never a parallel calendar.
 * Stage/outcome remains independent of appointments and calls.
 */
export async function scheduleLeadActivity(input: unknown): Promise<Result> {
  try {
    const value = scheduleSchema.parse(input);
    if (new Date(value.dueAt).getTime() <= Date.now())
      return { ok: false, message: 'Choose a future date and time.' };
    if (value.kind !== 'call' && !value.location)
      return { ok: false, message: 'Enter the visit location.' };
    const s = await crmServices(value.kind === 'site_visit' ? 'crm.site_visit.manage' : 'crm.followup.manage');
    const { data: lead, error } = await s.client.from('leads')
      .select('id,lifecycle,assigned_to')
      .eq('organization_id', s.org).eq('id', value.leadId).maybeSingle();
    if (error || !lead || lead.lifecycle !== 'open')
      return { ok: false, message: 'Only open leads can be scheduled.' };

    const user = await s.authorization.requireAuthenticatedUser();
    const assignee = value.assignedTo || lead.assigned_to || user.id;
    // The selected employee must be in this company's authorized assignee
    // list; never trust a client-supplied cross-organization user ID.
    if (value.assignedTo) {
      const available = await s.crm.assignees('', 1);
      if (!Array.isArray(available) ||
          !available.some((person: unknown) => person !== null &&
            typeof person === 'object' && 'user_id' in person &&
            person.user_id === value.assignedTo))
        return { ok: false, message: 'Choose an active employee in your company.' };
    }
    if (value.kind === 'site_visit') {
      await s.crm.save('site_visits', {
        lead_id: lead.id,
        assigned_to: assignee,
        scheduled_at: value.dueAt,
        site_address: {
          line1: value.location, line2: '', city: '', region: '',
          postal_code: '', country_code: 'IN',
        },
        contact_person: '',
        notes: value.notes,
      });
    } else {
      await s.crm.save('lead_followups', {
        lead_id: lead.id,
        assigned_to: assignee,
        due_at: value.dueAt,
        followup_type: value.kind === 'call' ? 'call' : 'meeting',
        note: value.kind === 'office_visit'
          ? 'Office visit · ' + value.location + (value.notes ? '\n' + value.notes : '')
          : value.notes,
      });
    }
    revalidatePath('/dashboard/crm/leads');
    revalidatePath('/dashboard/crm/leads/' + value.leadId);
    return { ok: true, message: value.kind === 'call' ? 'Call scheduled.' : 'Visit scheduled.' };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}

const updateSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  kind: z.enum(['followup', 'visit']),
  status: z.enum(['completed', 'cancelled']),
  outcome: z.string().trim().max(3000),
}).strict();

export async function completeLeadActivity(input: unknown): Promise<Result> {
  try {
    const value = updateSchema.parse(input);
    if (value.status === 'completed' && !value.outcome)
      return { ok: false, message: 'Record the result before marking complete.' };
    const s = await crmServices(value.kind === 'visit' ? 'crm.site_visit.manage' : 'crm.followup.manage');
    if (value.kind === 'visit') {
      await s.crm.command('visit', {
        id: value.id, version: value.version, status: value.status,
        scheduled_at: null, notes: '', outcome: value.outcome,
      });
    } else {
      await s.crm.command('followup', {
        id: value.id, version: value.version,
        status: value.status, outcome: value.outcome,
      });
    }
    revalidatePath('/dashboard/crm/leads');
    return { ok: true, message: value.status === 'completed' ? 'Activity completed.' : 'Activity cancelled.' };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
