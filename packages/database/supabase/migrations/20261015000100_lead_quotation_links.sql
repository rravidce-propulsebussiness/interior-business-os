-- Associate pre-sale CRM leads with quotations without converting the lead.
-- A quotation may create a planning project, but customer conversion still
-- follows the existing Closed-Won workflow.
begin;

create table if not exists private.lead_quotation_links (
  organization_id uuid not null,
  lead_id uuid not null references public.leads(id),
  quotation_id uuid not null references public.quotations(id),
  project_id uuid not null references public.projects(id),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  primary key (organization_id, quotation_id)
);
create index if not exists lead_quotation_links_by_lead
  on private.lead_quotation_links (organization_id, lead_id, created_at desc);
revoke all on private.lead_quotation_links from public, anon, authenticated;
alter table private.lead_quotation_links enable row level security;
alter table private.lead_quotation_links force row level security;

create or replace function public.lead_quotation_link(
 p_organization_id uuid, p_lead_id uuid, p_quotation_id uuid, p_project_id uuid
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(private.has_permission(p_organization_id,'quotation.create'), false)
     or not coalesce(private.has_permission(p_organization_id,'lead.view'), false) then
    raise exception 'Not authorized to link this lead and quotation' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.leads
    where organization_id=p_organization_id and id=p_lead_id
  ) or not exists (
    select 1 from public.quotations
    where organization_id=p_organization_id
      and id=p_quotation_id and project_id=p_project_id
  ) or not exists (
    select 1 from public.projects
    where organization_id=p_organization_id and id=p_project_id
  ) then
    raise exception 'Lead, quotation or project is not in this company' using errcode='42501';
  end if;
  insert into private.lead_quotation_links
    (organization_id,lead_id,quotation_id,project_id,created_by)
  values
    (p_organization_id,p_lead_id,p_quotation_id,p_project_id,auth.uid())
  on conflict (organization_id,quotation_id) do nothing;
  if not exists (
    select 1 from private.lead_quotation_links
    where organization_id=p_organization_id and quotation_id=p_quotation_id
      and lead_id=p_lead_id and project_id=p_project_id
  ) then
    raise exception 'This quotation already belongs to another lead' using errcode='23505';
  end if;
end; $$;

create or replace function public.lead_quotation_list(
 p_organization_id uuid, p_lead_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not coalesce(private.has_permission(p_organization_id,'lead.view'), false)
     or not coalesce(private.has_permission(p_organization_id,'quotation.view'), false)
     or not exists (
       select 1 from public.leads
       where organization_id=p_organization_id and id=p_lead_id
     ) then
    raise exception 'Not authorized to view lead quotations' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'quotation_id',q.id,
    'quotation_number',q.quotation_number,
    'revision_id',r.id,
    'status',r.status,
    'response',coalesce(resp.action,'not_responded'),
    'project_id',q.project_id
  ) order by l.created_at desc),'[]'::jsonb)
  into result
  from private.lead_quotation_links l
  join public.quotations q
    on q.id=l.quotation_id and q.organization_id=l.organization_id
  join public.quotation_revisions r
    on r.id=q.current_revision_id and r.organization_id=q.organization_id
  left join public.quotation_customer_responses resp
    on resp.revision_id=r.id and resp.organization_id=q.organization_id
  where l.organization_id=p_organization_id and l.lead_id=p_lead_id;
  return result;
end; $$;

create or replace function public.lead_quotation_summary(
 p_organization_id uuid, p_lead_ids uuid[]
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not coalesce(private.has_permission(p_organization_id,'lead.view'), false)
     or not coalesce(private.has_permission(p_organization_id,'quotation.view'), false) then
    raise exception 'Not authorized to view lead quotations' using errcode='42501';
  end if;
  if coalesce(array_length(p_lead_ids,1),0)>100 then
    raise exception 'Too many leads';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lead_id',l.lead_id,'revision_id',r.id,'status',r.status,
    'quotation_number',q.quotation_number
  )),'[]'::jsonb) into result
  from private.lead_quotation_links l
  join public.leads lead
    on lead.id=l.lead_id and lead.organization_id=p_organization_id
  join public.quotations q
    on q.id=l.quotation_id and q.organization_id=l.organization_id
  join public.quotation_revisions r
    on r.id=q.current_revision_id and r.organization_id=q.organization_id
  where l.organization_id=p_organization_id and l.lead_id=any(p_lead_ids);
  return result;
end; $$;

revoke all on function public.lead_quotation_link(uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.lead_quotation_list(uuid,uuid) from public, anon;
revoke all on function public.lead_quotation_summary(uuid,uuid[]) from public, anon;
grant execute on function public.lead_quotation_link(uuid,uuid,uuid,uuid),
 public.lead_quotation_list(uuid,uuid),public.lead_quotation_summary(uuid,uuid[])
 to authenticated;
commit;
