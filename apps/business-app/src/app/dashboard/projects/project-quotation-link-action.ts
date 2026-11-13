'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

type Result = { saved: boolean; message: string };
const ids = z.object({ projectId: z.uuid(), quotationId: z.uuid() }).strict();

/** Link an existing quote to the converted lead behind this project. The quote
 * and its sales prospect remain intact; only the existing CRM association is
 * added, so no quote, milestone or project record is duplicated. */
export async function linkSavedQuotationToProject(
  input: unknown,
): Promise<Result> {
  try {
    const { projectId, quotationId } = ids.parse(input);
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const active = await activeOrganization();
    if (!active) throw new Error('Select a company.');
    const org = active.organizationId;
    for (const permission of [
      'project.manage',
      'quotation.create',
      'quotation.view',
      'lead.view',
    ]) {
      await services.authorization.requirePermission(org, permission);
    }

    const projectResult = await services.client
      .from('projects')
      .select(
        'id,customer_id,industry_id,status,is_sales_prospect,removed_from_workspace',
      )
      .eq('organization_id', org)
      .eq('id', projectId)
      .maybeSingle();
    const project = projectResult.data;
    if (
      projectResult.error ||
      !project ||
      !project.customer_id ||
      project.status !== 'active' ||
      project.is_sales_prospect ||
      project.removed_from_workspace
    ) {
      throw new Error('This active customer project is unavailable.');
    }
    const contractResult = await services.client
      .from('contracts')
      .select('id')
      .eq('organization_id', org)
      .eq('project_id', projectId)
      .in('status', ['pending', 'active', 'on_hold'])
      .limit(1);
    if (contractResult.error)
      throw new Error('Could not verify this project’s agreement status.');
    if (contractResult.data?.length)
      throw new Error('This project already has a current agreement.');

    const leadResult = await services.client
      .from('leads')
      .select('id,lifecycle,converted_at')
      .eq('organization_id', org)
      .eq('converted_project_id', projectId)
      .eq('lifecycle', 'won')
      .not('converted_at', 'is', null)
      .limit(2);
    if (leadResult.error || leadResult.data?.length !== 1) {
      throw new Error(
        'A single converted Won lead is required to link a saved quotation.',
      );
    }
    const lead = leadResult.data[0]!;

    const quoteResult = await services.client
      .from('quotations')
      .select('id,customer_id,project_id,status,current_revision_id')
      .eq('organization_id', org)
      .eq('id', quotationId)
      .maybeSingle();
    const quote = quoteResult.data;
    if (
      quoteResult.error ||
      !quote ||
      quote.customer_id !== project.customer_id ||
      !quote.project_id ||
      !quote.current_revision_id ||
      !['draft', 'issued'].includes(quote.status)
    ) {
      throw new Error(
        'Choose an active quotation saved for this project customer.',
      );
    }
    const revisionResult = await services.client
      .from('quotation_revisions')
      .select('id,quotation_id,status')
      .eq('organization_id', org)
      .eq('id', quote.current_revision_id)
      .maybeSingle();
    if (
      revisionResult.error ||
      !revisionResult.data ||
      revisionResult.data.quotation_id !== quote.id ||
      revisionResult.data.status !== quote.status
    ) {
      throw new Error('This quotation has no matching current revision.');
    }
    const revisionContract = await services.client
      .from('contracts')
      .select('id')
      .eq('organization_id', org)
      .eq('revision_id', quote.current_revision_id)
      .in('status', ['pending', 'active', 'on_hold'])
      .limit(1);
    if (revisionContract.error)
      throw new Error('Could not verify this quotation’s agreement status.');
    if (revisionContract.data?.length)
      throw new Error('This quotation already has a current agreement.');
    const sourceResult = await services.client
      .from('projects')
      .select(
        'id,customer_id,industry_id,is_sales_prospect,status,removed_from_workspace',
      )
      .eq('organization_id', org)
      .eq('id', quote.project_id)
      .maybeSingle();
    const source = sourceResult.data;
    if (
      sourceResult.error ||
      !source ||
      source.customer_id !== project.customer_id ||
      source.industry_id !== project.industry_id ||
      !source.is_sales_prospect ||
      source.status !== 'active' ||
      source.removed_from_workspace
    ) {
      throw new Error(
        'This quotation does not belong to a matching saved sales prospect for this project.',
      );
    }

    const { error } = await services.client.rpc('lead_quotation_link', {
      p_organization_id: org,
      p_lead_id: lead.id,
      p_quotation_id: quote.id,
      p_project_id: quote.project_id,
    });
    if (error) throw new Error(error.message.slice(0, 220));

    for (const path of ['', '/timeline', '/milestones', '/documents']) {
      revalidatePath('/dashboard/projects/' + projectId + path);
    }
    revalidatePath('/dashboard/quotations');
    return {
      saved: true,
      message:
        'Saved quotation linked to this project. Its terms and payment groups were left unchanged.',
    };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error
          ? error.message
          : 'Unable to link the saved quotation.',
    };
  }
}
