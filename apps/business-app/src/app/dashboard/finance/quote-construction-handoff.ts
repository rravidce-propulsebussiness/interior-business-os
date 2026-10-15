import 'server-only';

import { activeOrganization, serverServices } from '@business-os/auth/server';
import { constructionPlanFromQuotedDescriptions } from '@business-os/core/quote-construction-handoff';
import { z } from 'zod';

export type QuoteTimelineSync = {
  created: boolean;
  reason: 'created' | 'exists' | 'quote_incomplete' | 'manager_required';
  projectId: string | null;
};

const contractSchema = z.object({
  project_id: z.uuid(),
  revision_id: z.uuid(),
});
const descriptionSchema = z.array(z.object({ description: z.string() }));

/**
 * Idempotent handoff AFTER the canonical approved-quotation contract_create RPC.
 * The signed agreement, design approvals and formal QC remain independent gates.
 * Every stage definition is a planned activity, never an executed task.
 */
export async function syncQuotedConstructionTimeline(
  contractId: string,
): Promise<QuoteTimelineSync> {
  const id = z.uuid().parse(contractId);
  const org = await activeOrganization();
  if (!org) throw new Error('Choose an active organization');
  const services = await serverServices();
  await services.authorization.requireAuthenticatedUser();
  const client = services.client;
  const { data: contract, error: contractError } = await client
    .from('contracts')
    .select('project_id,revision_id')
    .eq('organization_id', org.organizationId)
    .eq('id', id)
    .maybeSingle();
  if (contractError || !contract)
    throw new Error('Accepted quotation agreement was not found');
  const parsedContract = contractSchema.parse(contract);
  const projectId = parsedContract.project_id;

  const { data: lines, error: linesError } = await client
    .from('quotation_items')
    .select('description')
    .eq('organization_id', org.organizationId)
    .eq('revision_id', parsedContract.revision_id)
    .limit(250);
  if (linesError || !lines)
    throw new Error('Unable to read the frozen approved quotation');
  const descriptions = descriptionSchema.parse(lines).map((line) => line.description);
  const plan = constructionPlanFromQuotedDescriptions(descriptions);
  if (!plan) {
    return { created: false, reason: 'quote_incomplete', projectId };
  }

  const existing = await client.rpc('construction_project_read', {
    p_organization_id: org.organizationId,
    p_project_id: projectId,
  });
  if (!existing.error && existing.data &&
      typeof existing.data === 'object' &&
      'workflow' in existing.data && existing.data.workflow) {
    return { created: false, reason: 'exists', projectId };
  }

  // The quote creator may have Finance permission but not project-management
  // access. Never elevate a financial employee to engineer/manager privileges.
  const siteInit = await client.rpc('project_site_command', {
    p_organization_id: org.organizationId,
    p_project_id: projectId,
    p_action: 'initialize',
    p_input: {},
  });
  if (siteInit.error) {
    if (siteInit.error.code === '42501')
      return { created: false, reason: 'manager_required', projectId };
    throw new Error('Cannot initialize site from approved quote: ' + siteInit.error.message);
  }

  const workflow = await client.rpc('construction_project_command', {
    p_organization_id: org.organizationId,
    p_project_id: projectId,
    p_action: 'workflow_create',
    p_input: {
      template: plan.template,
      floors: plan.floors,
      stages: plan.stages,
    },
  });
  if (workflow.error) {
    // Two simultaneous approved-quote handoffs may initialize the same project.
    // Existing snapshot wins; never overwrite it with later catalog updates.
    if (workflow.error.code === '23505') {
      const again = await client.rpc('construction_project_read', {
        p_organization_id: org.organizationId,
        p_project_id: projectId,
      });
      if (!again.error && again.data &&
          typeof again.data === 'object' &&
          'workflow' in again.data && again.data.workflow) {
        return { created: false, reason: 'exists', projectId };
      }
    }
    if (workflow.error.code === '42501')
      return { created: false, reason: 'manager_required', projectId };
    throw new Error('Agreement created, but quoted stage initialization failed: ' + workflow.error.message);
  }
  return { created: true, reason: 'created', projectId };
}
