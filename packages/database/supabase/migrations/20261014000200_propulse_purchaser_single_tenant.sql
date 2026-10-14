-- One purchasing ProPulse account may deliver purchased lead PII to only
-- one Business OS organization. Accounts with an existing ambiguous pairing
-- must be resolved by a super admin; never silently copy purchased leads.
begin;
do $$
begin
  if exists (
    select 1 from public.propulse_lead_connections
    group by propulse_subject having count(distinct organization_id)>1
  ) then
    raise exception 'Existing ProPulse purchaser is connected to multiple organizations. Resolve before enabling paid lead sync.';
  end if;
end$$;
create unique index if not exists propulse_lead_connections_one_purchaser
  on public.propulse_lead_connections (propulse_subject);
commit;
