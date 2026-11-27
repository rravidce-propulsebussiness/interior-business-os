import { automationServices } from '../automations/service';
import { loadMetaLeadView } from '../crm/leads/meta-lead-view';
import { MetaLeadPanel } from '../crm/leads/meta-lead-panel';
import '../crm/leads/leads.css';
import '../crm/leads/leads-premium.css';

export const dynamic = 'force-dynamic';

export default async function MetaLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ meta?: string }>;
}) {
  const query = await searchParams;
  const services = await automationServices('automation.view', true);
  const canManage = services.context.grants.some(
    (grant) => grant.permission === 'crm.source.manage',
  );
  const canAutomate = services.context.grants.some(
    (grant) => grant.permission === 'automation.manage',
  );
  const view = await loadMetaLeadView({
    organizationId: services.context.organizationId,
    canManage,
    canAutomate,
    ...(query.meta ? { notice: query.meta } : {}),
  });

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-6xl space-y-5 p-6"
    >
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a24b3c]">
          Meta Lead Ads
        </p>
        <h1 className="text-3xl font-semibold text-[#2c1a1d]">
          Facebook & Instagram lead forms
        </h1>
        <p className="max-w-3xl text-sm text-[#6f5b5d]">
          Connect Pages and lead forms here. New leads will arrive in the CRM,
          while WhatsApp follow-up is configured separately from this page.
        </p>
      </header>
      {/* The panel's styles and colour variables are scoped to .crm-leads-root. */}
      <div className="crm-leads-root" style={{ minHeight: 0, padding: 0 }}>
        <MetaLeadPanel view={view} />
      </div>
    </main>
  );
}
