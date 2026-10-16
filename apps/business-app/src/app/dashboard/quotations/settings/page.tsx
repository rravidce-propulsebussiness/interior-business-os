import Link from 'next/link';
import { emptyAddress } from '@business-os/core/commercial';
import { commercialServices } from '../../commercial/service';
import { MasterForm } from '../../commercial/master-form';
export default async function Settings() {
  const s = await commercialServices('settings.manage', 'quotation', true),
    { data, error } = await s.client
      .from('organization_quotation_settings')
      .select('*')
      .eq('organization_id', s.org)
      .maybeSingle();
  if (error) throw new Error('Unable to load quotation settings');
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-6">
      <Link href="/dashboard/quotations">Quotations</Link>
      <div className="mt-5 rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[.16em] text-orange-600">
          Company-owned quotation branding
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
          Logo, Address &amp; Contact Details
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Upload <strong>your company logo</strong> and edit your business name,
          full address, phone, email, tax ID and brochure photographs.
          Every company's information is saved separately and appears in its own quotations.
        </p>
        <p className="mt-3 text-xs font-semibold leading-5 text-orange-800">
          Save these details here. New quotations use them automatically.
          To update an existing draft quotation, open its Client &amp; Project tab
          and select “Apply Saved Branding to This Draft”. Issued PDFs stay unchanged.
        </p>
      </div>
      <div className="mt-5 max-w-2xl">
        <h2 className="text-lg font-extrabold text-slate-950">Company identity and address</h2>
        <p className="mt-1 text-xs text-slate-600">
          Logo files are previewed after selection. You can replace or remove an
          image before saving. Logo and photos together must fit within 190 KB.
        </p>
      </div>
      <MasterForm
        entity="organization_quotation_settings"
        title="Save Company Branding"
        initial={
          data ?? {
            organization_id: s.org,
            version: 1,
            prefix: 'Q',
            validity_days: 30,
            default_terms: '',
            default_customer_notes: '',
            show_quantity: true,
            show_unit_rate: true,
            show_specifications: true,
            branding: {
              name: '',
              address: emptyAddress,
              phone: '',
              email: '',
              tax_identifier: '',
              accent: '#18181b',
              logo_data_uri: '',
              cover_image_data_uri: '',
              detail_image_data_uri: '',
              materials_image_data_uri: '',
            },
          }
        }
        fields={[
          { key: 'prefix', label: 'Quotation number prefix', required: true },
          { key: 'validity_days', label: 'Validity days', type: 'number' },
          {
            key: 'branding.name',
            label: 'Business display name',
            required: true,
          },
          { key: 'branding.phone', label: 'Company contact number', type: 'tel' },
          { key: 'branding.email', label: 'Company contact email', type: 'email' },
          { key: 'branding.tax_identifier', label: 'Tax identifier' },
          ...[
            'line1',
            'line2',
            'city',
            'region',
            'postal_code',
            'country_code',
          ].map((key) => ({
            key: `branding.address.${key}`,
            label: `Business ${key.replaceAll('_', ' ')}`,
          })),
          { key: 'branding.accent', label: 'Accent color (hex)' },
          {
            key: 'branding.logo_data_uri',
            label: 'Upload or replace company logo (PNG/JPEG, up to 130 KB)',
            type: 'file',
          },
          {
            key: 'branding.cover_image_data_uri',
            label: 'Premium PDF cover photograph (PNG/JPEG, up to 62 KB)',
            type: 'file',
            fileMaxBytes: 62000,
          },
          {
            key: 'branding.detail_image_data_uri',
            label: 'Specifications / project photograph (PNG/JPEG, up to 39 KB)',
            type: 'file',
            fileMaxBytes: 39000,
          },
          {
            key: 'branding.materials_image_data_uri',
            label: 'Materials / finishes photograph (PNG/JPEG, up to 42 KB)',
            type: 'file',
            fileMaxBytes: 42000,
          },
          {
            key: 'show_quantity',
            label: 'Show quantities in customer document',
            type: 'checkbox',
          },
          {
            key: 'show_unit_rate',
            label: 'Show unit rates in customer document',
            type: 'checkbox',
          },
          {
            key: 'show_specifications',
            label: 'Show customer specifications',
            type: 'checkbox',
          },
          { key: 'default_terms', label: 'Default terms', type: 'textarea' },
          {
            key: 'default_customer_notes',
            label: 'Default customer notes',
            type: 'textarea',
          },
        ]}
      />
    </main>
  );
}
