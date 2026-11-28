-- Leads remain recoverable in the recycle bin for seven days, then purge with history.
alter table public.leads add column if not exists archived_at timestamptz;
update public.leads set archived_at=coalesce(archived_at,updated_at) where lifecycle='archived';
create index if not exists leads_archived_retention on public.leads(lifecycle,archived_at) where lifecycle='archived';

create or replace function private.crm_set_archived_at() returns trigger language plpgsql set search_path='' as $$
begin
  if new.lifecycle='archived' and old.lifecycle is distinct from 'archived' then new.archived_at=now();
  elsif new.lifecycle<>'archived' then new.archived_at=null; end if;
  return new;
end $$;
drop trigger if exists set_lead_archived_at on public.leads;
create trigger set_lead_archived_at before update on public.leads for each row execute function private.crm_set_archived_at();

create or replace function private.crm_append_only() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and current_setting('app.lead_purge',true)='on' then return old; end if;
  raise exception 'Append-only record' using errcode='23514';
end $$;

create or replace function private.purge_expired_archived_leads() returns integer language plpgsql security definer set search_path='' as $$
declare r record; n integer:=0;
begin
  for r in select id,organization_id from public.leads where lifecycle='archived' and archived_at < now()-interval '7 days' loop
    perform set_config('app.lead_purge','on',true);
    delete from public.meta_lead_events where lead_id=r.id;
    delete from public.lead_followups where organization_id=r.organization_id and lead_id=r.id;
    delete from public.site_visits where organization_id=r.organization_id and lead_id=r.id;
    delete from public.lead_activities where organization_id=r.organization_id and lead_id=r.id;
    delete from public.leads where organization_id=r.organization_id and id=r.id;
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function private.purge_expired_archived_leads() from public,anon,authenticated;
grant execute on function private.purge_expired_archived_leads() to service_role;
