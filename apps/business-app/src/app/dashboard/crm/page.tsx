import { crmResult } from '@business-os/database/crm';
import Link from 'next/link';
import { crmServices, resultSchema } from './service';
export default async function CrmDashboard() {
  const s = await crmServices('lead.view', true);
  const queues = [
    [
      'Recent leads (7 days)',
      'leads',
      {
        sort: 'newest',
        from: s.recentLeadDate,
      },
      '/dashboard/crm/leads?sort=newest&from=' + s.recentLeadDate,
    ],
    [
      'Open leads',
      'leads',
      { lifecycle: 'open' },
      '/dashboard/crm/leads?lifecycle=open',
    ],
    [
      'Due today',
      'lead_followups',
      { queue: 'today', status: 'pending' },
      '/dashboard/crm/followups?queue=today',
    ],
    [
      'Overdue follow-ups',
      'lead_followups',
      { queue: 'overdue', status: 'pending' },
      '/dashboard/crm/followups?queue=overdue',
    ],
    [
      'Upcoming follow-ups',
      'lead_followups',
      { queue: 'upcoming', status: 'pending' },
      '/dashboard/crm/followups?queue=upcoming',
    ],
    [
      'Unassigned leads',
      'leads',
      { unassigned: true, lifecycle: 'open' },
      '/dashboard/crm/leads?unassigned=true',
    ],
    [
      'Quotation follow-ups',
      'lead_followups',
      { type: 'quotation', status: 'pending' },
      '/dashboard/crm/followups?type=quotation',
    ],
    [
      'Site visits today',
      'site_visits',
      { queue: 'today', status: 'scheduled' },
      '/dashboard/crm/site-visits?queue=today',
    ],
  ] as const;
  const results = await Promise.all(
    queues.map(async ([label, entity, filter, href]) => ({
      label,
      href,
      result: resultSchema.parse(await s.crm.search(entity, filter)),
    })),
  );
  const commercial =
    s.allowed('quotation.customer_response.view', 'quotation') &&
    s.allowed('quotation.view', 'quotation')
      ? await Promise.all(
          ['awaiting', 'approved'].map(async (status) => ({
            status,
            result: resultSchema.parse(
              crmResult(
                await s.client.rpc('quotation_response_queue', {
                  p_organization_id: s.org,
                  p_status: status,
                }),
              ),
            ),
          })),
        )
      : [];
  return (
    <main id="main-content" className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl font-semibold">Sales attention queues</h1>
      <p className="my-3">
        Follow up, capture requirements and move enquiries toward an accepted
        quotation.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((r) => (
          <Link key={r.label} href={r.href} className="rounded border p-5">
            <h2 className="text-xl font-semibold">{r.label}</h2>
            <p className="text-3xl">{r.result.total}</p>
          </Link>
        ))}
        {commercial.map((r) => (
          <Link
            key={r.status}
            href={'/dashboard/crm/commercial?status=' + r.status}
            className="rounded border p-5"
          >
            <h2 className="text-xl">
              {r.status === 'approved'
                ? 'Approved quotations'
                : 'Quotations awaiting response'}
            </h2>
            <p className="text-3xl">{r.result.total}</p>
          </Link>
        ))}
      </div>
      <p className="my-5">
        Accepted quotation amounts are commercial commitments, not collected
        revenue.
      </p>
      <Link className="underline" href="/dashboard/quotations">
        Review quotations and customer responses
      </Link>
    </main>
  );
}
