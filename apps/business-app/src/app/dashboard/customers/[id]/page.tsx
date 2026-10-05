import { OriginLeads } from '../../commercial/origin-leads';
import { CustomerStatementLink } from '../../finance/handoff';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { commercialServices } from '../../commercial/service';
import { MasterForm } from '../../commercial/master-form';
export default async function Customer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    s = await commercialServices('customer.view', 'customers', true);
  const { data: c, error } = await s.client
    .from('customers')
    .select('*')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (error || !c) notFound();
  const { data: contacts } = await s.client
    .from('customer_contacts')
    .select('*')
    .eq('organization_id', s.org)
    .eq('customer_id', id)
    .order('name')
    .limit(100);
  const canManage =
    s.allowed('customer.manage', 'quotation') ||
    s.allowed('customer.manage', 'crm');
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-6">
      <Link href="/dashboard/customers">Customers</Link>
      <h1 className="my-6 text-3xl">{c.display_name}</h1>
      <OriginLeads customerId={id} />
      <CustomerStatementLink customerId={id} />
      <Link
        className="my-3 block underline"
        href={`/dashboard/customers/${id}/activity`}
      >
        Customer activity timeline
      </Link>
      <p>
        {c.phone} {c.email}
      </p>
      <Link className="underline" href={`/dashboard/projects?customer=${c.id}`}>
        Projects for this customer
      </Link>
      {(s.allowed('customer.manage', 'quotation') ||
        s.allowed('customer.manage', 'crm')) && (
        <MasterForm
          entity="customers"
          title="Save customer"
          initial={c}
          fields={[
            { key: 'display_name', label: 'Customer name', required: true },
            { key: 'legal_name', label: 'Legal name' },
            { key: 'phone', label: 'Phone' },
            { key: 'secondary_phone', label: 'Secondary phone' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'tax_identifier', label: 'Tax identifier' },
            ...[
              'line1',
              'line2',
              'city',
              'region',
              'postal_code',
              'country_code',
            ].map((key) => ({
              key: `billing_address.${key}`,
              label: `Billing ${key.replaceAll('_', ' ')}`,
            })),
            { key: 'notes', label: 'Internal notes', type: 'textarea' },
            {
              key: 'status',
              label: 'Status',
              options: [
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
          ]}
        />
      )}
      <h2 className="mt-8 text-2xl">Contacts</h2>
      {contacts?.map((contact) => (
        <details className="my-3 rounded border p-3" key={contact.id}>
          <summary>
            {contact.name}
            {contact.is_primary ? ' (primary)' : ''}
          </summary>
          {canManage ? (
            <MasterForm
              entity="customer_contacts"
              initial={contact}
              title="Save contact"
              fields={[
                { key: 'name', label: 'Contact name', required: true },
                { key: 'role', label: 'Role' },
                { key: 'phone', label: 'Phone' },
                { key: 'email', label: 'Email', type: 'email' },
                {
                  key: 'is_primary',
                  label: 'Primary contact',
                  type: 'checkbox',
                },
              ]}
            />
          ) : (
            <p>
              {contact.phone} {contact.email}
            </p>
          )}
        </details>
      ))}
      {canManage && (
        <details className="my-4">
          <summary>Add contact</summary>
          <MasterForm
            entity="customer_contacts"
            initial={{
              organization_id: s.org,
              version: 1,
              customer_id: id,
              name: '',
              role: '',
              phone: '',
              email: '',
              is_primary: false,
            }}
            title="Create contact"
            fields={[
              { key: 'name', label: 'Contact name', required: true },
              { key: 'role', label: 'Role' },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email', type: 'email' },
              { key: 'is_primary', label: 'Primary contact', type: 'checkbox' },
            ]}
          />
        </details>
      )}
    </main>
  );
}
