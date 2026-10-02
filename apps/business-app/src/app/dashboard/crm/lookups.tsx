import { z } from 'zod';
import { type crmServices, optionRows, resultSchema } from './service';
import type { Field } from '../commercial/master-form';
export type Params = Record<string, string | undefined>;
export const pageNumber = (v: string | undefined) =>
  Math.max(1, Math.min(10000, Number.parseInt(v ?? '1', 10) || 1));
export const emptyAddress = {
  line1: '',
  line2: '',
  city: '',
  region: '',
  postal_code: '',
  country_code: '',
};
export async function lookups(
  s: Awaited<ReturnType<typeof crmServices>>,
  p: Params,
) {
  const [sources, stages, team, reasons, requirements, branches, industries] =
    await Promise.all([
      s.crm.search(
        'lead_sources',
        { q: p.source_q ?? '', active: true },
        pageNumber(p.source_page),
      ),
      s.crm.search(
        'crm_pipeline_stages',
        { q: p.stage_q ?? '', active: true },
        pageNumber(p.stage_page),
      ),
      s.crm.assignees(p.team_q ?? '', pageNumber(p.team_page)),
      s.crm.search(
        'crm_lost_reasons',
        { active: true },
        pageNumber(p.reason_page),
      ),
      s.crm.search(
        'crm_requirement_fields',
        { active: true },
        pageNumber(p.requirement_page),
      ),
      s.client
        .from('branches')
        .select('id,name')
        .eq('organization_id', s.org)
        .eq('status', 'active')
        .order('name')
        .range(
          (pageNumber(p.branch_page) - 1) * 25,
          pageNumber(p.branch_page) * 25 - 1,
        ),
      s.repository.industries(),
    ]);
  return {
    sources: resultSchema.parse(sources),
    stages: resultSchema.parse(stages),
    team: z
      .array(
        z.object({
          user_id: z.uuid(),
          full_name: z.string(),
          branch_id: z.uuid().nullable(),
        }),
      )
      .parse(team),
    reasons: resultSchema.parse(reasons),
    requirements: resultSchema.parse(requirements),
    branches: branches.data ?? [],
    industries,
  };
}
export function LookupSearch() {
  return (
    <details className="my-4">
      <summary>Search selector choices</summary>
      <form className="grid max-w-xl gap-3 py-3">
        {[
          ['source', 'Source'],
          ['stage', 'Stage'],
          ['team', 'Assignee'],
        ].map(([key, label]) => (
          <label key={key}>
            {label} search{' '}
            <input name={key + '_q'} className="rounded border p-2" />
            <input
              aria-label={label + ' page'}
              type="number"
              min="1"
              name={key + '_page'}
              defaultValue="1"
              className="ml-2 w-20 rounded border p-2"
            />
          </label>
        ))}
        {['branch', 'reason', 'requirement'].map((key) => (
          <label key={key}>
            {key} choices page{' '}
            <input
              name={key + '_page'}
              type="number"
              min="1"
              defaultValue="1"
              className="w-20 rounded border p-2"
            />
          </label>
        ))}
        <button className="min-h-11 rounded border p-2">Load choices</button>
      </form>
    </details>
  );
}
export function leadFields(
  options: Awaited<ReturnType<typeof lookups>>,
  advanced = false,
): Field[] {
  const fields: Field[] = [
    { key: 'name', label: 'Name', required: true },
    {
      key: 'phone',
      label: 'Phone (include country code when known)',
      type: 'tel',
      required: true,
    },
    { key: 'email', label: 'Email', type: 'email' },
    {
      key: 'source_id',
      label: 'Source',
      options: optionRows(options.sources.rows),
    },
    { key: 'location', label: 'Location' },
    { key: 'budget_min', label: 'Minimum budget', nullable: true },
    { key: 'budget_max', label: 'Maximum budget', nullable: true },
    { key: 'notes', label: 'Requirement summary', type: 'textarea' },
    {
      key: 'priority',
      label: 'Priority',
      options: ['low', 'normal', 'high', 'urgent'].map((value) => ({
        value,
        label: value,
      })),
    },
  ];
  if (advanced)
    fields.push(
      { key: 'company_name', label: 'Company name' },
      { key: 'secondary_phone', label: 'Secondary phone', type: 'tel' },
      { key: 'source_detail', label: 'Source detail' },
      { key: 'service_type', label: 'Project / service type' },
      { key: 'project_size', label: 'Approximate project size' },
      {
        key: 'expected_start_date',
        label: 'Expected start date',
        type: 'date',
        nullable: true,
      },
      {
        key: 'branch_id',
        label: 'Branch',
        nullable: true,
        options: [
          { value: '', label: 'No branch' },
          ...optionRows(options.branches),
        ],
      },
      {
        key: 'industry_id',
        label: 'Industry',
        nullable: true,
        options: [
          { value: '', label: 'Not specified' },
          ...options.industries
            .filter((i) => i.status === 'active')
            .map((i) => ({ value: i.id, label: i.name })),
        ],
      },
      ...Object.keys(emptyAddress).map((key) => ({
        key: 'site_address.' + key,
        label: 'Site ' + key.replaceAll('_', ' '),
      })),
    );
  return fields;
}
