-- Preserve a memorable project name when a Won lead is converted.
-- The quotation may already own a provisional project named
-- "Quotation · Construction · L-...", which must not become the delivery name.
-- Never rename intentionally named real projects.
create or replace function private.crm_rename_auto_quotation_project_on_win()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.lifecycle = 'won'
     and new.converted_at is not null
     and new.converted_project_id is not null
     and new.converted_customer_id is not null
     and new.converted_project_id is distinct from old.converted_project_id
     and length(btrim(coalesce(new.name, ''))) between 1 and 200 then
    update public.projects p
       set name = btrim(new.name)
     where p.organization_id = new.organization_id
       and p.id = new.converted_project_id
       and p.customer_id = new.converted_customer_id
       and p.removed_from_workspace = false
       and p.name like 'Quotation · %';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_won_lead_project_short_name on public.leads;
create trigger crm_won_lead_project_short_name
after update of converted_project_id on public.leads
for each row execute function private.crm_rename_auto_quotation_project_on_win();

-- Repair only previously converted, uniquely linked auto-generated names.
-- Do not alter customer-chosen titles such as "Jashwanth Kumar · G+3".
with converted as (
  select p.organization_id, p.id, max(btrim(l.name)) as lead_name
  from public.projects p
  join public.leads l
    on l.organization_id = p.organization_id
   and l.converted_project_id = p.id
   and l.converted_customer_id = p.customer_id
   and l.lifecycle = 'won'
  where p.name like 'Quotation · %'
    and p.removed_from_workspace = false
    and length(btrim(coalesce(l.name, ''))) between 1 and 200
  group by p.organization_id, p.id
  having count(*) = 1
)
update public.projects p
   set name = converted.lead_name
  from converted
 where p.organization_id = converted.organization_id
   and p.id = converted.id;
