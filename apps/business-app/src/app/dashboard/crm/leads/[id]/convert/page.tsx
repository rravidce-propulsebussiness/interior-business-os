import { notFound } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { commercialSearchResultSchema } from '@business-os/core/commercial';
import { createQuotationRepository } from '@business-os/database/quotations';
import { crmServices } from '../../../service';
import { pageNumber, type Params } from '../../../lookups';
import { MasterForm } from '../../../../commercial/master-form';
import { convertLead } from '../../../actions';
import { Pagination } from '../../../pagination';
export default async function Convert({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await params,
    p = await searchParams,
    s = await crmServices('lead.convert', true);
  const { data: l } = await s.client
    .from('leads')
    .select('*')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (!l) notFound();
  const commercial = createQuotationRepository(s.client);
  const matches = z
    .object({
      customers: z.array(z.object({ id: z.uuid(), display_name: z.string() })),
      leads: z.array(z.object({ id: z.uuid(), name: z.string() })),
    })
    .parse(await s.crm.duplicates(l.phone, l.email));
  const customers = commercialSearchResultSchema.parse(
    await commercial.search(
      s.org,
      'customers',
      p.q ?? '',
      pageNumber(p.page),
      'active',
    ),
  );
  const projects = p.customer
    ? commercialSearchResultSchema.parse(
        await commercial.search(
          s.org,
          'projects',
          p.project_q ?? '',
          pageNumber(p.project_page),
          'active',
          p.customer,
        ),
      )
    : null;
  return (
    <main id="main-content" className="mx-auto max-w-4xl p-6">
      <h1 className="text-3xl font-semibold">Convert {l.name}</h1>
      {l.converted_at ? (
        <Link href={'/dashboard/projects/' + l.converted_project_id}>
          Already converted — open project
        </Link>
      ) : (
        <>
          <h2 className="mt-5 text-xl">Possible existing customer matches</h2>
          {!matches.customers.length && <p>No matching customer found.</p>}
          <ul>
            {matches.customers.map((c) => (
              <li key={c.id}>
                <Link className="underline" href={'?customer=' + c.id}>
                  {c.display_name} — select
                </Link>
              </li>
            ))}
          </ul>
          <form className="my-5 flex flex-wrap gap-3">
            <label>
              Search customer{' '}
              <input
                name="q"
                defaultValue={p.q}
                className="rounded border p-2"
              />
            </label>
            <button className="rounded border p-2">Search</button>
          </form>
          <ul>
            {customers.rows.map((c) => (
              <li key={c.id}>
                <Link className="underline" href={'?customer=' + c.id}>
                  {c.display_name}
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            path={'/dashboard/crm/leads/' + id + '/convert'}
            params={p}
            page={pageNumber(p.page)}
            total={customers.total}
          />
          {p.customer && (
            <form className="my-5">
              <input type="hidden" name="customer" value={p.customer} />
              <label>
                Search this customer&apos;s projects{' '}
                <input name="project_q" className="rounded border p-2" />
              </label>
              <button className="rounded border p-2">Search projects</button>
            </form>
          )}
          {projects && (
            <Pagination
              path={'/dashboard/crm/leads/' + id + '/convert'}
              params={p}
              pageKey="project_page"
              page={pageNumber(p.project_page)}
              total={projects.total}
            />
          )}
          <p>
            Existing customer data is preserved. Creating a new project copies
            the lead&apos;s site, branch, industry and salesperson.
          </p>
          <MasterForm
            title="Convert lead"
            submitAction={convertLead}
            successPath="/dashboard/projects/:id"
            initial={{
              id,
              version: l.version,
              customer_id: p.customer ?? null,
              project_id: null,
              project_name: l.name,
              acknowledge_duplicate: false,
            }}
            fields={[
              {
                key: 'customer_id',
                label: 'Customer',
                nullable: true,
                options: [
                  { value: '', label: 'Create new customer' },
                  ...Array.from(
                    new Map(
                      [
                        ...matches.customers.map((c) => ({
                          value: c.id,
                          label: c.display_name,
                        })),
                        ...customers.rows.map((c) => ({
                          value: c.id,
                          label: c.display_name ?? '',
                        })),
                        ...(p.customer
                          ? [{ value: p.customer, label: 'Selected customer' }]
                          : []),
                      ].map((c) => [c.value, c]),
                    ).values(),
                  ),
                ],
              },
              {
                key: 'project_id',
                label: 'Project (search requires selecting customer above)',
                nullable: true,
                options: [
                  { value: '', label: 'Create new project' },
                  ...(projects?.rows ?? []).map((r) => ({
                    value: r.id,
                    label: r.name ?? '',
                  })),
                ],
              },
              {
                key: 'project_name',
                label: 'New project name',
                required: true,
              },
              {
                key: 'acknowledge_duplicate',
                label:
                  'I reviewed possible matches and intentionally want a new customer if selected',
                type: 'checkbox',
              },
            ]}
          />
        </>
      )}
    </main>
  );
}
