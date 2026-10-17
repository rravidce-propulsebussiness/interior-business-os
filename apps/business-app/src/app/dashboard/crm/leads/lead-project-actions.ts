'use server';

import { z } from 'zod';
import { convertLead } from '../actions';
import { crmServices } from '../service';

const projectRequest = z.object({
  leadId: z.uuid(),
  version: z.number().int().positive(),
  projectName: z.string().trim().max(200).optional(),
}).strict();

/**
 * One-click lead -> project action. A quotation's existing customer and
 * provisional project are reused by crm_convert; no duplicate CRNs or project
 * rows are written for a lead with an existing quote. The database enforces
 * tenant isolation, lead.convert, Won status and optimistic locking.
 */
export async function openOrCreateWonLeadProject(input: unknown):
  Promise<{ ok: boolean; projectId?: string; message: string }> {
  const request = projectRequest.safeParse(input);
  if (!request.success) return { ok: false, message: 'Invalid project request.' };

  try {
    const { leadId, version } = request.data;
    const s = await crmServices('lead.convert');
    const { data: lead, error } = await s.client.from('leads')
      .select('id,version,lifecycle,converted_project_id,converted_at')
      .eq('organization_id',s.org).eq('id',leadId).maybeSingle();
    if (error || !lead) return { ok: false, message: 'Lead not found.' };
    if (lead.converted_project_id && lead.converted_at) {
      return { ok: true, projectId: lead.converted_project_id,
        message: 'Opening existing project.' };
    }
    if (lead.lifecycle !== 'won') {
      return { ok: false, message: 'Mark the lead Won before creating a project.' };
    }
    if (lead.version !== version) {
      return { ok: false, message: 'The lead was updated. Refresh and try again.' };
    }

    let projectName = request.data.projectName?.trim() ?? '';
    // Resolve an existing quote project server-side, rather than trusting a
    // client-provided project/customer ID. All reads are tenant-scoped.
    if (s.allowed('quotation.view','quotation')) {
      const rpc = s.client.rpc.bind(s.client) as unknown as
        (name: string, args: Record<string,string>) =>
          Promise<{data: unknown; error: unknown}>;
      const linked = await rpc('lead_quotation_list', {
        p_organization_id: s.org, p_lead_id: leadId,
      });
      if (!linked.error && Array.isArray(linked.data)) {
        const quote = linked.data.find((item: unknown) => {
          if (!item || typeof item !== 'object') return false;
          const row = item as Record<string,unknown>;
          return typeof row.project_id === 'string' && row.status !== 'cancelled';
        }) as Record<string,unknown> | undefined;
        if (quote && typeof quote.project_id === 'string') {
          const existing = await s.client.from('projects')
            .select('name').eq('organization_id',s.org)
            .eq('id',quote.project_id).maybeSingle();
          if (existing.data?.name) projectName = existing.data.name;
        }
      }
    }
    if (!projectName) {
      return { ok: false, message: 'Enter a project name to continue.' };
    }

    // crm_convert selects the newest quotation-linked customer/project when
    // IDs are null; otherwise it creates one fresh customer and project.
    const converted = await convertLead({
      id: leadId, version, customer_id: null, project_id: null,
      project_name: projectName, acknowledge_duplicate: false,
    });
    if (!converted.id) return { ok: false,
      message: converted.message || 'Could not link this project.' };
    return { ok: true, projectId: converted.id, message: 'Project linked to lead.' };
  } catch {
    return { ok: false, message: 'Could not link the project. Retry.' };
  }
}
