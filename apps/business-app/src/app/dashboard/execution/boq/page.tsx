import { effectiveRates, type Rate } from '../boq-pricing';
import { executionServices } from '../service';
import type { SupabaseClient } from '@business-os/database';
import { BoqWorkspace } from '../boq-workspace';
import { parseSftEstimate } from '@business-os/core/sft-quotation';
import type { SftEstimateDetails } from '@business-os/core/sft-quotation';
import {
  chooseProjectQuote,
  projectQuoteLabel,
  type ProjectQuoteCandidate,
} from '../boq-project-quote';

export const dynamic = 'force-dynamic';

export default async function ManualBoqPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; project?: string }>;
}) {
  const query = await searchParams;
  const s = await executionServices('estimate.view', true);
  const db = s.client as unknown as SupabaseClient;
  const [documentsResult, projectsResult, ratesResult] = await Promise.all([
    db
      .from('construction_boq_documents')
      .select(
        'id,title,status,project_id,quotation_revision_id,currency,version,document,updated_at',
      )
      .eq('organization_id', s.org)
      .order('updated_at', { ascending: false })
      .limit(100),
    // Real projects only: quotation containers for leads that are not won
    // yet (sales prospects) and removed projects are not BOQ projects.
    db
      .from('projects')
      .select('id,name,code,customer_id')
      .eq('organization_id', s.org)
      .eq('is_sales_prospect', false)
      .eq('removed_from_workspace', false)
      .order('updated_at', { ascending: false })
      .limit(200),
    s.allowed('estimate.view_cost')
      ? db
          .from('construction_boq_rate_cards')
          .select('rates')
          .eq('organization_id', s.org)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [documentsResult, projectsResult, ratesResult])
    if (result.error)
      throw new Error('BOQ workspace is temporarily unavailable.');
  const projects = (projectsResult.data || []) as {
    id: string;
    name: string;
    code: string;
    customer_id: string | null;
  }[];
  const projectIds = projects.map((project) => project.id);
  const customerIds = [
    ...new Set(
      projects
        .map((project) => project.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [quotationsResult, customersResult, finalResult] = await Promise.all([
    projectIds.length
      ? db
          .from('quotations')
          .select(
            'id,project_id,customer_id,quotation_number,current_revision_id,status,created_at',
          )
          .eq('organization_id', s.org)
          .in('project_id', projectIds)
          .neq('status', 'cancelled')
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? db
          .from('customers')
          .select('id,display_name')
          .eq('organization_id', s.org)
          .in('id', customerIds)
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? (
          db.rpc.bind(db) as unknown as (
            name: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: unknown }>
        )('quotation_final_choices', {
          p_org: s.org,
          p_customer_ids: customerIds,
        })
      : Promise.resolve({ data: {}, error: null }),
  ]);
  if (quotationsResult.error || customersResult.error)
    throw new Error('Project quotations could not be loaded for the BOQ.');
  const finalByCustomer =
    !finalResult.error &&
    finalResult.data &&
    typeof finalResult.data === 'object' &&
    !Array.isArray(finalResult.data)
      ? (finalResult.data as Record<string, string>)
      : {};
  const quotations = (quotationsResult.data || []) as {
    id: string;
    project_id: string;
    customer_id: string;
    quotation_number: string;
    current_revision_id: string | null;
    status: string;
    created_at: string;
  }[];
  const currentRevisionIds = quotations
    .map((quotation) => quotation.current_revision_id)
    .filter((id): id is string => Boolean(id));
  const revisionsResult = currentRevisionIds.length
    ? await db
        .from('quotation_revisions')
        .select('id,revision_number,status')
        .eq('organization_id', s.org)
        .in('id', currentRevisionIds)
        .limit(500)
    : { data: [], error: null };
  if (revisionsResult.error)
    throw new Error('Project quotations could not be loaded for the BOQ.');
  const revisionById = new Map(
    (
      (revisionsResult.data || []) as {
        id: string;
        revision_number: number;
        status: string;
      }[]
    ).map((revision) => [revision.id, revision]),
  );
  const candidates: ProjectQuoteCandidate[] = quotations.map((quotation) => {
    const revision = quotation.current_revision_id
      ? revisionById.get(quotation.current_revision_id)
      : undefined;
    return {
      quotationId: quotation.id,
      projectId: quotation.project_id,
      customerId: quotation.customer_id,
      quotationNumber: quotation.quotation_number,
      revisionId: revision?.id ?? null,
      revisionNumber: revision?.revision_number ?? 1,
      status: quotation.status,
      revisionStatus: revision?.status ?? 'cancelled',
      createdAt: quotation.created_at,
    };
  });
  const chosen = projects.flatMap((project) => {
    const pick = chooseProjectQuote(
      project.id,
      project.customer_id,
      candidates,
      finalByCustomer,
    );
    return pick ? [{ project, ...pick }] : [];
  });
  const revisionIds = chosen.map(({ quote }) => quote.revisionId!);
  const quoteLinesResult = revisionIds.length
    ? await db
        .from('quotation_items')
        .select('id,revision_id,description,area_snapshot,snapshot')
        .eq('organization_id', s.org)
        .in('revision_id', revisionIds)
        .order('sort_order')
        .limit(1000)
    : { data: [], error: null };
  if (quoteLinesResult.error)
    throw new Error('Quotation items could not be loaded for the BOQ.');
  const customerNames = new Map(
    (
      (customersResult.data || []) as { id: string; display_name: string }[]
    ).map((customer) => [customer.id, customer.display_name]),
  );
  const linesByRevision = new Map<
    string,
    {
      id: string;
      name: string;
      description: string;
      quantity: string;
      unit: string;
      amount: number;
      area: string;
    }[]
  >();
  const scheduleByRevision = new Map<string, SftEstimateDetails>();
  for (const line of quoteLinesResult.data || []) {
    const schedule = parseSftEstimate(String(line.description || ''));
    if (schedule) {
      // The floor-wise schedule drives the generated BOQ; it is not a
      // separate priced line in the quote line picker.
      if (!scheduleByRevision.has(line.revision_id))
        scheduleByRevision.set(line.revision_id, schedule);
      continue;
    }
    const list = linesByRevision.get(line.revision_id) || [];
    const snapshot = line.snapshot || {};
    const amount = Number(
      snapshot.final_amount ?? snapshot.effective_amount ?? 0,
    );
    list.push({
      id: line.id,
      name: snapshot.name || line.description || 'Quoted item',
      description: line.description || '',
      quantity: snapshot.quantity || '0',
      unit: snapshot.unit?.label || snapshot.unit?.key || '',
      amount: Number.isFinite(amount) ? amount : 0,
      area: line.area_snapshot?.name || '',
    });
    linesByRevision.set(line.revision_id, list);
  }
  const quotes = chosen.map(({ project, quote, isFinal }) => {
    const schedule = scheduleByRevision.get(quote.revisionId!) ?? null;
    return {
      id: quote.revisionId!,
      projectId: project.id,
      isFinal,
      label: projectQuoteLabel({
        customerName: project.customer_id
          ? (customerNames.get(project.customer_id) ?? null)
          : null,
        packageName: schedule?.package?.name ?? null,
        quotationNumber: quote.quotationNumber,
        revisionNumber: quote.revisionNumber,
        isFinal,
      }),
      lines: linesByRevision.get(quote.revisionId!) || [],
      schedule,
    };
  });
  // Groups not saved on the rate card yet use the default prices.
  const rates = effectiveRates(
    (ratesResult.data?.rates?.items || []) as Rate[],
  );
  const structural = (ratesResult.data?.rates?.structural ?? null) as Record<
    string,
    number
  > | null;
  return (
    <BoqWorkspace
      documents={documentsResult.data || []}
      projects={projects.map((project) => ({
        ...project,
        customerName: project.customer_id
          ? (customerNames.get(project.customer_id) ?? null)
          : null,
      }))}
      quotes={quotes}
      rates={rates}
      structural={structural}
      defaultUnit={
        ratesResult.data?.rates?.preferences?.lengthUnit === 'ft' ? 'ft' : 'm'
      }
      initialOpenId={query.open ?? null}
      initialProjectId={query.project ?? null}
      canEdit={s.allowed('estimate.edit')}
      canCreate={s.allowed('estimate.create')}
      canViewCost={s.allowed('estimate.view_cost')}
    />
  );
}
