import {
  commercialSearchResultSchema,
  emptyAddress,
  searchSchema,
} from '@business-os/core/commercial';
import { commercialServices } from '../commercial/service';
import { MasterForm } from '../commercial/master-form';
import { SearchList } from '../commercial/list';
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams,
    filter = searchSchema.parse({
      query: params.q ?? '',
      page: Number(params.page ?? 1),
      status: '',
      parent_id: null,
    });
  const s = await commercialServices('customer.view', 'customers', true),
    result = commercialSearchResultSchema.parse(
      await s.commercial.search(s.org, 'customers', filter.query, filter.page),
    );
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-6">
      <SearchList
        title="Customers"
        path="/dashboard/customers"
        query={filter.query}
        page={filter.page}
        total={result.total}
        rows={result.rows.map((r) => ({
          id: r.id,
          label: r.display_name ?? '',
          detail: r.status,
        }))}
      />
      {(s.allowed('customer.create', 'quotation') ||
        s.allowed('customer.create', 'crm')) && (
        <details className="my-6">
          <summary>Create customer</summary>
          <MasterForm
            entity="customers"
            title="Create customer"
            initial={{
              organization_id: s.org,
              version: 1,
              customer_type: 'individual',
              display_name: '',
              legal_name: '',
              phone: '',
              secondary_phone: '',
              email: '',
              tax_identifier: '',
              billing_address: emptyAddress,
              notes: '',
              status: 'active',
            }}
            fields={[
              { key: 'display_name', label: 'Customer name', required: true },
              {
                key: 'customer_type',
                label: 'Type',
                options: [
                  { value: 'individual', label: 'Individual' },
                  { value: 'business', label: 'Business' },
                ],
              },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email', type: 'email' },
              { key: 'notes', label: 'Internal notes', type: 'textarea' },
            ]}
          />
        </details>
      )}
    </main>
  );
}
