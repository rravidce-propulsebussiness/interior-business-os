import Link from 'next/link';
import { crmServices } from '../crm/service';
import { DomainError } from '@business-os/shared';
export async function OriginLeads({
  projectId,
  customerId,
}: {
  projectId?: string;
  customerId?: string;
}) {
  let s;
  try {
    s = await crmServices();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') return null;
    throw error;
  }
  let query = s.client
    .from('leads')
    .select('id,name')
    .eq('organization_id', s.org)
    .order('created_at', { ascending: false })
    .limit(25);
  if (projectId) query = query.eq('converted_project_id', projectId);
  else if (customerId) query = query.eq('converted_customer_id', customerId);
  else return null;
  const { data } = await query;
  return data?.length ? (
    <section className="my-5">
      <h2 className="text-xl font-semibold">Originating lead history</h2>
      {data.map((l) => (
        <Link
          className="mr-4 inline-block underline"
          key={l.id}
          href={'/dashboard/crm/leads/' + l.id}
        >
          {l.name}
        </Link>
      ))}
    </section>
  ) : null;
}
