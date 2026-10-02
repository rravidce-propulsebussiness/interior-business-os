import Link from 'next/link';
import { notFound } from 'next/navigation';
import { idSchema } from '@business-os/shared';
import { crmSchemas } from '@business-os/core/crm';
import { MasterForm, type Field } from '../../../commercial/master-form';
import { crmServices, resultSchema, optionRows } from '../../service';
import {
  lookups,
  LookupSearch,
  leadFields,
  pageNumber,
  type Params,
} from '../../lookups';
import { runCrmCommand, saveCrm } from '../../actions';
import { Pagination } from '../../pagination';
export default async function LeadDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await params;
  idSchema.parse(id);
  const p = await searchParams,
    s = await crmServices('lead.view', true);
  const { data: l, error } = await s.client
    .from('leads')
    .select('*')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (error || !l) notFound();
  const [choices, activity, followups, visits] = await Promise.all([
    lookups(s, p),
    s.crm.search('lead_activities', { lead_id: id }, pageNumber(p.page)),
    s.crm.search(
      'lead_followups',
      { lead_id: id, status: 'pending' },
      pageNumber(p.followup_page),
    ),
    s.crm.search('site_visits', { lead_id: id }, pageNumber(p.visit_page)),
  ]);
  const timeline = resultSchema.parse(activity),
    tasks = resultSchema.parse(followups),
    siteVisits = resultSchema.parse(visits);
  const initial: Record<string, unknown> = Object.fromEntries(
    Object.keys(crmSchemas.leads.shape)
      .filter((k) => k in l && !['assigned_to', 'stage_id'].includes(k))
      .map((k) => [k, l[k as keyof typeof l]]),
  );
  initial.budget_min = l.budget_min === null ? null : String(l.budget_min);
  initial.budget_max = l.budget_max === null ? null : String(l.budget_max);
  const staff = [
    { value: '', label: 'Choose assignee' },
    ...optionRows(choices.team),
  ];
  const requirementFields: Field[] = choices.requirements.rows
    .filter((r) => !r.industry_id || r.industry_id === l.industry_id)
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
  return (
    <main id="main-content" className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl font-semibold">{l.name}</h1>
      <p>
        {l.lead_number} · {l.lifecycle} · {l.priority} priority
      </p>
      <a
        className="my-3 inline-block min-h-11 underline"
        href={'tel:' + l.phone_normalized}
      >
        Call {l.phone}
      </a>
      <p>
        {l.email} · {l.location}
      </p>
      <p>
        Budget: {l.budget_min ?? 'Not specified'} –{' '}
        {l.budget_max ?? 'Not specified'}
      </p>
      <p>
        Next follow-up:{' '}
        {l.next_follow_up_at
          ? new Date(l.next_follow_up_at).toLocaleString()
          : 'Not scheduled'}
      </p>
      <p className="whitespace-pre-wrap">{l.notes}</p>
      <LookupSearch />
      {l.converted_project_id ? (
        <section className="my-6 rounded border p-4">
          <h2 className="text-xl font-semibold">Converted</h2>
          <div className="flex flex-wrap gap-5">
            <Link
              className="underline"
              href={'/dashboard/customers/' + l.converted_customer_id}
            >
              Customer
            </Link>
            <Link
              className="underline"
              href={'/dashboard/projects/' + l.converted_project_id}
            >
              Project and related quotations
            </Link>
            {s.allowed('quotation.create', 'quotation') && (
              <Link
                className="underline"
                href={'/dashboard/quotations?project=' + l.converted_project_id}
              >
                Create quotation
              </Link>
            )}
          </div>
        </section>
      ) : (
        s.allowed('lead.convert') &&
        l.lifecycle === 'open' && (
          <Link
            className="my-4 inline-block rounded border p-3"
            href={'/dashboard/crm/leads/' + id + '/convert'}
          >
            Convert lead
          </Link>
        )
      )}
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-2xl font-semibold">Daily actions</h2>
          {s.allowed('crm.activity.create') && (
            <details open>
              <summary>Add note or communication record</summary>
              <MasterForm
                title="Add activity"
                submitAction={saveCrm.bind(null, 'lead_activities')}
                initial={{
                  lead_id: id,
                  activity_type: 'note',
                  subject: '',
                  body: '',
                }}
                fields={[
                  {
                    key: 'activity_type',
                    label: 'Activity type',
                    options: [
                      'note',
                      'phone_call',
                      'meeting',
                      'email_note',
                      'whatsapp_note',
                    ].map((value) => ({
                      value,
                      label: value.replaceAll('_', ' '),
                    })),
                  },
                  { key: 'subject', label: 'Subject' },
                  {
                    key: 'body',
                    label: 'Activity note',
                    type: 'textarea',
                    required: true,
                  },
                ]}
              />
            </details>
          )}
          {s.allowed('lead.assign') && (
            <details>
              <summary>Assign salesperson</summary>
              <MasterForm
                title="Assign lead"
                submitAction={runCrmCommand}
                initial={{
                  action: 'assign',
                  id,
                  version: l.version,
                  assigned_to: l.assigned_to,
                }}
                fields={[
                  {
                    key: 'assigned_to',
                    label: 'Assignee',
                    nullable: true,
                    options: [
                      { value: '', label: 'Unassigned' },
                      ...optionRows(choices.team),
                    ],
                  },
                ]}
              />
            </details>
          )}
          {s.allowed('lead.manage') && (
            <details>
              <summary>Change stage</summary>
              <MasterForm
                title="Change stage"
                submitAction={runCrmCommand}
                initial={{
                  action: 'stage',
                  id,
                  version: l.version,
                  stage_id: l.stage_id,
                  lost_reason_id: null,
                  note: '',
                }}
                fields={[
                  {
                    key: 'stage_id',
                    label: 'Stage',
                    options: optionRows(
                      choices.stages.rows.filter(
                        (r) => r.outcome !== 'won' || s.allowed('lead.win'),
                      ),
                    ),
                  },
                  {
                    key: 'lost_reason_id',
                    label: 'Lost reason (required for Lost)',
                    nullable: true,
                    options: [
                      { value: '', label: 'Not applicable' },
                      ...optionRows(choices.reasons.rows),
                    ],
                  },
                  {
                    key: 'note',
                    label: 'Outcome note (required for Won)',
                    type: 'textarea',
                  },
                ]}
              />
            </details>
          )}
          {s.allowed('crm.followup.manage') && (
            <details>
              <summary>Schedule follow-up</summary>
              <MasterForm
                title="Schedule follow-up"
                submitAction={saveCrm.bind(null, 'lead_followups')}
                initial={{
                  lead_id: id,
                  assigned_to: l.assigned_to ?? '',
                  due_at: '',
                  followup_type: 'call',
                  note: '',
                }}
                fields={[
                  {
                    key: 'assigned_to',
                    label: 'Follow-up assignee',
                    required: true,
                    options: staff,
                  },
                  {
                    key: 'due_at',
                    label: 'Due at (your local time)',
                    type: 'datetime-local',
                    required: true,
                  },
                  {
                    key: 'followup_type',
                    label: 'Type',
                    options: ['call', 'meeting', 'quotation', 'other'].map(
                      (value) => ({ value, label: value }),
                    ),
                  },
                  { key: 'note', label: 'Follow-up note', type: 'textarea' },
                ]}
              />
            </details>
          )}
          {s.allowed('crm.site_visit.manage') && (
            <details>
              <summary>Schedule site visit</summary>
              <MasterForm
                title="Schedule site visit"
                submitAction={saveCrm.bind(null, 'site_visits')}
                initial={{
                  lead_id: id,
                  assigned_to: l.assigned_to ?? '',
                  scheduled_at: '',
                  site_address: l.site_address,
                  contact_person: l.name,
                  notes: '',
                }}
                fields={[
                  {
                    key: 'assigned_to',
                    label: 'Visit assignee',
                    required: true,
                    options: staff,
                  },
                  {
                    key: 'scheduled_at',
                    label: 'Scheduled at (your local time)',
                    type: 'datetime-local',
                    required: true,
                  },
                  { key: 'contact_person', label: 'Contact person' },
                  ...[
                    'line1',
                    'line2',
                    'city',
                    'region',
                    'postal_code',
                    'country_code',
                  ].map((k) => ({
                    key: 'site_address.' + k,
                    label: 'Site ' + k.replaceAll('_', ' '),
                  })),
                  { key: 'notes', label: 'Visit notes', type: 'textarea' },
                ]}
              />
            </details>
          )}
          <h2 className="mt-6 text-xl font-semibold">Pending follow-ups</h2>
          {!tasks.rows.length && <p>No pending follow-ups.</p>}
          {tasks.rows.map((f) => (
            <article key={String(f.id)} className="my-3 rounded border p-4">
              <p>
                {String(f.followup_type)} ·{' '}
                {new Date(String(f.due_at)).toLocaleString()}
              </p>
              <p>{String(f.note)}</p>
              {s.allowed('crm.followup.manage') && (
                <MasterForm
                  title="Update follow-up"
                  submitAction={runCrmCommand}
                  initial={{
                    action: 'followup',
                    id: f.id,
                    version: f.version,
                    status: 'completed',
                    outcome: '',
                  }}
                  fields={[
                    {
                      key: 'status',
                      label: 'Follow-up action',
                      options: [
                        { value: 'completed', label: 'Complete' },
                        { value: 'cancelled', label: 'Cancel' },
                      ],
                    },
                    { key: 'outcome', label: 'Outcome' },
                  ]}
                />
              )}
            </article>
          ))}
          {tasks.total > 25 && (
            <Link href={'/dashboard/crm/followups?lead_id=' + id}>
              View all follow-ups
            </Link>
          )}
          <h2 className="mt-6 text-xl font-semibold">Site visits</h2>
          {!siteVisits.rows.length && <p>No site visits.</p>}
          {siteVisits.rows.map((v) => (
            <article key={String(v.id)} className="my-3 rounded border p-4">
              <p>
                {new Date(String(v.scheduled_at)).toLocaleString()} ·{' '}
                {String(v.status)}
              </p>
              <p className="whitespace-pre-wrap">
                {String(v.notes)} {String(v.outcome)}
              </p>
              {s.allowed('crm.site_visit.manage') &&
                !['completed', 'cancelled'].includes(String(v.status)) && (
                  <MasterForm
                    title="Record visit"
                    submitAction={runCrmCommand}
                    initial={{
                      action: 'visit',
                      id: v.id,
                      version: v.version,
                      status: 'completed',
                      scheduled_at: null,
                      notes: v.notes,
                      outcome: '',
                    }}
                    fields={[
                      {
                        key: 'status',
                        label: 'Visit action',
                        options: ['completed', 'cancelled', 'rescheduled'].map(
                          (value) => ({ value, label: value }),
                        ),
                      },
                      {
                        key: 'scheduled_at',
                        label: 'New date for reschedule',
                        type: 'datetime-local',
                        nullable: true,
                      },
                      {
                        key: 'notes',
                        label:
                          'Observations, approximate dimensions, access and preferences',
                        type: 'textarea',
                      },
                      {
                        key: 'outcome',
                        label: 'Visit outcome',
                        type: 'textarea',
                      },
                    ]}
                  />
                )}
            </article>
          ))}
          {siteVisits.total > 25 && (
            <Link href={'/dashboard/crm/site-visits?lead_id=' + id}>
              View all visits
            </Link>
          )}
        </section>
        <section>
          <h2 className="text-2xl font-semibold">Activity timeline</h2>
          {!timeline.rows.length && <p>No activity yet.</p>}
          <ol className="my-4 grid gap-4">
            {timeline.rows.map((a) => (
              <li key={String(a.id)} className="border-l-2 pl-4">
                <p className="font-medium">
                  {String(a.subject || a.activity_type).replaceAll('_', ' ')}{' '}
                  {a.system_generated ? '(system)' : ''}
                </p>
                <time>{new Date(String(a.occurred_at)).toLocaleString()}</time>
                <p className="whitespace-pre-wrap">{String(a.body)}</p>
              </li>
            ))}
          </ol>
          <Pagination
            path={'/dashboard/crm/leads/' + id}
            params={p}
            page={pageNumber(p.page)}
            total={timeline.total}
          />
        </section>
      </div>
      {s.allowed('lead.manage') && l.lifecycle !== 'archived' && (
        <>
          <details className="my-6">
            <summary>Edit lead details and requirements</summary>
            <MasterForm
              title="Save lead details"
              submitAction={saveCrm.bind(null, 'leads')}
              initial={initial}
              fields={[...leadFields(choices, true), ...requirementFields]}
            />
          </details>
          <details>
            <summary>Archive lead</summary>
            <p>
              Keep its conversion and activity history. Archived leads cannot be
              edited.
            </p>
            <MasterForm
              title="Archive lead"
              submitAction={runCrmCommand}
              initial={{ action: 'archive', id, version: l.version }}
              fields={[]}
            />
          </details>
        </>
      )}
    </main>
  );
}
