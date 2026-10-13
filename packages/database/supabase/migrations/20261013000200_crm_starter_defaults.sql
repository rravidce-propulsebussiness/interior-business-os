-- Every tenant needs a manual source and an open stage before creating leads.
-- Development/demo CRM seeds do NOT run in production. Provision a compact,
-- idempotent starter for existing companies and all future company signups.
-- Never recreate a manually deactivated key or overwrite custom workflows.
begin;

create function private.crm_seed_starter_defaults(p_organization_id uuid)
returns void language plpgsql security definer set search_path = ''
as $crm_defaults$
begin
  if p_organization_id is null then
    raise exception 'Organization required' using errcode = '22023';
  end if;

  insert into public.lead_sources(
    organization_id, key, name, sort_order, active
  )
  select p_organization_id, item.key, item.name, item.sort_order, true
  from (values
    ('manual', 'Manual Entry', 10),
    ('sheet_upload', 'Sheet Upload', 20),
    ('propulse_marketplace', 'ProPulse Marketplace', 30)
  ) as item(key, name, sort_order)
  on conflict(organization_id, key) do nothing;

  insert into public.crm_pipeline_stages(
    organization_id, key, name, sort_order, active, outcome
  )
  select p_organization_id, item.key, item.name, item.sort_order, true,
         item.outcome
  from (values
    ('new', 'New', 10, 'open'),
    ('contacted', 'Contacted', 20, 'open'),
    ('follow_up', 'Follow-up', 30, 'open'),
    ('quotation', 'Quotation', 40, 'open'),
    ('won', 'Won', 50, 'won'),
    ('lost', 'Lost', 60, 'lost')
  ) as item(key, name, sort_order, outcome)
  on conflict(organization_id, key) do nothing;
end
$crm_defaults$;

-- Only the trusted migration/trigger can seed across tenants, not users.
revoke all on function private.crm_seed_starter_defaults(uuid)
  from public, anon, authenticated;

create function private.crm_seed_new_organization()
returns trigger language plpgsql security definer set search_path = ''
as $crm_trigger$
begin
  perform private.crm_seed_starter_defaults(new.id);
  return new;
end
$crm_trigger$;

revoke all on function private.crm_seed_new_organization()
  from public, anon, authenticated;

create trigger crm_seed_new_organization
after insert on public.organizations
for each row execute function private.crm_seed_new_organization();

-- Repair currently registered companies, without touching existing CRM leads,
-- existing keys, custom stage names, source statuses, or tenant permissions.
do $crm_backfill$
declare v_org uuid;
begin
  for v_org in select id from public.organizations loop
    perform private.crm_seed_starter_defaults(v_org);
  end loop;
end
$crm_backfill$;

commit;
