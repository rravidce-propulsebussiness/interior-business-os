import { executionServices } from '../service';
import type { SupabaseClient } from '@business-os/database';
import { BoqWorkspace } from '../boq-workspace';
import { parseSftEstimate } from '@business-os/core/sft-quotation';
import type { SftEstimateDetails } from '@business-os/core/sft-quotation';

export const dynamic = 'force-dynamic';

export default async function ManualBoqPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; project?: string }>;
}) {
  const query = await searchParams;
  const s = await executionServices('estimate.view', true);
  const db = s.client as unknown as SupabaseClient;
  const [documentsResult, projectsResult, revisionsResult, ratesResult] =
    await Promise.all([
      db
        .from('construction_boq_documents')
        .select(
          'id,title,status,project_id,quotation_revision_id,currency,version,document,updated_at',
        )
        .eq('organization_id', s.org)
        .order('updated_at', { ascending: false })
        .limit(100),
      db
        .from('projects')
        .select('id,name,code')
        .eq('organization_id', s.org)
        .order('updated_at', { ascending: false })
        .limit(200),
      db
        .from('quotation_revisions')
        .select(
          'id,quotation_id,project_id,revision_number,status,currency,totals',
        )
        .eq('organization_id', s.org)
        .in('status', ['issued', 'draft'])
        .order('updated_at', { ascending: false })
        .limit(100),
      s.allowed('estimate.view_cost')
        ? db
            .from('construction_boq_rate_cards')
            .select('rates')
            .eq('organization_id', s.org)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  for (const result of [
    documentsResult,
    projectsResult,
    revisionsResult,
    ratesResult,
  ])
    if (result.error)
      throw new Error('BOQ workspace is temporarily unavailable.');
  const revisions = revisionsResult.data || [];
  const revisionIds = revisions.map((revision: { id: string }) => revision.id);
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
  const projects = projectsResult.data || [];
  const projectMap = new Map(
    projects.map((project: { id: string; name: string }) => [
      project.id,
      project.name,
    ]),
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
  const quotes = revisions.map(
    (revision: {
      id: string;
      project_id: string;
      revision_number: number;
      status: string;
      currency: string;
    }) => ({
      id: revision.id,
      projectId: revision.project_id,
      label: `${projectMap.get(revision.project_id) || 'Project'} · Quote v${revision.revision_number} · ${revision.status}`,
      lines: linesByRevision.get(revision.id) || [],
      schedule: scheduleByRevision.get(revision.id) ?? null,
    }),
  );
  const rates = (ratesResult.data?.rates?.items || []) as {
    key: string;
    label: string;
    unit: string;
    rate: number;
    category: 'material' | 'labour' | 'other';
    material?: string;
    variant?: string;
    isDefault?: boolean;
  }[];
  const structural = (ratesResult.data?.rates?.structural ?? null) as Record<
    string,
    number
  > | null;
  return (
    <BoqWorkspace
      documents={documentsResult.data || []}
      projects={projectsResult.data || []}
      quotes={quotes}
      rates={rates}
      structural={structural}
      initialOpenId={query.open ?? null}
      initialProjectId={query.project ?? null}
      canEdit={s.allowed('estimate.edit')}
      canCreate={s.allowed('estimate.create')}
      canViewCost={s.allowed('estimate.view_cost')}
    />
  );
}
