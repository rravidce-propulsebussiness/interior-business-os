import { idSchema } from '@business-os/shared';
import { commercialServices } from '../../commercial/service';
import { QuotationStudioFrame } from '../studio-frame';
import { QuotationStudioStart } from '../studio-start';
import '../clean-create.css';

export const dynamic = 'force-dynamic';

export default async function NewQuotation({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; lead?: string }>;
}) {
  const { customer, lead } = await searchParams;
  const s = await commercialServices('quotation.create', 'quotation', true);
  const [organization, user, industries] = await Promise.all([
    s.repository.organization(s.org),
    s.authorization.requireAuthenticatedUser(),
    s.repository.industries(),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');
  const { data: quoteSettings } = await s.client
    .from('organization_quotation_settings')
    .select('branding')
    .eq('organization_id', s.org)
    .maybeSingle();
  const storedLogo = quoteSettings?.branding && typeof quoteSettings.branding === 'object' &&
    !Array.isArray(quoteSettings.branding) &&
    'logo_data_uri' in quoteSettings.branding
    ? quoteSettings.branding.logo_data_uri : '';
  const companyLogo = typeof storedLogo === 'string' &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(storedLogo)
    ? storedLogo : undefined;


  const { data: rawLeads } = s.allowed('lead.view', 'crm')
    ? await s.client
        .from('leads')
        .select(
          'id,lead_number,name,phone,email,location,project_size,service_type,industry_id',
        )
        .eq('organization_id', s.org)
        .order('created_at', { ascending: false })
        .limit(25)
    : { data: [] };
  // A lead opened from CRM must remain selectable even if it is older
  // than the 25 recent leads in the general chooser.
  const selectedLead = lead && idSchema.safeParse(lead).success &&
    s.allowed('lead.view', 'crm')
    ? (await s.client.from('leads')
        .select('id,lead_number,name,phone,email,location,project_size,service_type,industry_id')
        .eq('organization_id', s.org)
        .eq('id', lead)
        .maybeSingle()).data
    : null;
  const leadChoices = [
    ...(selectedLead ? [selectedLead] : []),
    ...(rawLeads ?? []).filter((item) => item.id !== selectedLead?.id),
  ];
  const leads = leadChoices.map((lead) => ({
    ...lead,
    industryKey:
      industries.find((industry) => industry.id === lead.industry_id)?.key ??
      '',
  }));

  const { data: existingCustomers } = await s.client
    .from('customers')
    .select('id,display_name,phone,email')
    .eq('organization_id', s.org)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(150);
  const { data: existingProjects } = await s.client
    .from('projects')
    .select('id,customer_id,name')
    .eq('organization_id', s.org)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(300);

  return (
    <QuotationStudioFrame companyName={organization.name}
      companyLogo={companyLogo} accountEmail={user.email ?? ''}>
      <div className="qs-clean-create">
        <section className="qs-create-landing" aria-label="Create quotation">
          <div className="qs-landing-copy">
            <p className="qs-landing-eyebrow">Create Quotation</p>
            <h1>Create a Professional Quotation</h1>
            <p>Generate a branded, detailed quotation for your client in minutes.</p>
          </div>
          <div className="qs-landing-photo" aria-hidden="true">
            <span>From Plans<br/>to Possession</span>
          </div>
        </section>
        <QuotationStudioStart
          leads={leads}
          existingCustomers={existingCustomers ?? []}
          existingProjects={existingProjects ?? []}
          industries={industries
            .filter((industry) => industry.status === 'active')
            .map((industry) => ({
              key: industry.key,
              name: industry.name,
            }))}
          defaultCurrency={organization.default_currency || 'INR'}
          initialCustomerId={customer ?? ''}
          initialLeadId={selectedLead?.id ?? ''}
        />
      </div>
    </QuotationStudioFrame>
  );
}
