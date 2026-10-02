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
      <h1 className="my-6 text-3xl">Quotation settings</h1>
      <p>
        Changes apply to new quotations. Existing revision snapshots keep their
        original branding and terms.
      </p>
      <MasterForm
        entity="organization_quotation_settings"
        title="Save defaults"
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
          { key: 'branding.phone', label: 'Business phone' },
          { key: 'branding.email', label: 'Business email', type: 'email' },
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
            label: 'Logo (PNG/JPEG, up to 130 KB)',
            type: 'file',
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
