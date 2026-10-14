import { redirect } from 'next/navigation';

type Params = { status?: string; page?: string };

const allowedStatuses = new Set([
  'awaiting',
  'approved',
  'changes_requested',
  'declined',
]);

/**
 * Legacy CRM quotation-response links continue working. The actual response
 * queue is presented within Quotation Studio, not as a second CRM screen.
 */
export default async function CommercialResponses({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const status =
    params.status === '' ? 'all' :
    params.status && allowedStatuses.has(params.status)
      ? params.status
      : 'awaiting';
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1),
  );
  const query = new URLSearchParams({ response_status: status });
  if (page > 1) query.set('response_page', String(page));
  redirect('/dashboard/quotations?' + query.toString() + '#customer-responses');
}
