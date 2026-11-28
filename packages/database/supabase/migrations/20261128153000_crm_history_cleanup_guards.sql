-- Retention must preserve the owner-confirmed reset exception. A purge flag
-- must not turn off append-only protection for unrelated history or tenants.
create or replace function private.crm_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('business_os.test_reset_org', true), '') = old.organization_id::text
       and private.owner_test_reset_allowed(old.organization_id) then
      return old;
    end if;
    if tg_table_schema = 'public' and tg_table_name = 'lead_activities'
       and current_user = pg_catalog.pg_get_userbyid((
         select proowner from pg_catalog.pg_proc
         where oid = 'private.purge_expired_archived_leads()'::regprocedure
       )) then
      if current_setting('business_os.retention_lead', true) = old.lead_id::text
         and exists (
           select 1 from public.leads l
           where l.id = old.lead_id and l.organization_id = old.organization_id
             and l.lifecycle = 'archived'
             and l.archived_at < now() - interval '7 days'
         ) then
        return old;
      end if;
    end if;
  end if;
  raise exception 'Append-only record' using errcode = '23514';
end $$;

create or replace function private.purge_expired_archived_leads()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
  previous_lead text := coalesce(current_setting('business_os.retention_lead', true), '');
begin
  -- Lock each candidate before checking expiry, so a concurrent restore wins
  -- before selection or waits for this transaction. Concurrent workers skip it.
  for r in
    select id, organization_id from public.leads
    where lifecycle = 'archived' and archived_at < now() - interval '7 days'
    for update skip locked
  loop
    perform set_config('business_os.retention_lead', r.id::text, true);
    delete from public.meta_lead_events where organization_id = r.organization_id and lead_id = r.id;
    delete from public.lead_followups where organization_id = r.organization_id and lead_id = r.id;
    delete from public.site_visits where organization_id = r.organization_id and lead_id = r.id;
    delete from public.lead_activities where organization_id = r.organization_id and lead_id = r.id;
    delete from public.leads where organization_id = r.organization_id and id = r.id;
    n := n + 1;
  end loop;
  perform set_config('business_os.retention_lead', previous_lead, true);
  return n;
end $$;
revoke all on function private.purge_expired_archived_leads() from public, anon, authenticated;
grant execute on function private.purge_expired_archived_leads() to service_role;
