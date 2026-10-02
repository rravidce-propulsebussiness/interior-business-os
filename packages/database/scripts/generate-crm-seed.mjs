import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const data = JSON.parse(
  readFileSync(
    new URL('../industry-interior/src/crm-starter.json', root),
    'utf8',
  ),
);
const literal = (s) => "'" + s.replaceAll("'", "''") + "'";
const key = (s) => s.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_');
let sql = `-- Generated Interior CRM development starter. Never creates Auth users.\nbegin;\ndo $$declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';actor uuid='11111111-1111-4111-8111-111111111111';industry uuid;lead uuid=private.seed_uuid('business-os:demo:rahul');begin\nif not exists(select 1 from public.organization_memberships where organization_id=org and user_id=actor and status='active') then raise notice 'CRM seed skipped: demo Owner absent';return;end if;\nperform set_config('request.jwt.claim.sub',actor::text,true);\nselect id into industry from public.industries where key='interior_design';\n`;
for (const [table, values] of [
  ['lead_sources', data.sources],
  ['crm_pipeline_stages', data.stages],
  ['crm_lost_reasons', data.lostReasons],
]) {
  values.forEach((name, i) => {
    const outcome = name === 'Won' ? 'won' : name === 'Lost' ? 'lost' : 'open';
    sql += `insert into public.${table}(id,organization_id,key,name,sort_order${table === 'crm_pipeline_stages' ? ',outcome' : ''}) values(private.seed_uuid('business-os:demo:${table}:${key(name)}'),org,${literal(key(name))},${literal(name)},${i}${table === 'crm_pipeline_stages' ? ',' + literal(outcome) : ''}) on conflict(organization_id,key) do nothing;\n`;
  });
}
for (const [i, f] of data.requirements.entries())
  sql += `insert into public.crm_requirement_fields(id,organization_id,key,name,sort_order,industry_id,field_type,options) values(private.seed_uuid('business-os:demo:requirement:${f.key}'),org,${literal(f.key)},${literal(f.name)},${i},industry,${literal(f.type)},${literal(JSON.stringify(f.options ?? []))}::jsonb) on conflict(organization_id,key) do nothing;\n`;
sql += `insert into public.leads(id,organization_id,lead_number,name,phone,source_id,stage_id,industry_id,budget_min,budget_max,assigned_to,notes,requirements) values(lead,org,'DEMO-L-RAHUL','Rahul Residence','+1 202 555 0147',private.seed_uuid('business-os:demo:lead_sources:referral'),private.seed_uuid('business-os:demo:crm_pipeline_stages:site_visit_completed'),industry,1500000,2000000,actor,'Prepare quotation after site visit. Demo budget only.','{"property_type":"Apartment","project_scope":"Full Interior"}') on conflict(id) do nothing;
insert into public.lead_followups(id,organization_id,lead_id,assigned_to,due_at,followup_type,note) values(private.seed_uuid('business-os:demo:rahul-followup'),org,lead,actor,'2026-10-01T05:30:00Z','quotation','Prepare quotation') on conflict(id) do nothing;
update public.leads set next_follow_up_at=(select min(due_at) from public.lead_followups where lead_id=lead and status='pending') where id=lead;
end$$;commit;\n`;
const target = new URL('supabase/seed-crm.sql', root);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== sql)
    throw new Error('CRM seed drift');
  console.log('CRM seed matches Interior starter.');
} else writeFileSync(target, sql);
