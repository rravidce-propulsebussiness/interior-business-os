import { redirect } from 'next/navigation';
import type { Params } from '../lookups';

export default async function Followups({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ activity: 'followups' });
  if (['today', 'overdue', 'upcoming'].includes(params.queue ?? ''))
    query.set('queue', params.queue!);
  return redirect('/dashboard/crm/leads?' + query.toString() + '#lead-activities');
}
