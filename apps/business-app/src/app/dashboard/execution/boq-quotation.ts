import 'server-only';

import {
  generateQuotationBoq,
  sftDetailsFromDescriptions,
} from '@business-os/core/construction-boq';

type Reply<T> = PromiseLike<{
  data: T | null;
  error: { code?: string; message?: string } | null;
}>;
/** Minimal untyped query surface; RLS on every table enforces access. */
type Query = {
  select(columns: string): Query;
  insert(values: Record<string, unknown>): Query;
  eq(column: string, value: unknown): Query;
  not(column: string, operator: string, value: unknown): Query;
  order(column: string, options?: Record<string, unknown>): Query;
  limit(count: number): Query;
  maybeSingle<T = Record<string, unknown>>(): Reply<T>;
  single<T = Record<string, unknown>>(): Reply<T>;
} & Reply<Record<string, unknown>[]>;
type Client = {
  from(table: string): Query;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Reply<Record<string, string>>;
};

export type QuotationBoqOutcome =
  | { status: 'created'; id: string }
  | { status: 'exists'; id: string }
  | { status: 'skipped'; reason: string };

/**
 * Create the project's draft construction BOQ from its selected Final
 * floor-wise quotation, once. Structural quantities, steel cut plans and package
 * allowances are generated; staff complete the rest manually. Material rates
 * are not frozen here: the BOQ prices them from the company rate card and the
 * brand/source chosen on the BOQ.
 *
 * Best effort: callers must not fail project creation when this is skipped
 * (no estimate permission, non-construction quote, etc.).
 */
export async function ensureQuotationBoq(
  client: unknown,
  organizationId: string,
  projectId: string,
  revisionId: string,
): Promise<QuotationBoqOutcome> {
  const db = client as Client;
  const existing = await db
    .from('construction_boq_documents')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('project_id', projectId)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existing.error) return { status: 'skipped', reason: 'no_access' };
  if (existing.data?.id) return { status: 'exists', id: existing.data.id };

  // Automatic creation must obey the same explicit Final selection as the
  // manual page. Do not treat "latest quotation" as "Final".
  const project = await db
    .from('projects')
    .select('name,customer_id')
    .eq('organization_id', organizationId)
    .eq('id', projectId)
    .maybeSingle<{ name: string; customer_id: string | null }>();
  if (project.error || !project.data?.customer_id)
    return { status: 'skipped', reason: 'project_unavailable' };
  const revision = await db
    .from('quotation_revisions')
    .select('quotation_id')
    .eq('organization_id', organizationId)
    .eq('id', revisionId)
    .maybeSingle<{ quotation_id: string }>();
  if (revision.error || !revision.data)
    return { status: 'skipped', reason: 'quote_unavailable' };
  const selected = await db.rpc('boq_final_quotation_choices', {
    p_org: organizationId,
    p_customer_ids: [project.data.customer_id],
  });
  if (
    selected.error ||
    selected.data?.[project.data.customer_id] !== revision.data.quotation_id
  )
    return { status: 'skipped', reason: 'final_quote_required' };

  const items = await db
    .from('quotation_items')
    .select('description')
    .eq('organization_id', organizationId)
    .eq('revision_id', revisionId)
    .limit(250);
  if (items.error || !Array.isArray(items.data))
    return { status: 'skipped', reason: 'quote_unreadable' };
  const details = sftDetailsFromDescriptions(
    items.data.map((row) => String(row.description ?? '')),
  );
  if (!details) return { status: 'skipped', reason: 'not_floorwise' };

  // Company structural settings are optional; defaults apply without cost access.
  const rateCard = await db
    .from('construction_boq_rate_cards')
    .select('rates')
    .eq('organization_id', organizationId)
    .maybeSingle<{ rates: { structural?: unknown } | null }>();
  const settings = rateCard.error
    ? undefined
    : rateCard.data?.rates?.structural;

  const generated = generateQuotationBoq({ details, settings });
  if (!generated.lines.length)
    return { status: 'skipped', reason: 'nothing_to_generate' };

  const inserted = await db
    .from('construction_boq_documents')
    .insert({
      organization_id: organizationId,
      project_id: projectId,
      quotation_revision_id: revisionId,
      title: `${project.data?.name ?? 'Project'} · Construction BOQ`.slice(
        0,
        200,
      ),
      status: 'draft',
      currency: 'INR',
      document: {
        items: generated.lines,
        selections: {},
        generator: {
          revisionId,
          generatedAt: new Date().toISOString(),
          settings: generated.settings,
          counts: generated.counts,
          floors: generated.floors,
          warnings: generated.warnings.slice(0, 50),
        },
      },
    })
    .select('id')
    .single<{ id: string }>();
  if (inserted.error?.code === '23505') {
    const raced = await db
      .from('construction_boq_documents')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .limit(1)
      .maybeSingle<{ id: string }>();
    return raced.data?.id
      ? { status: 'exists', id: raced.data.id }
      : { status: 'skipped', reason: 'conflict' };
  }
  if (inserted.error || !inserted.data)
    return { status: 'skipped', reason: 'no_access' };
  return { status: 'created', id: inserted.data.id };
}
