import 'server-only';

import { activeOrganization, serverServices } from '@business-os/auth/server';
import { createHash } from 'node:crypto';
import { projectTimelineFromQuote } from '@business-os/core/quote-project-timeline';
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
const quoteItemsSchema = z.array(z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
}));

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

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('industry_id')
    .eq('organization_id', org.organizationId)
    .eq('id', projectId)
    .single();
  if (projectError || !project?.industry_id)
    return { created: false, reason: 'quote_incomplete', projectId };
  const { data: industry, error: industryError } = await client
    .from('industries')
    .select('key')
    .eq('id', project.industry_id)
    .single();
  if (industryError || !industry)
    return { created: false, reason: 'quote_incomplete', projectId };
  const { data: lines, error: linesError } = await client
    .from('quotation_items')
    .select('id,name,description')
    .eq('organization_id', org.organizationId)
    .eq('revision_id', parsedContract.revision_id)
    .order('id')
    .limit(250);
  if (linesError || !lines)
    throw new Error('Unable to read the frozen approved quotation');
  const quotedLines = quoteItemsSchema.parse(lines);
  const plan = projectTimelineFromQuote(industry.key, quotedLines);
  if (!plan) {
    return { created: false, reason: 'quote_incomplete', projectId };
  }

  const existing = await client.rpc('construction_project_read', {
    p_organization_id: org.organizationId,
    p_project_id: projectId,
  });
  if (
    !existing.error &&
    existing.data &&
    typeof existing.data === 'object' &&
    'workflow' in existing.data &&
    existing.data.workflow
  ) {
    return { created: false, reason: 'exists', projectId };
  }

  // SQL rechecks the contracted issued revision, manager authorization,
  // industry and exact quote-line fingerprint inside one database transaction.
  // Neither quote acceptance nor commercial agreement creates site progress.
  const quoteHash = createHash('md5')
    .update(quotedLines.map((line) =>
      [line.id, line.name, line.description].join(String.fromCharCode(31)),
    ).join(String.fromCharCode(30)))
    .digest('hex');
  const workflow = await client.rpc('project_quote_timeline_create', {
    p_org: org.organizationId,
    p_contract: id,
    p_input: {
      industry: plan.industry,
      template: plan.template,
      zones: plan.zones,
      stages: plan.stages,
      quote_hash: quoteHash,
    },
  });
  if (workflow.error) {
    if (workflow.error.code === '42501')
      return { created: false, reason: 'manager_required', projectId };
    if (workflow.error.code === '23505')
      return { created: false, reason: 'exists', projectId };
    throw new Error(
      'Agreement created, but quote-derived stage generation failed: ' +
        workflow.error.message,
    );
  }
  return { created: true, reason: 'created', projectId };
}
