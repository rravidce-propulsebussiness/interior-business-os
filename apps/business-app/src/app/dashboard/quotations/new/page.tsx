import Link from 'next/link';
import { commercialServices } from '../../commercial/service';
import { QuotationStudioFrame } from '../studio-frame';
import { QuotationStudioStart } from '../studio-start';

export const dynamic = 'force-dynamic';

export default async function NewQuotation() {
  const s = await commercialServices('quotation.create', 'quotation', true);
  const [organization, user, industries] = await Promise.all([
    s.repository.organization(s.org),
    s.authorization.requireAuthenticatedUser(),
    s.repository.industries(),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');

  const { data: rawLeads } = s.allowed('lead.view', 'crm')
    ? await s.client
        .from('leads')
        .select('id,lead_number,name,phone,email,location,project_size,service_type,industry_id')
        .eq('organization_id', s.org)
        .order('created_at', { ascending: false })
        .limit(25)
    : { data: [] };
  const leads = (rawLeads ?? []).map((lead) => ({
    ...lead,
    industryKey: industries.find((industry) => industry.id === lead.industry_id)?.key ?? '',
  }));

  return (
    <QuotationStudioFrame
      companyName={organization.name}
      accountEmail={user.email ?? ''}
    >
      <div className="qs-heading">
        <div className="qs-heading-label">
          <span className="qs-heading-icon">▤</span>
          <div>
            <h1>Quotation Studio</h1>
            <p>Create a polished, company-branded quotation in minutes.</p>
          </div>
        </div>
        <div className="qs-toolbar">
          <Link href="/dashboard/quotations" className="qs-btn">
            ← All quotations
          </Link>
          {s.allowed('settings.manage', 'quotation') && (
            <Link
              href="/dashboard/quotations/settings"
              className="qs-btn ghost"
            >
              Company branding
            </Link>
          )}
        </div>
      </div>

      <div className="qs-stepper" aria-label="Quotation creation steps">
        {[
          'Client & Project',
          'Quote Builder',
          'Specifications & Files',
          'Preview & Share',
        ].map((title, index) => (
          <div
            key={title}
            className={'qs-step' + (index === 0 ? ' selected' : '')}
          >
            <b>{index + 1}</b>
            <span>
              <strong>0{index + 1}</strong>
              <small>{title}</small>
            </span>
          </div>
        ))}
      </div>

      <div className="qs-create-grid">
        <QuotationStudioStart
          leads={leads}
          industries={industries
            .filter((industry) => industry.status === 'active')
            .map((industry) => ({
              key: industry.key,
              name: industry.name,
            }))}
          defaultCurrency={organization.default_currency || 'INR'}
        />
        <aside className="qs-editor">
          <div className="qs-create-hero">
            <div
              className="qs-selected-pill"
              style={{
                display: 'inline-block',
                background: '#ffffff26',
                color: 'white',
              }}
            >
              PROPOSAL PREVIEW
            </div>
            <h2 style={{ marginTop: 25 }}>
              Beautiful proposals. Your brand, your business.
            </h2>
            <p>
              Construction estimates, interior BOQs and supporting PDFs — all in
              one branded quotation workspace. Your customer receives your
              company name, not another company&apos;s identity.
            </p>
            <div
              style={{
                marginTop: 30,
                padding: 20,
                borderRadius: 11,
                background: '#ffffff14',
                border: '1px solid #ffffff32',
              }}
            >
              <strong style={{ fontSize: 17 }}>{organization.name}</strong>
              <div
                style={{ height: 2, background: '#7cb3ff', margin: '16px 0' }}
              />
              <p
                style={{
                  letterSpacing: '.15em',
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                PROJECT QUOTATION
              </p>
              <p>Client details · Price breakdown · Specifications · Terms</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                {['L × B / SFT', 'Custom BOQ', 'PDF Annexures'].map((text) => (
                  <span
                    key={text}
                    style={{
                      border: '1px solid #ffffff38',
                      borderRadius: 6,
                      fontSize: 10,
                      padding: '7px 9px',
                    }}
                  >
                    {text}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="qs-card">
            <h2>What happens next?</h2>
            <div className="qs-info-box">
              01 · Add floor-wise area or room-wise item rates.
            </div>
            <div className="qs-info-box" style={{ marginTop: 9 }}>
              02 · Specify your own materials, brands, warranties and scope.
            </div>
            <div className="qs-info-box" style={{ marginTop: 9 }}>
              03 · Preview, attach PDF schedules, issue and share with the
              client.
            </div>
          </div>
        </aside>
      </div>
    </QuotationStudioFrame>
  );
}
