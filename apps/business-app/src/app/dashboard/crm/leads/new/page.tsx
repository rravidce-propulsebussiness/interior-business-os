import { crmServices, optionRows } from '../../service';
import {
  emptyAddress,
  leadFields,
  lookups,
  LookupSearch,
  type Params,
} from '../../lookups';
import { MasterForm, type Field } from '../../../commercial/master-form';
import { checkDuplicates, saveCrm } from '../../actions';
export default async function NewLead({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const p = await searchParams,
    s = await crmServices('lead.create', true),
    choices = await lookups(s, p);
  const industry =
    choices.industries.find((i) => i.id === p.industry && i.status === 'active')
      ?.id ?? null;
  const requirements: Field[] = choices.requirements.rows
    .filter((r) => !r.industry_id || r.industry_id === industry)
    .map((r) => ({
      key: 'requirements.' + String(r.key),
      label: String(r.name),
      required: Boolean(r.required),
      type:
        r.field_type === 'boolean'
          ? 'checkbox'
          : r.field_type === 'number'
            ? 'number'
            : 'text',
      ...(r.field_type === 'select'
        ? {
            options: [
              { value: '', label: 'Not specified' },
              ...(Array.isArray(r.options) ? r.options : []).map((v) => ({
                value: String(v),
                label: String(v),
              })),
            ],
          }
        : {}),
    }));
  const open = choices.stages.rows.filter((r) => r.outcome === 'open');
  return (
    <main id="main-content" className="mx-auto max-w-4xl p-6">
      <h1 className="text-3xl font-semibold">New lead</h1>
      <p>
        Capture the enquiry now. Add site details and follow-ups in the lead
        workspace.
      </p>
      <form className="my-4 flex flex-wrap gap-3">
        <label>
          Industry requirements{' '}
          <select
            name="industry"
            defaultValue={industry ?? ''}
            className="rounded border p-2"
          >
            <option value="">General requirements</option>
            {choices.industries
              .filter((i) => i.status === 'active')
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <button className="min-h-11 rounded border p-2">
          Load requirement fields
        </button>
      </form>
      <LookupSearch />
      {!choices.sources.rows.length || !open.length ? (
        <p>
          Configure an active source and open pipeline stage in CRM
          configuration first.
        </p>
      ) : (
        <MasterForm
          title="Create lead"
          submitAction={saveCrm.bind(null, 'leads')}
          successPath="/dashboard/crm/leads/:id"
          initial={{
            acknowledge_duplicate: false,
            name: '',
            phone: '',
            email: '',
            source_id: choices.sources.rows[0]?.id,
            stage_id: open[0]?.id,
            assigned_to: null,
            industry_id: industry,
            site_address: emptyAddress,
            budget_min: null,
            budget_max: null,
            expected_start_date: null,
            notes: '',
            priority: 'normal',
            requirements: {},
          }}
          fields={[
            ...leadFields(choices),
            ...requirements,
            {
              key: 'acknowledge_duplicate',
              label:
                'I reviewed possible matches and intentionally want to create this lead',
              type: 'checkbox',
            },
            {
              key: 'stage_id',
              label: 'Initial stage',
              options: optionRows(open),
            },
            {
              key: 'assigned_to',
              label: 'Assigned salesperson',
              nullable: true,
              options: [
                { value: '', label: 'Unassigned' },
                ...optionRows(choices.team),
              ],
            },
          ]}
        />
      )}
      <details>
        <summary>Check possible existing lead/customer</summary>
        <MasterForm
          submitAction={checkDuplicates}
          title="Check for matches"
          initial={{ phone: '', email: '' }}
          fields={[
            { key: 'phone', label: 'Phone', type: 'tel' },
            { key: 'email', label: 'Email', type: 'email' },
          ]}
        />
      </details>
    </main>
  );
}
