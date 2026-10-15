'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crmServices } from '../service';
import { safeFailure } from '@business-os/shared';

/** Bulk operations only apply to explicitly selected visible lead versions.
 * Each change passes the same tenant-scoped, audited CRM command as the
 * individual row. A stale version is reported, never overwritten.
 */
const bulkSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('assign'),
    leads: z.array(z.object({ id: z.uuid(), version: z.number().int().positive() }).strict())
      .min(1).max(25),
    assignedTo: z.uuid().nullable(),
  }).strict(),
  z.object({
    action: z.literal('stage'),
    leads: z.array(z.object({ id: z.uuid(), version: z.number().int().positive() }).strict())
      .min(1).max(25),
    stageId: z.uuid(),
  }).strict(),
  z.object({
    action: z.literal('followup'),
    leads: z.array(z.object({ id: z.uuid(), version: z.number().int().positive() }).strict())
      .min(1).max(25),
    dueAt: z.iso.datetime({ offset: true }),
  }).strict(),
]);

export type BulkLeadResult = { ok: boolean; updated: number; failed: number; message: string };

export async function bulkUpdateLeads(input: unknown): Promise<BulkLeadResult> {
  try {
    const value = bulkSchema.parse(input);
    if (new Set(value.leads.map((row) => row.id)).size !== value.leads.length)
      return { ok: false, updated: 0, failed: value.leads.length, message: 'Duplicate lead selection.' };
    if (value.action === 'followup' && new Date(value.dueAt).getTime() <= Date.now())
      return { ok: false, updated: 0, failed: value.leads.length, message: 'Choose a future follow-up time.' };

    const permission = value.action === 'assign' ? 'lead.assign'
      : value.action === 'stage' ? 'lead.manage' : 'crm.followup.manage';
    const s = await crmServices(permission);
    if (value.action === 'assign' && value.assignedTo) {
      const members = await s.repository.team(s.org);
      if (!members.some((person) => person.user_id === value.assignedTo && person.status === 'active'))
        return { ok: false, updated: 0, failed: value.leads.length,
          message: 'Choose an active employee in this company.' };
    }
    if (value.action === 'stage') {
      const stages = await s.crm.search('crm_pipeline_stages', { active: true }, 1);
      const stage = z.object({
        rows: z.array(z.object({ id: z.string(), outcome: z.string().optional() }).passthrough()),
      }).passthrough().parse(stages).rows.find((row) => row.id === value.stageId);
      // Closing a lead requires individual outcome notes / lost reasons.
      if (!stage || (stage.outcome && stage.outcome !== 'open'))
        return { ok: false, updated: 0, failed: value.leads.length,
          message: 'Bulk status changes support open stages only. Close Won/Lost leads individually.' };
    }

    const user = value.action === 'followup'
      ? await s.authorization.requireAuthenticatedUser() : null;
    let updated = 0;
    let failed = 0;
    // Bound work and avoid parallel write storms on large company datasets.
    for (const selected of value.leads) {
      try {
        if (value.action === 'followup') {
          const { data: lead, error } = await s.client
            .from('leads').select('id,version,lifecycle,assigned_to')
            .eq('organization_id', s.org).eq('id', selected.id).maybeSingle();
          if (error || !lead || lead.version !== selected.version || lead.lifecycle !== 'open')
            throw new Error('Lead changed or closed');
          await s.crm.save('lead_followups', {
            lead_id: selected.id,
            assigned_to: lead.assigned_to || user!.id,
            due_at: value.dueAt,
            followup_type: 'call',
            note: 'Scheduled from bulk Leads action',
          });
        } else if (value.action === 'assign') {
          await s.crm.command('assign', {
            id: selected.id, version: selected.version, assigned_to: value.assignedTo,
          });
        } else {
          await s.crm.command('stage', {
            id: selected.id, version: selected.version,
            stage_id: value.stageId, lost_reason_id: null, note: '',
          });
        }
        updated++;
      } catch {
        failed++;
      }
    }
    if (updated > 0) revalidatePath('/dashboard/crm/leads');
    return {
      ok: failed === 0,
      updated, failed,
      message: updated + ' lead' + (updated === 1 ? '' : 's') + ' updated.' +
        (failed ? ' ' + failed + ' could not be updated; refresh and retry.' : ''),
    };
  } catch (error) {
    return { ok: false, updated: 0, failed: 0, message: safeFailure(error).message };
  }
}
