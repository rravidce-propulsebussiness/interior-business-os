'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { safeFailure } from '@business-os/shared';
import { crmServices } from '../../service';
import { leadServiceFromIndustryKey } from '../lead-service-options';
import { isLegacyRequirementText } from '../lead-category';

const selection = z
  .object({
    leadId: z.uuid(),
    version: z.number().int().positive(),
    category: z.enum(['construction', 'interior']),
  })
  .strict();

/** Change only the service identity of an existing tenant-owned lead. */
export async function classifyLead(
  input: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    const data = selection.parse(input);
    const s = await crmServices('lead.manage');
    const [
      { data: memberships, error: membershipError },
      industries,
      leadResult,
    ] = await Promise.all([
      s.client
        .from('organization_industries')
        .select('industry_id')
        .eq('organization_id', s.org),
      s.repository.industries(),
      s.client
        .from('leads')
        .select('id, version, lifecycle, project_size, service_type')
        .eq('organization_id', s.org)
        .eq('id', data.leadId)
        .maybeSingle(),
    ]);
    if (membershipError || !memberships)
      return { ok: false, message: 'Unable to verify company services.' };
    const enabled = new Set(memberships.map((entry) => entry.industry_id));
    const industry = industries.find(
      (entry) =>
        enabled.has(entry.id) &&
        leadServiceFromIndustryKey(entry.key) === data.category,
    );
    if (!industry)
      return {
        ok: false,
        message: 'This service is not enabled for this company.',
      };
    if (leadResult.error || !leadResult.data)
      return { ok: false, message: 'Lead not available to this company.' };
    const lead = leadResult.data;
    if (lead.lifecycle === 'archived')
      return { ok: false, message: 'Archived leads cannot be updated.' };
    if (lead.version !== data.version)
      return {
        ok: false,
        message: 'This lead changed. Refresh and try again.',
      };

    // Preserve historical free-form values like "3bhk" as project details,
    // instead of silently deleting them when service_type becomes canonical.
    const preserveRequirement =
      !lead.project_size && isLegacyRequirementText(lead.service_type);
    await s.crm.save('leads', {
      id: data.leadId,
      version: data.version,
      industry_id: industry.id,
      service_type:
        data.category === 'construction' ? 'Construction' : 'Interiors',
      ...(preserveRequirement ? { project_size: lead.service_type } : {}),
    });
    revalidatePath('/dashboard/crm/leads');
    revalidatePath('/dashboard/crm/leads/' + data.leadId);
    return { ok: true, message: 'Service category updated.' };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
