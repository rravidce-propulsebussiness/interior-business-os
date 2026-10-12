import { crmServices } from '../../service';
import { LeadsSectionNav } from '../sections-nav';
import '../leads.css';

export const dynamic = 'force-dynamic';

export default async function ProPulseLeads({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const s = await crmServices('lead.view', true);
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  // RLS + explicit organization scope; only verified ProPulse deliveries are
  // assigned a source_detail beginning with 'propulse:' by the integration.
  // This page never reads the cross-tenant ProPulse marketplace directly.
  const { data, count, error } = await s.client
    .from('leads')
    .select('id,lead_number,name,phone,email,location,service_type,lifecycle,source_detail,created_at', { count: 'exact' })
    .eq('organization_id', s.org)
    .ilike('source_detail', 'propulse:%')
    .order('created_at', { ascending: false })
    .range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error('Could not read the ProPulse lead view');
  const rows = data ?? [];
  return (
    <main id="main-content" className="crm-leads-root">
      <div className="crm-leads-breadcrumb">
        <a href="/dashboard">Workspace</a>
        <span>›</span>
        <a href="/dashboard/crm/leads">CRM Leads</a>
        <span>›</span>
        <strong>ProPulse Leads</strong>
      </div>
      <div className="crm-leads-heading">
        <div>
          <h1>ProPulse leads</h1>
          <p>Keep marketplace enquiries separate from manually added and imported leads.</p>
        </div>
        <a href="/dashboard/crm/leads" className="crm-outline">← All Leads</a>
      </div>
      <LeadsSectionNav active="propulse" />
      <div className="mb-5 grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="text-base font-bold text-blue-950">Secure marketplace delivery</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-800">
            Only leads purchased by or explicitly granted to a ProPulse professional
            should be synced into that professional's authorized Business OS company.
            ProPulse sign-in alone does not authorize receiving another professional's leads.
          </p>
          <p className="mt-3 text-xs font-semibold text-blue-700">
            Automatic delivery is not active until the professional-to-company connection
            and entitlement checks are configured.
          </p>
        </div>
        <div className="flex min-w-48 flex-col justify-center rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <strong className="text-3xl font-bold text-slate-900">{count ?? 0}</strong>
          <span className="mt-2 text-xs font-semibold text-slate-500">Delivered ProPulse leads</span>
        </div>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="ProPulse leads">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <h2 className="text-base font-bold text-slate-900">Marketplace enquiries</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            Current company only
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <h3 className="text-lg font-bold text-slate-900">No ProPulse leads delivered yet</h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
              Once secure delivery is connected, your eligible ProPulse enquiries
              will appear here automatically. Existing CRM records are not shared
              with ProPulse.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr><th className="p-4">Customer</th><th className="p-4">Contact</th>
                  <th className="p-4">Requirement</th><th className="p-4">Location</th>
                  <th className="p-4">Status</th><th className="p-4">Action</th></tr>
              </thead>
              <tbody>{rows.map((lead) => (
                <tr key={lead.id} className="border-t border-slate-100 text-slate-700">
                  <td className="p-4"><strong className="block text-slate-900">{lead.name}</strong>
                    <small className="text-slate-500">{lead.lead_number}</small></td>
                  <td className="p-4">{lead.phone}<span className="block text-xs text-slate-500">{lead.email}</span></td>
                  <td className="p-4">{lead.service_type || '—'}</td>
                  <td className="p-4">{lead.location || '—'}</td>
                  <td className="p-4 capitalize">{lead.lifecycle}</td>
                  <td className="p-4"><a className="font-semibold text-blue-700 underline"
                    href={'/dashboard/crm/leads/' + lead.id}>Open lead →</a></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {(count ?? 0) > 25 && (
          <div className="flex justify-end gap-3 border-t border-slate-100 p-4 text-sm">
            {page > 1 && <a href={'?page=' + (page - 1)} className="rounded-lg border px-4 py-2">Previous</a>}
            {page * 25 < (count ?? 0) && <a href={'?page=' + (page + 1)} className="rounded-lg border px-4 py-2">Next</a>}
          </div>
        )}
      </section>
    </main>
  );
}
