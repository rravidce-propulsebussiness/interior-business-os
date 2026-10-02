import {
  commercialSearchResultSchema,
  emptyAddress,
  searchSchema,
} from '@business-os/core/commercial';
import { commercialServices } from '../commercial/service';
import { MasterForm } from '../commercial/master-form';
import { SearchList } from '../commercial/list';
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; customer?: string }>;
}) {
  const params = await searchParams,
    filter = searchSchema.parse({
      query: params.q ?? '',
      page: Number(params.page ?? 1),
      status: '',
      parent_id: params.customer ?? null,
    });
  const s = await commercialServices('project.view', 'projects', true),
    result = commercialSearchResultSchema.parse(
      await s.commercial.search(
        s.org,
        'projects',
        filter.query,
        filter.page,
        '',
        filter.parent_id,
      ),
    );
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-6">
      <SearchList
        title="Projects"
        path="/dashboard/projects"
        query={filter.query}
        page={filter.page}
        total={result.total}
        rows={result.rows.map((r) => ({
          id: r.id,
          label: r.name ?? '',
          detail: r.status,
        }))}
      />
      {filter.parent_id && s.allowed('project.create', 'projects') ? (
        <details className="my-6">
          <summary>Create project for selected customer</summary>
          <MasterForm
            entity="projects"
            title="Create project"
            initial={{
              organization_id: s.org,
              version: 1,
              customer_id: filter.parent_id,
              name: '',
              code: '',
              industry_id: null,
              branch_id: null,
              project_type: '',
              site_address: emptyAddress,
              status: 'active',
              notes: '',
              assigned_user_id: null,
            }}
            fields={[
              { key: 'name', label: 'Project name', required: true },
              { key: 'code', label: 'Unique project code', required: true },
              { key: 'project_type', label: 'Project type' },
              { key: 'notes', label: 'Internal notes', type: 'textarea' },
            ]}
          />
        </details>
      ) : (
        <p className="my-6">Open a customer to create a project for them.</p>
      )}
    </main>
  );
}
