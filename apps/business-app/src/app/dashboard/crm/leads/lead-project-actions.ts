'use server';

import { z } from 'zod';
import { convertLead } from '../actions';
import { crmServices } from '../service';
import { syncQuotedConstructionTimeline } from '../../finance/quote-construction-handoff';

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
            .select('name,removed_from_workspace').eq('organization_id',s.org)
            .eq('id',quote.project_id).eq('removed_from_workspace',false).maybeSingle();
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

    // A delivery project gets its planned milestones from the customer's
    // current Final quote. Preparing a pending contract does not record
    // customer acceptance, a signed agreement, or a payment.
    let message = 'Project linked to lead.';
    if (s.allowed('contract.create','finance') &&
        s.allowed('project.manage','projects') &&
        s.allowed('quotation.view','quotation')) {
      try {
        const project = await s.client.from('projects').select('customer_id')
          .eq('organization_id',s.org).eq('id',converted.id).maybeSingle();
        if (project.data?.customer_id) {
          const rpc = s.client.rpc.bind(s.client) as unknown as
            (name:string,args:Record<string,unknown>) =>
              Promise<{data:unknown;error:{code?:string;message?:string}|null}>;
          const choices = await rpc('quotation_final_choices',{
            p_org:s.org,p_customer_ids:[project.data.customer_id],
          });
          const choiceObject = choices.data && typeof choices.data==='object'
            && !Array.isArray(choices.data) ? choices.data as Record<string,unknown> : {};
          const quotationId = typeof choiceObject[project.data.customer_id]==='string'
            ? choiceObject[project.data.customer_id] as string : '';
          if (!choices.error && quotationId) {
            const quote = await s.client.from('quotations')
              .select('current_revision_id').eq('organization_id',s.org)
              .eq('customer_id',project.data.customer_id).eq('id',quotationId).maybeSingle();
            const revisionId = quote.data?.current_revision_id;
            if (!quote.error && typeof revisionId==='string') {
              const prepared = await rpc('contract_create_for_project_quote',{
                p_org:s.org,p_project:converted.id,p_revision:revisionId,
              });
              const contractId = z.uuid().safeParse(prepared.data);
              if (!prepared.error && contractId.success) {
                const timeline = await syncQuotedConstructionTimeline(contractId.data);
                if (timeline.created || timeline.reason==='exists') {
                  message = 'Project linked. Planned milestones from its current Final quotation and payment groups are synced. No customer acceptance, signed agreement, or payment was recorded.';
                } else {
                  message = 'Project linked. Planned milestones are ready to sync after the remaining project setup checks.';
                }
              } else if (prepared.error?.code==='42501') {
                message = 'Project linked. An authorized owner must prepare the Final quotation before its milestones can sync.';
              } else {
                message = 'Project linked, but its milestones could not sync yet. Open the project Timeline to retry.';
              }
            }
          }
        }
      } catch {
        // The project conversion has already succeeded. The project page
        // retries the same idempotent timeline sync when an eligible contract exists.
        message = 'Project linked. Its planned milestones will retry syncing when the project opens.';
      }
    } else {
      message = 'Project linked. An authorized owner can prepare its Final quotation and sync the planned milestones.';
    }
    return { ok: true, projectId: converted.id, message };
  } catch {
    return { ok: false, message: 'Could not link the project. Retry.' };
  }
}
