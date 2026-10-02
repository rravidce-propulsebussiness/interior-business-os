import { CommercialResponseStatus } from '../../commercial/response-status';
import { ProjectCommercial } from '../../finance/handoff';
import { OriginLeads } from '../../commercial/origin-leads';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { commercialServices } from '../../commercial/service';
import { MasterForm } from '../../commercial/master-form';
export default async function Project({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    s = await commercialServices('project.view', 'projects', true);
  const { data: p, error } = await s.client
    .from('projects')
    .select('*')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (error || !p) notFound();
  const { data: areas } = await s.client
    .from('project_areas')
    .select('*')
    .eq('organization_id', s.org)
    .eq('project_id', id)
    .order('sort_order')
    .order('id')
    .limit(250);
  const canManage = s.allowed('project.manage', 'projects');
  const branches = canManage ? await s.repository.branches(s.org) : [];
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-6">
      <Link href="/dashboard/projects">Projects</Link>
      <h1 className="my-6 text-3xl">{p.name}</h1>
      {s.allowed('execution.view', 'projects') && (
        <Link
          className="my-4 mr-4 inline-block underline"
          href={`/dashboard/operations?project=${id}`}
        >
          Site execution
        </Link>
      )}
      {s.allowed('estimate.view', 'projects') && (
        <Link
          className="my-4 inline-block underline"
          href={`/dashboard/execution?project=${id}`}
        >
          Execution
        </Link>
      )}
      <OriginLeads projectId={id} />
      <CommercialResponseStatus projectId={id} />
      <ProjectCommercial projectId={id} />
      <p>
        {p.code} · {p.status}
      </p>
      {s.allowed('quotation.create', 'quotation') && (
        <Link
          className="underline"
          href={`/dashboard/quotations?project=${id}`}
        >
          Create quotation
        </Link>
      )}
      {canManage && (
        <details>
          <summary>Edit project</summary>
          <MasterForm
            entity="projects"
            title="Save project"
            initial={p}
            fields={[
              { key: 'name', label: 'Name', required: true },
              { key: 'code', label: 'Project code', required: true },
              { key: 'project_type', label: 'Project type' },
              {
                key: 'branch_id',
                label: 'Branch',
                nullable: true,
                options: [
                  { value: '', label: 'Organization' },
                  ...branches.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  })),
                ],
              },
              ...[
                'line1',
                'line2',
                'city',
                'region',
                'postal_code',
                'country_code',
              ].map((key) => ({
                key: `site_address.${key}`,
                label: `Site ${key.replaceAll('_', ' ')}`,
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
        </details>
      )}
      <h2 className="mt-8 text-2xl">Rooms and areas</h2>
      {!areas?.length && <p>No areas yet.</p>}
      {areas?.map((area) => (
        <details key={area.id} className="my-4 rounded border p-3">
          <summary>
            {area.sort_order}. {area.name}
          </summary>
          {canManage ? (
            <MasterForm
              entity="project_areas"
              title="Save area"
              initial={area}
              fields={[
                { key: 'name', label: 'Area name', required: true },
                { key: 'area_type', label: 'Type' },
                {
                  key: 'parent_id',
                  label: 'Parent area',
                  nullable: true,
                  options: [
                    { value: '', label: 'None' },
                    ...(areas ?? [])
                      .filter((parent) => parent.id !== area.id)
                      .map((parent) => ({
                        value: parent.id,
                        label: parent.name,
                      })),
                  ],
                },
                { key: 'sort_order', label: 'Order', type: 'number' },
                { key: 'notes', label: 'Internal notes', type: 'textarea' },
              ]}
            />
          ) : (
            <p>{area.area_type}</p>
          )}
        </details>
      ))}
      {canManage && (
        <details>
          <summary>Add area</summary>
          <MasterForm
            entity="project_areas"
            title="Create area"
            initial={{
              organization_id: s.org,
              version: 1,
              project_id: id,
              parent_id: null,
              name: '',
              code: '',
              area_type: '',
              sort_order: areas?.length ?? 0,
              notes: '',
              status: 'active',
            }}
            fields={[
              { key: 'name', label: 'Area name', required: true },
              { key: 'area_type', label: 'Type' },
              { key: 'sort_order', label: 'Order', type: 'number' },
            ]}
          />
        </details>
      )}
    </main>
  );
}
