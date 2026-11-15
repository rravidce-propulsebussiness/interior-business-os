'use server';

import { z } from 'zod';
import { crmServices } from '../crm/service';
import { openOrCreateWonLeadProject } from '../crm/leads/lead-project-actions';

const requestSchema = z
  .object({
    leadId: z.uuid(),
    projectName: z.string().trim().min(2).max(200),
  })
  .strict();

/** Create/link an existing Won lead's project without leaving the invoice.
 * Reuses the ordinary CRM conversion and its atomic database uniqueness guards.
 */
export async function createWonLeadInvoiceProject(input: unknown): Promise<{
  ok: boolean;
  projectId?: string;
  customerId?: string;
  message: string;
}> {
  const request = requestSchema.safeParse(input);
  if (!request.success)
    return { ok: false, message: 'Enter a project name (2–200 characters).' };
  try {
    const services = await crmServices('lead.convert');
    const { data: lead, error } = await services.client
      .from('leads')
      .select('id,version,lifecycle,converted_project_id,converted_customer_id')
      .eq('organization_id', services.org)
      .eq('id', request.data.leadId)
      .maybeSingle();
    if (error || !lead)
      return { ok: false, message: 'This lead could not be found.' };
    if (!lead.converted_project_id && lead.lifecycle !== 'won')
      return { ok: false, message: 'Only Won leads can become projects.' };

    const result = await openOrCreateWonLeadProject({
      leadId: lead.id,
      version: lead.version,
      projectName: request.data.projectName,
    });
    if (!result.ok || !result.projectId)
      return { ok: false, message: result.message };

    // The conversion may already have existed or completed in this call.
    // Read the authoritative customer link, not any caller-supplied ID.
    const checked = await services.client
      .from('leads')
      .select('converted_project_id,converted_customer_id')
      .eq('organization_id', services.org)
      .eq('id', lead.id)
      .maybeSingle();
    if (
      checked.error ||
      !checked.data ||
      checked.data.converted_project_id !== result.projectId
    ) {
      return {
        ok: false,
        message:
          'The project was linked. Refresh the invoice to update the client.',
      };
    }
    return {
      ok: true,
      projectId: result.projectId,
      ...(checked.data.converted_customer_id
        ? { customerId: checked.data.converted_customer_id }
        : {}),
      message: 'Project created and linked. Continue preparing your invoice.',
    };
  } catch {
    return {
      ok: false,
      message: 'Unable to create the project. Please retry.',
    };
  }
}
