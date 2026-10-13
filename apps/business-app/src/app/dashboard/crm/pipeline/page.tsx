import { redirect } from 'next/navigation';
import type { Params } from '../lookups';

/** Legacy sales board URL now opens Board View in the unified CRM Leads page. */
export default async function PipelineRedirect({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of [
    'q', 'stage_id', 'assigned_to', 'source_id', 'branch_id',
    'priority', 'due', 'from', 'until', 'converted', 'lifecycle', 'sort',
    'unassigned', 'page',
  ]) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) query.set(key, value);
  }
  query.set('view', 'board');
  redirect('/dashboard/crm/leads?' + query.toString());
}
