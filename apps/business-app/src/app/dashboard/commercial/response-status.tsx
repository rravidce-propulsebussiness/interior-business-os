import Link from 'next/link';
import { commercialServices } from './service';
import { resultSchema } from '../crm/service';
import { crmResult } from '@business-os/database/crm';
import { DomainError } from '@business-os/shared';
export async function CommercialResponseStatus({
  projectId,
}: {
  projectId: string;
}) {
  let s;
  try {
    s = await commercialServices(
      'quotation.customer_response.view',
      'quotation',
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') return null;
    throw error;
  }
  if (!s.allowed('quotation.view', 'quotation')) return null;
  const result = resultSchema.parse(
    crmResult(
      await s.client.rpc('quotation_response_queue', {
        p_organization_id: s.org,
        p_project_id: projectId,
      }),
    ),
  );
  return (
    <section className="my-5">
      <h2 className="text-xl font-semibold">Commercial status</h2>
      {!result.rows.length && <p>No issued quotation yet.</p>}
      {result.rows.map((r) => (
        <p key={String(r.id)}>
          <Link
            className="underline"
            href={'/dashboard/quotations/' + String(r.id)}
          >
            {String(r.quotation_number)} Rev {String(r.revision_number)}
          </Link>{' '}
          —{' '}
          {r.response_status === 'approved'
            ? 'Commercially accepted; ready for future execution/billing handoff'
            : String(r.response_status).replaceAll('_', ' ')}
        </p>
      ))}
      {result.total > 25 && (
        <Link href="/dashboard/crm/commercial">
          View commercial response queue
        </Link>
      )}
    </section>
  );
}
